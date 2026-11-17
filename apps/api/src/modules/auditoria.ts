import sql from 'mssql';
import type { Tx } from '../db/withTx.js';

export interface EntradaAuditoria {
  idConjunto: number;
  /** Actor; `null` = sistema (semilla, gateway). */
  idUsuario: number | null;
  entidad: 'USUARIO' | 'RESIDENTE' | 'CONJUNTO' | 'BUZON';
  idEntidad: number;
  accion: 'CREAR' | 'ACTUALIZAR' | 'ACTIVAR' | 'DESACTIVAR' | 'CAMBIAR_ROL' | 'CONECTAR' | 'DESCONECTAR' | 'VINCULAR';
  /** Qué cambió. Nunca secretos ni datos personales (correos, nombres de residentes). */
  detalle?: string;
}

/** Inserta una fila en `AUDITORIA_ADMIN` dentro de la transacción de la escritura que audita. */
export async function registrarAuditoria(tx: Tx, e: EntradaAuditoria): Promise<void> {
  await tx
    .request()
    .input('c', sql.Int, e.idConjunto)
    .input('u', sql.Int, e.idUsuario)
    .input('entidad', sql.VarChar(20), e.entidad)
    .input('id', sql.Int, e.idEntidad)
    .input('accion', sql.VarChar(30), e.accion)
    .input('detalle', sql.NVarChar(400), e.detalle ?? null)
    .query(
      `INSERT INTO AUDITORIA_ADMIN (idConjunto, idUsuario, entidad, idEntidad, accion, detalle)
       VALUES (@c, @u, @entidad, @id, @accion, @detalle)`,
    );
}
