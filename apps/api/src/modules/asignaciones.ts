import sql from 'mssql';
import { z } from 'zod';
import { withTx } from '../db/withTx.js';
import { ConflictError, ValidationError } from '../errors.js';
import { paso, type Hooks } from './hooks.js';
import {
  bloquearSolicitud,
  liberarAsignacionVigente,
  registrarHistorial,
  validar,
  verificarUsuarioActivo,
} from './solicitudes.js';

const id = z.number().int().positive();

export const AsignacionSchema = z.object({
  idSolicitud: id,
  idResponsable: id,
  /** Quien asigna (se guarda en ASIGNACIONES.asignadaPor y en el historial). */
  idAsignador: id,
  /** Obligatoria, como en T3/T4: asignar sobre una vista desactualizada recibe 409. */
  versionEsperada: id,
});
export type Asignacion = z.input<typeof AsignacionSchema>;

export type ResultadoAsignacion =
  | { sinCambios: true; version: number }
  | { sinCambios: false; version: number; estado: string; idAsignacion: number };

/**
 * T2 — Asignar o reasignar. Bloquea la solicitud, libera la asignación vigente, crea la nueva y,
 * si la solicitud era NUEVA, la pasa a ASIGNADA. Toda asignación deja una línea en el historial.
 * Si el responsable ya es el vigente es una operación sin efecto. El índice único filtrado de la BD
 * es la última defensa contra dos vigentes; el trigger exige responsable en ASIGNADA.
 */
export async function asignar(pool: sql.ConnectionPool, entrada: Asignacion, hooks?: Hooks): Promise<ResultadoAsignacion> {
  const p = validar(AsignacionSchema, entrada);
  return withTx(pool, async (tx) => {
    const sol = await bloquearSolicitud(tx, p.idSolicitud, p.versionEsperada);
    if (!['NUEVA', 'ASIGNADA', 'EN_PROCESO'].includes(sol.estado)) {
      throw new ValidationError(`No se puede asignar una solicitud en estado ${sol.estado}`);
    }
    const nombreResponsable = await verificarUsuarioActivo(tx, p.idResponsable, 'responsable');
    await verificarUsuarioActivo(tx, p.idAsignador, 'asignador');

    const vigente = await tx
      .request()
      .input('id', sql.Int, p.idSolicitud)
      .query<{ idUsuario: number }>('SELECT idUsuario FROM ASIGNACIONES WHERE idSolicitud = @id AND liberadaEn IS NULL');
    const anterior = vigente.recordset[0]?.idUsuario;
    if (anterior === p.idResponsable) return { sinCambios: true, version: sol.version } as const;

    await liberarAsignacionVigente(tx, p.idSolicitud);
    await paso(hooks, 'liberar');

    const nueva = await tx
      .request()
      .input('id', sql.Int, p.idSolicitud)
      .input('u', sql.Int, p.idResponsable)
      .input('por', sql.Int, p.idAsignador)
      .query<{ idAsignacion: number }>(
        `INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor)
         OUTPUT inserted.idAsignacion VALUES (@id, @u, @por)`,
      );
    await paso(hooks, 'asignacion');

    let estado = sol.estado;
    let idEstadoNuevo = sol.idEstado;
    if (sol.estado === 'NUEVA') {
      const asignada = await tx.request().query<{ idEstado: number }>("SELECT idEstado FROM ESTADOS WHERE nombre = 'ASIGNADA'");
      idEstadoNuevo = asignada.recordset[0]!.idEstado;
      estado = 'ASIGNADA';
    }
    await registrarHistorial(tx, {
      idSolicitud: p.idSolicitud,
      idEstadoAnterior: sol.idEstado,
      idEstadoNuevo,
      idUsuario: p.idAsignador,
      comentario: anterior === undefined ? `Asignada a ${nombreResponsable}` : `Reasignada a ${nombreResponsable}`,
    });
    await paso(hooks, 'historial');

    const upd = await tx
      .request()
      .input('id', sql.Int, p.idSolicitud)
      .input('e', sql.Int, idEstadoNuevo)
      .input('v', sql.Int, p.versionEsperada)
      .query('UPDATE SOLICITUDES SET idEstado = @e, version = version + 1 WHERE idSolicitud = @id AND version = @v');
    if (upd.rowsAffected[0] !== 1) throw new ConflictError('La solicitud cambió durante la operación');
    await paso(hooks, 'update');

    return { sinCambios: false, version: sol.version + 1, estado, idAsignacion: nueva.recordset[0]!.idAsignacion } as const;
  });
}
