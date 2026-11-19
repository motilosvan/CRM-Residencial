import sql from 'mssql';
import { z } from 'zod';
import { CATEGORIAS, type Categoria } from '../domain/clasificador.js';
import { PRIORIDADES, prioridadPermitida, type Prioridad } from '../domain/priorizador.js';
import { withTx } from '../db/withTx.js';
import { ConflictError, Forbidden, ValidationError } from '../errors.js';
import { truncarUtf16 } from './ingesta.js';
import {
  bloquearSolicitud,
  registrarHistorial,
  validar,
  verificarUsuarioActivo,
  type Actor,
} from './solicitudes.js';

const LIMITE_RESUMEN = 500; // = SUGERENCIAS_IA.resumen NVARCHAR(500)
const LIMITE_JUSTIFICACION = 1000; // = SUGERENCIAS_IA.justificacion NVARCHAR(1000)
const LIMITE_ERROR = 200; // = SUGERENCIAS_IA.ultimoError NVARCHAR(200)

const Origen = {
  idSolicitud: z.number().int().positive(),
  proveedor: z.string().min(1).max(30),
  modelo: z.string().min(1).max(200),
};

export const SugerenciaSchema = z.object({
  ...Origen,
  categoria: z.enum(CATEGORIAS),
  prioridad: z.enum(PRIORIDADES),
  resumen: z.string().trim().min(1).transform((s) => truncarUtf16(s, LIMITE_RESUMEN)),
  justificacion: z.string().trim().default('').transform((s) => truncarUtf16(s, LIMITE_JUSTIFICACION)),
});
export type Sugerencia = z.input<typeof SugerenciaSchema>;

export const FalloSugerenciaSchema = z.object({
  ...Origen,
  /** Descripción sin datos del correo (tipo de error, nunca el contenido). */
  causa: z.string().min(1).transform((s) => truncarUtf16(s, LIMITE_ERROR)),
  maxIntentos: z.number().int().min(1).max(20),
  esperaMinutos: z.number().int().min(1).max(1440),
});
export type FalloSugerencia = z.input<typeof FalloSugerenciaSchema>;

/**
 * T7 — Guarda la sugerencia de IA de una solicitud. Solo toca SUGERENCIAS_IA: ni el estado ni la `version`
 * de la solicitud cambian, así que no compite con lo que un usuario esté haciendo sobre ella. Es idempotente:
 * una sugerencia LISTA no se reemplaza. UPDLOCK+HOLDLOCK cierra la carrera de la primera inserción.
 */
export async function registrarSugerencia(pool: sql.ConnectionPool, entrada: Sugerencia): Promise<void> {
  const s = validar(SugerenciaSchema, entrada);
  await withTx(pool, async (tx) => {
    await tx
      .request()
      .input('id', sql.Int, s.idSolicitud)
      .input('categoria', sql.VarChar(50), s.categoria)
      .input('prioridad', sql.VarChar(20), prioridadPermitida(s.categoria, s.prioridad))
      .input('resumen', sql.NVarChar(LIMITE_RESUMEN), s.resumen)
      .input('justificacion', sql.NVarChar(LIMITE_JUSTIFICACION), s.justificacion)
      .input('proveedor', sql.VarChar(30), s.proveedor)
      .input('modelo', sql.NVarChar(200), s.modelo)
      .query(
        `DECLARE @idCategoria INT = (SELECT idCategoria FROM CATEGORIAS WHERE nombre = @categoria);
         DECLARE @idPrioridad INT = (SELECT idPrioridad FROM PRIORIDADES WHERE nombre = @prioridad);
         UPDATE SUGERENCIAS_IA WITH (UPDLOCK, HOLDLOCK)
            SET estado = 'LISTA', idCategoria = @idCategoria, idPrioridad = @idPrioridad, resumen = @resumen,
                justificacion = @justificacion, proveedor = @proveedor, modelo = @modelo, ultimoError = NULL,
                proximoIntento = NULL, fechaActualizacion = SYSUTCDATETIME()
          WHERE idSolicitud = @id AND estado <> 'LISTA';
         IF @@ROWCOUNT = 0 AND NOT EXISTS (SELECT 1 FROM SUGERENCIAS_IA WITH (UPDLOCK, HOLDLOCK) WHERE idSolicitud = @id)
           INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, idCategoria, idPrioridad, resumen, justificacion, proveedor, modelo)
           VALUES (@id, 'LISTA', @idCategoria, @idPrioridad, @resumen, @justificacion, @proveedor, @modelo);`,
      );
  });
}

/**
 * Registra una respuesta inutilizable del modelo. Programa un reintento o, al agotar `maxIntentos`, deja la
 * fila en FALLIDA: la solicitud sigue con su clasificación por reglas y el worker no vuelve a gastar cuota en ella.
 */
