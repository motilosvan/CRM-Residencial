import sql from 'mssql';
import { z } from 'zod';
import { CATEGORIAS } from '../domain/clasificador.js';
import { ESTADOS } from '../domain/estados.js';
import { PRIORIDADES } from '../domain/priorizador.js';
import { withTx, type Tx } from '../db/withTx.js';
import { ConflictError, Forbidden, NotFound, TransicionInvalida, ValidationError } from '../errors.js';
import { paso, type Hooks } from './hooks.js';

export type Rol = 'ADMIN' | 'SOPORTE';

/** Contexto del actor autenticado para evaluar conjunto y permisos dentro de la transacción. */
export interface Actor {
  idUsuario: number;
  rol: Rol;
  idConjunto: number;
}

const id = z.number().int().positive();

/** Traduce un ZodError a ValidationError (422) con un mensaje legible. */
export function validar<T extends z.ZodType>(schema: T, entrada: unknown): z.output<T> {
  const r = schema.safeParse(entrada);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ');
    throw new ValidationError(`Datos inválidos — ${detalle}`);
  }
  return r.data;
}

interface FilaSolicitud {
  idEstado: number;
  estado: string;
  version: number;
  categoria: string;
  prioridad: string;
  idConjunto: number;
}

/** Bloquea la fila (UPDLOCK) para que lectura-validación-escritura sea atómica entre transacciones. */
export async function bloquearSolicitud(
  tx: Tx,
  idSolicitud: number,
  versionEsperada: number,
  idConjunto?: number,
): Promise<FilaSolicitud> {
  const r = await tx
    .request()
    .input('id', sql.Int, idSolicitud)
    .query<FilaSolicitud>(
      `SELECT s.idEstado, e.nombre AS estado, s.version, c.nombre AS categoria, p.nombre AS prioridad, cor.idConjunto
         FROM SOLICITUDES AS s WITH (UPDLOCK, ROWLOCK)
         JOIN CORREOS cor ON cor.idCorreo = s.idCorreo
         JOIN ESTADOS e ON e.idEstado = s.idEstado
         JOIN CATEGORIAS c ON c.idCategoria = s.idCategoria
         JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad
        WHERE s.idSolicitud = @id`,
    );
  const fila = r.recordset[0];
  if (!fila || (idConjunto !== undefined && fila.idConjunto !== idConjunto)) {
    throw new NotFound(`La solicitud ${idSolicitud} no existe`);
  }
  if (fila.version !== versionEsperada) {
    throw new ConflictError(
      `La solicitud ${idSolicitud} cambió (versión ${fila.version}, se esperaba ${versionEsperada}). Recárguela.`,
    );
  }
  return fila;
}

/** El usuario que actúa debe existir y estar activo (si no, 422 en vez de un error de FK). */
export async function verificarUsuarioActivo(tx: Tx, idUsuario: number, papel = 'usuario'): Promise<string> {
  const r = await tx
    .request()
    .input('u', sql.Int, idUsuario)
    .query<{ nombre: string; activo: boolean }>('SELECT nombre, activo FROM USUARIOS WHERE idUsuario = @u');
  const u = r.recordset[0];
  if (!u?.activo) throw new ValidationError(`El ${papel} ${idUsuario} no existe o está inactivo`);
  return u.nombre;
}

/** Exige usuario activo con membresía activa en el conjunto (evita que 50026 llegue como 500). */
export async function verificarMembresiaActiva(
  tx: Tx,
  idUsuario: number,
  idConjunto: number,
  papel = 'usuario',
): Promise<string> {
  const r = await tx
    .request()
    .input('u', sql.Int, idUsuario)
    .input('c', sql.Int, idConjunto)
    .query<{ nombre: string; activo: boolean; membresiaActiva: boolean }>(
      `SELECT u.nombre, u.activo, COALESCE(m.activo, 0) AS membresiaActiva
         FROM USUARIOS u
         LEFT JOIN USUARIO_CONJUNTOS m ON m.idUsuario = u.idUsuario AND m.idConjunto = @c
        WHERE u.idUsuario = @u`,
    );
  const u = r.recordset[0];
  if (!u?.activo) throw new ValidationError(`El ${papel} ${idUsuario} no existe o está inactivo`);
  if (!u.membresiaActiva) throw new ValidationError(`El ${papel} ${idUsuario} no pertenece a este conjunto o está inactivo`);
  return u.nombre;
}

