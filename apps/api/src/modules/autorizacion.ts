import sql from 'mssql';
import type { Tx } from '../db/withTx.js';
import { Forbidden } from '../errors.js';
import type { Actor, Rol } from './solicitudes.js';

/**
 * Exige que el actor tenga, EN LA BD y dentro de la transacción, uno de esos roles con membresía activa
 * (y usuario activo) en su conjunto. Manda `USUARIO_CONJUNTOS.rol`, no el rol que traiga el `Actor`.
 */
export async function exigirRol(tx: Tx, actor: Actor, roles: readonly Rol[], accion: string): Promise<void> {
  const r = await tx
    .request()
    .input('u', sql.Int, actor.idUsuario)
    .input('c', sql.Int, actor.idConjunto)
    .query<{ rol: Rol }>(
      `SELECT m.rol
         FROM USUARIO_CONJUNTOS m
         JOIN USUARIOS u ON u.idUsuario = m.idUsuario
        WHERE m.idUsuario = @u AND m.idConjunto = @c AND m.activo = 1 AND u.activo = 1`,
    );
  const fila = r.recordset[0];
  if (!fila || !roles.includes(fila.rol)) throw new Forbidden(`No tienes permiso para ${accion}`);
}