export async function registrarFalloSugerencia(pool: sql.ConnectionPool, entrada: FalloSugerencia): Promise<void> {
  const f = validar(FalloSugerenciaSchema, entrada);
  await withTx(pool, async (tx) => {
    await tx
      .request()
      .input('id', sql.Int, f.idSolicitud)
      .input('proveedor', sql.VarChar(30), f.proveedor)
      .input('modelo', sql.NVarChar(200), f.modelo)
      .input('causa', sql.NVarChar(LIMITE_ERROR), f.causa)
      .input('max', sql.Int, f.maxIntentos)
      .input('espera', sql.Int, f.esperaMinutos)
      .query(
        `UPDATE SUGERENCIAS_IA WITH (UPDLOCK, HOLDLOCK)
            SET intentos = intentos + 1,
                estado = CASE WHEN intentos + 1 >= @max THEN 'FALLIDA' ELSE 'EN_REINTENTO' END,
                proximoIntento = CASE WHEN intentos + 1 >= @max THEN NULL
                                      ELSE DATEADD(MINUTE, @espera, SYSUTCDATETIME()) END,
                proveedor = @proveedor, modelo = @modelo, ultimoError = @causa,
                fechaActualizacion = SYSUTCDATETIME()
          WHERE idSolicitud = @id AND estado <> 'LISTA';
         IF @@ROWCOUNT = 0 AND NOT EXISTS (SELECT 1 FROM SUGERENCIAS_IA WITH (UPDLOCK, HOLDLOCK) WHERE idSolicitud = @id)
           INSERT INTO SUGERENCIAS_IA (idSolicitud, estado, proveedor, modelo, intentos, ultimoError, proximoIntento)
           VALUES (@id, CASE WHEN @max <= 1 THEN 'FALLIDA' ELSE 'EN_REINTENTO' END, @proveedor, @modelo, 1, @causa,
                   CASE WHEN @max <= 1 THEN NULL ELSE DATEADD(MINUTE, @espera, SYSUTCDATETIME()) END);`,
      );
  });
}

const idPositivo = z.number().int().positive();

export const AceptarSugerenciaSchema = z.object({
  idSolicitud: idPositivo,
  idUsuario: idPositivo,
  versionEsperada: idPositivo,
  comentario: z.string().max(300).optional(),
});
export type AceptarSugerencia = z.input<typeof AceptarSugerenciaSchema>;

/**
 * Acepta la sugerencia LISTA de IA aplicándola como reclasificación (T4) con `versionEsperada` y dejando
 * historial. La sugerencia no cambia la solicitud por sí sola: solo el usuario la confirma aquí.
 */
export async function aceptarSugerencia(
  pool: sql.ConnectionPool,
  entrada: AceptarSugerencia,
  actor?: Actor,
) {
  const p = validar(AceptarSugerenciaSchema, entrada);
  return withTx(pool, async (tx) => {
    const sol = await bloquearSolicitud(tx, p.idSolicitud, p.versionEsperada, actor?.idConjunto);
    if (actor && actor.rol !== 'ADMIN') {
      throw new Forbidden('Solo un administrador puede aceptar sugerencias');
    }
    if (sol.estado === 'CERRADA') throw new ValidationError('Una solicitud CERRADA no se reclasifica');
    await verificarUsuarioActivo(tx, p.idUsuario);

    const r = await tx
      .request()
      .input('id', sql.Int, p.idSolicitud)
      .query<{ estado: string; categoria: Categoria | null; prioridad: Prioridad | null }>(
        `SELECT g.estado, cat.nombre AS categoria, pri.nombre AS prioridad
           FROM SUGERENCIAS_IA g
           LEFT JOIN CATEGORIAS cat ON cat.idCategoria = g.idCategoria
           LEFT JOIN PRIORIDADES pri ON pri.idPrioridad = g.idPrioridad
          WHERE g.idSolicitud = @id`,
      );
    const sug = r.recordset[0];
    if (!sug || sug.estado !== 'LISTA' || !sug.categoria || !sug.prioridad) {
      throw new ValidationError('No hay una sugerencia lista para aceptar en esta solicitud');
    }
    const categoria = sug.categoria;
    const prioridad = prioridadPermitida(categoria, sug.prioridad);
    if (categoria === sol.categoria && prioridad === sol.prioridad) {
      return { idSolicitud: p.idSolicitud, categoria, prioridad, version: sol.version, sinCambios: true as const };
    }

    const upd = await tx
      .request()
      .input('id', sql.Int, p.idSolicitud)
      .input('cat', sql.VarChar(50), categoria)
      .input('pri', sql.VarChar(20), prioridad)
      .input('v', sql.Int, p.versionEsperada)
      .query(
        `UPDATE SOLICITUDES
            SET idCategoria = (SELECT idCategoria FROM CATEGORIAS WHERE nombre = @cat),
                idPrioridad = (SELECT idPrioridad FROM PRIORIDADES WHERE nombre = @pri),
                version = version + 1
          WHERE idSolicitud = @id AND version = @v`,
      );
    if (upd.rowsAffected[0] !== 1) throw new ConflictError('La solicitud cambió durante la operación');

    const cambios = [
      categoria !== sol.categoria ? `categoría ${sol.categoria} → ${categoria}` : null,
      prioridad !== sol.prioridad ? `prioridad ${sol.prioridad} → ${prioridad}` : null,
    ].filter(Boolean);
    await registrarHistorial(tx, {
      idSolicitud: p.idSolicitud,
      idEstadoAnterior: sol.idEstado,
      idEstadoNuevo: sol.idEstado,
      idUsuario: p.idUsuario,
      comentario: `Sugerencia IA aceptada: ${cambios.join('; ')}${p.comentario ? `. ${p.comentario}` : ''}`,
    });

    return { idSolicitud: p.idSolicitud, categoria, prioridad, version: p.versionEsperada + 1, sinCambios: false as const };
  });
}