/** Indica si `idUsuario` tiene la asignación vigente (sin liberar) de la solicitud. */
export async function esResponsableVigente(tx: Tx, idSolicitud: number, idUsuario: number): Promise<boolean> {
  const r = await tx
    .request()
    .input('id', sql.Int, idSolicitud)
    .input('u', sql.Int, idUsuario)
    .query('SELECT 1 AS ok FROM ASIGNACIONES WHERE idSolicitud = @id AND idUsuario = @u AND liberadaEn IS NULL');
  return r.recordset.length > 0;
}

export async function liberarAsignacionVigente(tx: Tx, idSolicitud: number): Promise<void> {
  await tx
    .request()
    .input('id', sql.Int, idSolicitud)
    .query('UPDATE ASIGNACIONES SET liberadaEn = SYSUTCDATETIME() WHERE idSolicitud = @id AND liberadaEn IS NULL');
}

export async function registrarHistorial(
  tx: Tx,
  p: { idSolicitud: number; idEstadoAnterior: number | null; idEstadoNuevo: number; idUsuario: number | null; comentario?: string },
): Promise<void> {
  await tx
    .request()
    .input('sol', sql.Int, p.idSolicitud)
    .input('ant', sql.Int, p.idEstadoAnterior)
    .input('nuevo', sql.Int, p.idEstadoNuevo)
    .input('usr', sql.Int, p.idUsuario)
    .input('com', sql.NVarChar(500), p.comentario ?? null)
    .query(
      `INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoAnterior, idEstadoNuevo, idUsuario, comentario)
       VALUES (@sol, @ant, @nuevo, @usr, @com)`,
    );
}

export const CambioEstadoSchema = z.object({
  idSolicitud: id,
  /** Solo nombres canónicos: 'asignada' o 'NUEVA ' se rechazan aquí (la collation de la BD los aceptaría). */
  nuevoEstado: z.enum(ESTADOS),
  idUsuario: id,
  versionEsperada: id,
  comentario: z.string().max(500).optional(),
});
export type CambioEstado = z.input<typeof CambioEstadoSchema>;

/**
 * T3 — Cambiar estado. Valida contra TRANSICIONES_ESTADO, exige la versión que vio el cliente y deja
 * historial, todo en una transacción. El trigger TR_Solicitudes_integridad repite las reglas en la BD.
 * - ASIGNADA solo se alcanza con T2 (asignar): nunca hay una solicitud ASIGNADA sin responsable.
 * - Pasar a NUEVA (desasignar) o a un estado final libera la asignación vigente.
 */
