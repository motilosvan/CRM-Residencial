import sql from 'mssql';
import { withTx, type Tx } from '../db/withTx.js';
import { SLUG_CONJUNTO_INICIAL, idConjuntoPorSlug } from './conjuntos.js';

export interface OpcionesSemilla {
  /** Correo del administrador inicial (ADMIN_INICIAL_CORREO), ya normalizado; null si no se configuró. */
  adminCorreo: string | null;
  /** Solo en desarrollo: crea los usuarios de demostración. */
  demo: boolean;
}

type Rol = 'ADMIN' | 'SOPORTE';

const USUARIOS_DEMO: ReadonlyArray<{ correo: string; nombre: string; rol: Rol }> = [
  { correo: 'admin@demo.mailflow.test', nombre: 'Admin Demo', rol: 'ADMIN' },
  { correo: 'soporte@demo.mailflow.test', nombre: 'Soporte Demo', rol: 'SOPORTE' },
];

/**
 * Asegura el usuario y su membresía ACTIVA con ese rol en el conjunto inicial. Idempotente y segura ante
 * arranques concurrentes (UPDLOCK + HOLDLOCK en el check-then-insert). Solo INSERT/UPDATE (rol crm_app).
 * Reactiva un usuario o membresía desactivados: la semilla es la vía de recuperación del acceso inicial.
 */
async function asegurar(tx: Tx, idConjunto: number, u: { correo: string; nombre: string; rol: Rol }): Promise<void> {
  const existente = await tx
    .request()
    .input('correo', sql.NVarChar(320), u.correo)
    .query<{ idUsuario: number; activo: boolean }>(
      'SELECT idUsuario, activo FROM dbo.USUARIOS WITH (UPDLOCK, HOLDLOCK) WHERE correo = @correo',
    );
  let idUsuario: number;
  const fila = existente.recordset[0];
  if (!fila) {
    const r = await tx
      .request()
      .input('nombre', sql.NVarChar(100), u.nombre)
      .input('rol', sql.VarChar(30), u.rol)
      .input('correo', sql.NVarChar(320), u.correo)
      .query<{ id: number }>(
        'INSERT INTO dbo.USUARIOS (nombre, rol, correo, activo) OUTPUT inserted.idUsuario AS id VALUES (@nombre, @rol, @correo, 1)',
      );
    idUsuario = r.recordset[0]!.id;
  } else {
    idUsuario = fila.idUsuario;
    if (!fila.activo) {
      await tx.request().input('id', sql.Int, idUsuario).query('UPDATE dbo.USUARIOS SET activo = 1 WHERE idUsuario = @id');
    }
  }

  const m = await tx
    .request()
    .input('id', sql.Int, idUsuario)
    .input('conjunto', sql.Int, idConjunto)
    .query<{ rol: string; activo: boolean }>(
      'SELECT rol, activo FROM dbo.USUARIO_CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE idUsuario = @id AND idConjunto = @conjunto',
    );
  const membresia = m.recordset[0];
  const req = tx.request().input('id', sql.Int, idUsuario).input('conjunto', sql.Int, idConjunto).input('rol', sql.VarChar(30), u.rol);
  if (!membresia) {
    await req.query('INSERT INTO dbo.USUARIO_CONJUNTOS (idUsuario, idConjunto, rol, activo) VALUES (@id, @conjunto, @rol, 1)');
  } else if (membresia.rol !== u.rol || !membresia.activo) {
    await req.query('UPDATE dbo.USUARIO_CONJUNTOS SET rol = @rol, activo = 1 WHERE idUsuario = @id AND idConjunto = @conjunto');
  }
}

/** Administrador inicial (y, con `demo`, los usuarios de demostración) en el conjunto inicial. Se llama al arrancar la API. */
export async function asegurarUsuariosIniciales(pool: sql.ConnectionPool, opciones: OpcionesSemilla): Promise<void> {
  const lista = [
    ...(opciones.adminCorreo ? [{ correo: opciones.adminCorreo.trim().toLowerCase(), nombre: 'Administrador', rol: 'ADMIN' as const }] : []),
    ...(opciones.demo ? USUARIOS_DEMO : []),
  ];
  if (lista.length === 0) return;
  const idConjunto = await idConjuntoPorSlug(pool, SLUG_CONJUNTO_INICIAL);
  for (const u of lista) await withTx(pool, (tx) => asegurar(tx, idConjunto, u));
}
