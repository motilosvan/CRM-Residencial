import sql from 'mssql';
import { withTx, type Tx } from '../db/withTx.js';
import { registrarAuditoria } from './auditoria.js';
import { SLUG_CONJUNTO_INICIAL } from './conjuntos.js';

export interface OpcionesSemilla {
  /** Correo del administrador inicial (ADMIN_INICIAL_CORREO), ya normalizado; null si no se configuró. */
  adminCorreo: string | null;
  /** Conjunto inicial configurado; null usa el de la migración 0007. */
  conjuntoInicial: { slug: string; nombre: string } | null;
  /** Avisos de arranque (sin datos personales). Por defecto, silencioso. */
  log?: (mensaje: string) => void;
}

type Rol = 'ADMIN' | 'SOPORTE';

/**
 * Crea o reactiva el conjunto por slug. Idempotente y segura ante arranques concurrentes (UPDLOCK + HOLDLOCK
 * sobre el slug). Un conjunto existente conserva su nombre: la identidad se edita desde el panel.
 */
async function asegurarConjunto(tx: Tx, c: { slug: string; nombre: string }): Promise<number> {
  const r = await tx
    .request()
    .input('slug', sql.VarChar(80), c.slug)
    .query<{ idConjunto: number; activo: boolean }>(
      'SELECT idConjunto, activo FROM dbo.CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE slug = @slug',
    );
  const fila = r.recordset[0];
  if (!fila) {
    const ins = await tx
      .request()
      .input('slug', sql.VarChar(80), c.slug)
      .input('nombre', sql.NVarChar(120), c.nombre)
      .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)');
    const id = ins.recordset[0]!.id;
    await registrarAuditoria(tx, { idConjunto: id, idUsuario: null, entidad: 'CONJUNTO', idEntidad: id, accion: 'CREAR', detalle: 'Conjunto inicial creado al arrancar' });
    return id;
  }
  if (!fila.activo) {
    await tx.request().input('id', sql.Int, fila.idConjunto).query('UPDATE dbo.CONJUNTOS SET activo = 1, version = version + 1 WHERE idConjunto = @id');
    await registrarAuditoria(tx, { idConjunto: fila.idConjunto, idUsuario: null, entidad: 'CONJUNTO', idEntidad: fila.idConjunto, accion: 'ACTIVAR', detalle: 'Conjunto inicial reactivado al arrancar' });
  }
  return fila.idConjunto;
}