export async function cambiarEstado(
  pool: sql.ConnectionPool,
  entrada: CambioEstado,
  hooks?: Hooks,
  actor?: Actor,
) {
  const p = validar(CambioEstadoSchema, entrada);
  return withTx(pool, async (tx) => {
    const sol = await bloquearSolicitud(tx, p.idSolicitud, p.versionEsperada, actor?.idConjunto);
    await verificarUsuarioActivo(tx, p.idUsuario);
    if (actor && actor.rol !== 'ADMIN') {
      const asignada = await esResponsableVigente(tx, p.idSolicitud, actor.idUsuario);
      if (!asignada) throw new Forbidden('Solo puedes cambiar el estado de tus solicitudes asignadas');
    }

    const destino = await tx
      .request()
      .input('n', sql.VarChar(30), p.nuevoEstado)
      .query<{ idEstado: number; esFinal: boolean; nombre: string }>(
        'SELECT idEstado, esFinal, nombre FROM ESTADOS WHERE nombre = @n',
      );
    const dest = destino.recordset[0];
    if (!dest) throw new ValidationError(`El estado "${p.nuevoEstado}" no existe en el catálogo`);
    const nombreDestino = dest.nombre; // nombre canónico de la BD: todas las comparaciones usan este

    const permitida = await tx
      .request()
      .input('o', sql.Int, sol.idEstado)
      .input('d', sql.Int, dest.idEstado)
      .query('SELECT 1 AS ok FROM TRANSICIONES_ESTADO WHERE idEstadoOrigen = @o AND idEstadoDestino = @d');
    if (permitida.recordset.length === 0) throw new TransicionInvalida(sol.estado, nombreDestino);
    if (nombreDestino === 'ASIGNADA') {
      throw new TransicionInvalida(sol.estado, nombreDestino, 'use la operación de asignar un responsable');
    }

    if (nombreDestino === 'NUEVA' || dest.esFinal) await liberarAsignacionVigente(tx, p.idSolicitud);
    await paso(hooks, 'liberar');

    const upd = await tx
      .request()
      .input('id', sql.Int, p.idSolicitud)
      .input('d', sql.Int, dest.idEstado)
      .input('nombre', sql.VarChar(30), nombreDestino)
      .input('final', sql.Bit, dest.esFinal)
      .input('v', sql.Int, p.versionEsperada)
      .query(
        `UPDATE SOLICITUDES
            SET idEstado = @d,
                version = version + 1,
                primeraRespuesta = CASE WHEN primeraRespuesta IS NULL AND @nombre IN ('EN_PROCESO', 'RESUELTA')
                                        THEN SYSUTCDATETIME() ELSE primeraRespuesta END,
                fechaCierre = CASE WHEN @final = 1 THEN SYSUTCDATETIME() ELSE fechaCierre END
          WHERE idSolicitud = @id AND version = @v`,
      );
    if (upd.rowsAffected[0] !== 1) throw new ConflictError('La solicitud cambió durante la operación');
    await paso(hooks, 'update');

    await registrarHistorial(tx, {
      idSolicitud: p.idSolicitud,
      idEstadoAnterior: sol.idEstado,
      idEstadoNuevo: dest.idEstado,
      idUsuario: p.idUsuario,
      comentario: p.comentario,
    });
    await paso(hooks, 'historial');

    return { idSolicitud: p.idSolicitud, estado: nombreDestino, version: p.versionEsperada + 1 };
  });
}

export const ReclasificacionSchema = z
  .object({
    idSolicitud: id,
    categoria: z.enum(CATEGORIAS).optional(),
    prioridad: z.enum(PRIORIDADES).optional(),
    idUsuario: id,
    versionEsperada: id,
    comentario: z.string().max(300).optional(),
  })
  .refine((r) => r.categoria !== undefined || r.prioridad !== undefined, {
    message: 'Indique una categoría o una prioridad nueva',
  });
export type Reclasificacion = z.input<typeof ReclasificacionSchema>;

/**
 * T4 — Reclasificar manualmente (corrige al clasificador). Deja historial con lo que cambió.
 * Si no cambia nada, no toca la BD (no sube la versión: evita 409 espurios a otros usuarios).
 */
export async function reclasificar(
  pool: sql.ConnectionPool,
  entrada: Reclasificacion,
  hooks?: Hooks,
  actor?: Actor,
) {
  const p = validar(ReclasificacionSchema, entrada);
  return withTx(pool, async (tx) => {
    const sol = await bloquearSolicitud(tx, p.idSolicitud, p.versionEsperada, actor?.idConjunto);
    if (actor && actor.rol !== 'ADMIN') {
      throw new Forbidden('Solo un administrador puede reclasificar solicitudes');
    }
    if (sol.estado === 'CERRADA') throw new ValidationError('Una solicitud CERRADA no se reclasifica');
    await verificarUsuarioActivo(tx, p.idUsuario);

    const categoria = p.categoria ?? sol.categoria;
    const prioridad = p.prioridad ?? sol.prioridad;
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
    await paso(hooks, 'update');

    const cambios = [
      categoria !== sol.categoria ? `categoría ${sol.categoria} → ${categoria}` : null,
      prioridad !== sol.prioridad ? `prioridad ${sol.prioridad} → ${prioridad}` : null,
    ].filter(Boolean);
    await registrarHistorial(tx, {
      idSolicitud: p.idSolicitud,
      idEstadoAnterior: sol.idEstado,
      idEstadoNuevo: sol.idEstado,
      idUsuario: p.idUsuario,
      comentario: `Reclasificada: ${cambios.join('; ')}${p.comentario ? `. ${p.comentario}` : ''}`,
    });
    await paso(hooks, 'historial');

    return { idSolicitud: p.idSolicitud, categoria, prioridad, version: p.versionEsperada + 1, sinCambios: false as const };
  });
}
