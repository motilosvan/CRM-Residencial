import sql from 'mssql';
import { z } from 'zod';
import { CATEGORIAS } from '../domain/clasificador.js';
import { PRIORIDADES, prioridadPermitida } from '../domain/priorizador.js';
import { withTx } from '../db/withTx.js';
import { truncarUtf16 } from './ingesta.js';
import { validar } from './solicitudes.js';

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