/** Desactiva el conjunto de la migración 0007 si está activo y sin correos ni solicitudes; si tiene datos, solo avisa. */
async function retirarConjuntoPorDefecto(tx: Tx, log: (m: string) => void): Promise<void> {
  const r = await tx
    .request()
    .input('slug', sql.VarChar(80), SLUG_CONJUNTO_INICIAL)
    .query<{ idConjunto: number }>('SELECT idConjunto FROM dbo.CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE slug = @slug AND activo = 1');
  const fila = r.recordset[0];
  if (!fila) return;
  const uso = await tx
    .request()
    .input('id', sql.Int, fila.idConjunto)
    .query<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM dbo.CORREOS WHERE idConjunto = @id)
            + (SELECT COUNT(*) FROM dbo.SOLICITUDES s JOIN dbo.CORREOS c ON c.idCorreo = s.idCorreo WHERE c.idConjunto = @id) AS n`,
    );
  if (uso.recordset[0]!.n > 0) {
    log(`El conjunto ${SLUG_CONJUNTO_INICIAL} tiene correos o solicitudes: se deja activo; desactívelo desde el panel si ya no se usa`);
    return;
  }
  await tx.request().input('id', sql.Int, fila.idConjunto).query('UPDATE dbo.CONJUNTOS SET activo = 0, version = version + 1 WHERE idConjunto = @id');
  await registrarAuditoria(tx, { idConjunto: fila.idConjunto, idUsuario: null, entidad: 'CONJUNTO', idEntidad: fila.idConjunto, accion: 'DESACTIVAR', detalle: 'Conjunto de la migración 0007 desactivado: hay otro conjunto inicial configurado y no tiene datos' });
}

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
    await registrarAuditoria(tx, { idConjunto, idUsuario: null, entidad: 'USUARIO', idEntidad: idUsuario, accion: 'CREAR', detalle: `Administrador inicial creado con rol ${u.rol}` });
  } else {
    idUsuario = fila.idUsuario;
    if (!fila.activo) {
      await tx.request().input('id', sql.Int, idUsuario).query('UPDATE dbo.USUARIOS SET activo = 1 WHERE idUsuario = @id');
      await registrarAuditoria(tx, { idConjunto, idUsuario: null, entidad: 'USUARIO', idEntidad: idUsuario, accion: 'ACTIVAR', detalle: 'Usuario reactivado al arrancar' });
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
    // Un usuario recién creado ya quedó auditado como CREAR: no se duplica.
    if (fila) await registrarAuditoria(tx, { idConjunto, idUsuario: null, entidad: 'USUARIO', idEntidad: idUsuario, accion: 'ACTIVAR', detalle: `Membresía creada con rol ${u.rol}` });
  } else if (membresia.rol !== u.rol || !membresia.activo) {
    await req.query('UPDATE dbo.USUARIO_CONJUNTOS SET rol = @rol, activo = 1 WHERE idUsuario = @id AND idConjunto = @conjunto');
    await registrarAuditoria(tx, {
      idConjunto,
      idUsuario: null,
      entidad: 'USUARIO',
      idEntidad: idUsuario,
      accion: membresia.rol !== u.rol ? 'CAMBIAR_ROL' : 'ACTIVAR',
      detalle: membresia.rol !== u.rol ? `Rol ajustado a ${u.rol} al arrancar` : 'Membresía reactivada al arrancar',
    });
  }
}

/**
 * Conjunto inicial configurado (o el de la 0007) y su administrador inicial. Se llama al arrancar la API.
 * Solo INSERT/UPDATE: corre con el login de la aplicación (crm_app).
 */
export async function asegurarUsuariosIniciales(pool: sql.ConnectionPool, opciones: OpcionesSemilla): Promise<void> {
  const log = opciones.log ?? (() => undefined);
  const configurado = opciones.conjuntoInicial;
  let slug = SLUG_CONJUNTO_INICIAL;
  if (configurado) {
    slug = configurado.slug;
    await withTx(pool, async (tx) => {
      await asegurarConjunto(tx, configurado);
      if (configurado.slug !== SLUG_CONJUNTO_INICIAL) await retirarConjuntoPorDefecto(tx, log);
    });
  }
  if (!opciones.adminCorreo) return;
  const admin = { correo: opciones.adminCorreo.trim().toLowerCase(), nombre: 'Administrador', rol: 'ADMIN' as const };
  await withTx(pool, async (tx) => {
    const r = await tx
      .request()
      .input('slug', sql.VarChar(80), slug)
      .query<{ idConjunto: number }>('SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = @slug AND activo = 1');
    const idConjunto = r.recordset[0]?.idConjunto;
    if (idConjunto === undefined) {
      log('El conjunto inicial no existe o está inactivo: no se pudo asegurar el administrador inicial');
      return;
    }
    await asegurar(tx, idConjunto, admin);
  });
}

/** ¿Hay al menos un ADMIN activo con membresía activa en un conjunto activo? Si no, nadie podría entrar. */
export async function hayAdminActivo(pool: sql.ConnectionPool): Promise<boolean> {
  const r = await pool.request().query<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM dbo.USUARIO_CONJUNTOS m
       JOIN dbo.USUARIOS u ON u.idUsuario = m.idUsuario
       JOIN dbo.CONJUNTOS c ON c.idConjunto = m.idConjunto
      WHERE m.rol = 'ADMIN' AND m.activo = 1 AND u.activo = 1 AND c.activo = 1`,
  );
  return r.recordset[0]!.n > 0;
}
