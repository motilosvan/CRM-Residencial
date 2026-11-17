import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ConflictError, ErrorAcceso, Forbidden, NotFound, ValidationError } from '../errors.js';
import { listarUsuariosConjunto } from './consultas.js';
import { crearSesion } from './sesiones.js';
import type { Actor } from './solicitudes.js';
import { actualizarMembresiaUsuario, guardarUsuarioConjunto } from './usuarios.js';

let db: TestDb;
let n = 0;

interface Conjunto {
  id: number;
  slug: string;
  admin: Actor;
  soporte: Actor;
}

/** Conjunto nuevo con un ADMIN y un SOPORTE activos: cada prueba trabaja sobre el suyo. */
async function nuevoConjunto(): Promise<Conjunto> {
  const slug = `usr-${++n}`;
  const id = (
    await db.pool
      .request()
      .input('slug', sql.VarChar(80), slug)
      .input('nombre', sql.NVarChar(120), `Conjunto ${n}`)
      .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)')
  ).recordset[0]!.id;
  const idAdmin = await crearUsuario(db, { nombre: `Admin ${n}`, correo: `admin-${n}@demo.mailflow.test`, rol: 'ADMIN', slug });
  const idSoporte = await crearUsuario(db, { nombre: `Soporte ${n}`, correo: `soporte-${n}@demo.mailflow.test`, rol: 'SOPORTE', slug });
  return {
    id,
    slug,
    admin: { idUsuario: idAdmin, rol: 'ADMIN', idConjunto: id },
    soporte: { idUsuario: idSoporte, rol: 'SOPORTE', idConjunto: id },
  };
}

const actorDe = (c: Conjunto, idUsuario: number, rol: Actor['rol'] = 'ADMIN'): Actor => ({ idUsuario, rol, idConjunto: c.id });

async function membresia(idUsuario: number, idConjunto: number) {
  const r = await db.pool
    .request()
    .input('u', sql.Int, idUsuario)
    .input('c', sql.Int, idConjunto)
    .query<{ rol: string; activo: boolean; version: number }>(
      'SELECT rol, activo, version FROM dbo.USUARIO_CONJUNTOS WHERE idUsuario = @u AND idConjunto = @c',
    );
  return r.recordset[0];
}

async function auditoria(idConjunto: number) {
  const r = await db.pool
    .request()
    .input('c', sql.Int, idConjunto)
    .query<{ idUsuario: number | null; entidad: string; idEntidad: number; accion: string; detalle: string | null }>(
      'SELECT idUsuario, entidad, idEntidad, accion, detalle FROM dbo.AUDITORIA_ADMIN WHERE idConjunto = @c ORDER BY idAuditoria',
    );
  return r.recordset;
}

async function adminsActivos(idConjunto: number): Promise<number> {
  const r = await db.pool
    .request()
    .input('c', sql.Int, idConjunto)
    .query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM dbo.USUARIO_CONJUNTOS m JOIN dbo.USUARIOS u ON u.idUsuario = m.idUsuario
        WHERE m.idConjunto = @c AND m.rol = 'ADMIN' AND m.activo = 1 AND u.activo = 1`,
    );
  return r.recordset[0]!.n;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_usuarios');
});
afterAll(async () => {
  await db.close();
});

describe('guardarUsuarioConjunto', () => {
  it('crea un usuario nuevo con membresía, normaliza y audita sin datos personales', async () => {
    const c = await nuevoConjunto();
    const u = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: '  Luz Pérez ', correo: '  Luz.Perez@Demo.Mailflow.Test ', rol: 'SOPORTE' });
    expect(u).toEqual({ id: expect.any(Number), nombre: 'Luz Pérez', correo: 'luz.perez@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: true });
    const filas = (await auditoria(c.id)).filter((f) => f.idEntidad === u.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ idUsuario: c.admin.idUsuario, entidad: 'USUARIO', accion: 'CREAR' });
    const texto = JSON.stringify(filas);
    expect(texto).not.toContain('luz');
    expect(texto).not.toContain('Luz');
    expect(texto).not.toContain('demo.mailflow');
  });

  it('agrega a un usuario que ya existe en otro conjunto sin renombrarlo', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const u = await guardarUsuarioConjunto(db.pool, b.admin, { nombre: 'Nombre Original', correo: `compartido-${n}@demo.mailflow.test`, rol: 'SOPORTE' });
    const r = await guardarUsuarioConjunto(db.pool, a.admin, { nombre: 'Otro Nombre', correo: `compartido-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    expect(r.id).toBe(u.id);
    expect(r.nombre).toBe('Nombre Original');
    expect(r.rol).toBe('ADMIN');
    expect((await membresia(u.id, b.id))?.rol).toBe('SOPORTE');
    const filas = (await auditoria(a.id)).filter((f) => f.idEntidad === u.id);
    expect(filas.map((f) => f.accion)).toEqual(['CREAR']);
  });

  it('reactiva una membresía inactiva con el rol pedido y sube la versión', async () => {
    const c = await nuevoConjunto();
    const u = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Ana', correo: `ana-${n}@demo.mailflow.test`, rol: 'SOPORTE' });
    const off = await actualizarMembresiaUsuario(db.pool, c.admin, u.id, { activo: false, versionEsperada: u.version });
    const r = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Ana', correo: `ana-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    expect(r).toMatchObject({ id: u.id, rol: 'ADMIN', activo: true, version: off.version + 1 });
    const acciones = (await auditoria(c.id)).filter((f) => f.idEntidad === u.id).map((f) => f.accion);
    expect(acciones).toEqual(['CREAR', 'DESACTIVAR', 'ACTIVAR']);
  });

  it('rechaza con 422 a un usuario deshabilitado en la plataforma: no lo reactiva ni audita', async () => {
    const c = await nuevoConjunto();
    const id = await crearUsuario(db, { nombre: 'Inactivo', correo: `inactivo-${n}@demo.mailflow.test`, rol: 'SOPORTE', slug: c.slug, activo: false });
    const antes = (await auditoria(c.id)).length;
    await expect(
      guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Inactivo', correo: `inactivo-${n}@demo.mailflow.test`, rol: 'ADMIN' }),
    ).rejects.toThrow(new ValidationError('Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto'));
    const u = await db.q<{ activo: boolean }>(`SELECT activo FROM dbo.USUARIOS WHERE idUsuario = ${id}`);
    expect(u[0]!.activo).toBe(false);
    expect(await auditoria(c.id)).toHaveLength(antes);
    expect((await membresia(id, c.id))?.rol).toBe('SOPORTE');
  });

  it('409 si ya es miembro activo', async () => {
    const c = await nuevoConjunto();
    await expect(
      guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Soporte', correo: `soporte-${n}@demo.mailflow.test`, rol: 'SOPORTE' }),
    ).rejects.toThrow(new ConflictError('Ese usuario ya pertenece al conjunto'));
  });

  it('Forbidden para SOPORTE, para un ADMIN de otro conjunto y con membresía inactiva', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const entrada = { nombre: 'X', correo: `x-${n}@demo.mailflow.test`, rol: 'SOPORTE' as const };
    await expect(guardarUsuarioConjunto(db.pool, a.soporte, entrada)).rejects.toBeInstanceOf(Forbidden);
    // ADMIN de B actuando con el conjunto de A en el actor
    await expect(guardarUsuarioConjunto(db.pool, { ...b.admin, idConjunto: a.id }, entrada)).rejects.toBeInstanceOf(Forbidden);
    // El rol del actor lo manda la BD, no el campo `rol` del actor
    await expect(guardarUsuarioConjunto(db.pool, { ...a.soporte, rol: 'ADMIN' }, entrada)).rejects.toBeInstanceOf(Forbidden);
    const extra = await guardarUsuarioConjunto(db.pool, a.admin, { nombre: 'Otro admin', correo: `otro-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    await actualizarMembresiaUsuario(db.pool, actorDe(a, extra.id), extra.id, { activo: false, versionEsperada: extra.version });
    await expect(guardarUsuarioConjunto(db.pool, actorDe(a, extra.id), entrada)).rejects.toBeInstanceOf(Forbidden);
    expect(await db.q(`SELECT 1 AS x FROM dbo.USUARIOS WHERE correo = 'x-${n}@demo.mailflow.test'`)).toHaveLength(0);
  });

  it('422 con datos inválidos', async () => {
    const c = await nuevoConjunto();
    const ok = { nombre: 'Ok', correo: `ok-${n}@demo.mailflow.test`, rol: 'SOPORTE' };
    await expect(guardarUsuarioConjunto(db.pool, c.admin, { ...ok, nombre: '   ' } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(guardarUsuarioConjunto(db.pool, c.admin, { ...ok, nombre: 'x'.repeat(101) } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(guardarUsuarioConjunto(db.pool, c.admin, { ...ok, correo: 'no-es-correo' } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(guardarUsuarioConjunto(db.pool, c.admin, { ...ok, rol: 'ROOT' } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(guardarUsuarioConjunto(db.pool, c.admin, { ...ok, rol: 'soporte' } as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('dos altas simultáneas del mismo correo dejan una sola membresía y un 409', async () => {
    const c = await nuevoConjunto();
    const entrada = { nombre: 'Carrera', correo: `carrera-${n}@demo.mailflow.test`, rol: 'SOPORTE' as const };
    const r = await Promise.allSettled([guardarUsuarioConjunto(db.pool, c.admin, entrada), guardarUsuarioConjunto(db.pool, c.admin, entrada)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazo = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ConflictError);
  });
});

describe('actualizarMembresiaUsuario', () => {
  it('cambia el rol, sube la versión y audita sin datos personales', async () => {
    const c = await nuevoConjunto();
    const u = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Marta', correo: `marta-${n}@demo.mailflow.test`, rol: 'SOPORTE' });
    const r = await actualizarMembresiaUsuario(db.pool, c.admin, u.id, { rol: 'ADMIN', versionEsperada: u.version });
    expect(r).toMatchObject({ id: u.id, rol: 'ADMIN', activo: true, version: u.version + 1 });
    const f = (await auditoria(c.id)).filter((x) => x.idEntidad === u.id && x.accion === 'CAMBIAR_ROL');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ idUsuario: c.admin.idUsuario, entidad: 'USUARIO', detalle: 'rol SOPORTE → ADMIN' });
  });

  it('desactiva y reactiva; con rol y estado a la vez audita dos filas', async () => {
    const c = await nuevoConjunto();
    const u = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Dos', correo: `dos-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    const r = await actualizarMembresiaUsuario(db.pool, c.admin, u.id, { rol: 'SOPORTE', activo: false, versionEsperada: u.version });
    expect(r).toMatchObject({ rol: 'SOPORTE', activo: false, version: u.version + 1 });
    const acciones = (await auditoria(c.id)).filter((x) => x.idEntidad === u.id).map((x) => x.accion);
    expect(acciones).toEqual(['CREAR', 'CAMBIAR_ROL', 'DESACTIVAR']);
    const de = (await listarUsuariosConjunto(db.pool, c.id)).map((x) => x.id);
    expect(de).not.toContain(u.id);
    const conInactivos = await listarUsuariosConjunto(db.pool, c.id, { incluirInactivos: true });
    expect(conInactivos.find((x) => x.id === u.id)).toMatchObject({ activo: false, version: r.version });
  });

  it('sin cambios efectivos no escribe ni audita', async () => {
    const c = await nuevoConjunto();
    const u = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Igual', correo: `igual-${n}@demo.mailflow.test`, rol: 'SOPORTE' });
    const antes = (await auditoria(c.id)).length;
    const r = await actualizarMembresiaUsuario(db.pool, c.admin, u.id, { rol: 'SOPORTE', activo: true, versionEsperada: u.version });
    expect(r).toEqual(u);
    expect(await auditoria(c.id)).toHaveLength(antes);
    expect((await membresia(u.id, c.id))?.version).toBe(u.version);
  });

  it('exige rol o activo, y versionEsperada', async () => {
    const c = await nuevoConjunto();
    const id = c.soporte.idUsuario;
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, id, { versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, id, { rol: 'ADMIN' } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, id, { rol: 'ADMIN', versionEsperada: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, id, { rol: 'ROOT', versionEsperada: 1 } as never)).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, Number.NaN, { rol: 'ADMIN', versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('409 por versión desactualizada y no cambia nada', async () => {
    const c = await nuevoConjunto();
    const id = c.soporte.idUsuario;
    await actualizarMembresiaUsuario(db.pool, c.admin, id, { rol: 'ADMIN', versionEsperada: 1 });
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, id, { rol: 'SOPORTE', versionEsperada: 1 })).rejects.toBeInstanceOf(ConflictError);
    expect(await membresia(id, c.id)).toMatchObject({ rol: 'ADMIN', version: 2 });
  });

  it('Forbidden para SOPORTE y para ADMIN de otro conjunto', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    await expect(actualizarMembresiaUsuario(db.pool, a.soporte, a.soporte.idUsuario, { rol: 'ADMIN', versionEsperada: 1 })).rejects.toBeInstanceOf(Forbidden);
    await expect(
      actualizarMembresiaUsuario(db.pool, { ...b.admin, idConjunto: a.id }, a.soporte.idUsuario, { rol: 'ADMIN', versionEsperada: 1 }),
    ).rejects.toBeInstanceOf(Forbidden);
    expect((await membresia(a.soporte.idUsuario, a.id))?.rol).toBe('SOPORTE');
  });

  it('NotFound para un usuario de otro conjunto o inexistente', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    await expect(actualizarMembresiaUsuario(db.pool, a.admin, b.soporte.idUsuario, { rol: 'ADMIN', versionEsperada: 1 })).rejects.toBeInstanceOf(NotFound);
    await expect(actualizarMembresiaUsuario(db.pool, a.admin, 999_999_999, { rol: 'ADMIN', versionEsperada: 1 })).rejects.toBeInstanceOf(NotFound);
    expect((await membresia(b.soporte.idUsuario, b.id))?.rol).toBe('SOPORTE');
  });

  it('422 al desactivar o degradar al último ADMIN, incluido a sí mismo', async () => {
    const c = await nuevoConjunto();
    const id = c.admin.idUsuario;
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, id, { activo: false, versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, id, { rol: 'SOPORTE', versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      actualizarMembresiaUsuario(db.pool, c.admin, id, { rol: 'SOPORTE', activo: false, versionEsperada: 1 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await membresia(id, c.id)).toMatchObject({ rol: 'ADMIN', activo: true, version: 1 });
    expect(await adminsActivos(c.id)).toBe(1);
  });

  it('un ADMIN inactivo globalmente no cuenta: el otro ya es el último', async () => {
    const c = await nuevoConjunto();
    await crearUsuario(db, { nombre: 'Fantasma', correo: `fantasma-${n}@demo.mailflow.test`, rol: 'ADMIN', slug: c.slug, activo: false });
    await expect(actualizarMembresiaUsuario(db.pool, c.admin, c.admin.idUsuario, { rol: 'SOPORTE', versionEsperada: 1 })).rejects.toBeInstanceOf(ValidationError);
  });

  it('con dos ADMIN sí se puede degradar a uno (incluso a sí mismo)', async () => {
    const c = await nuevoConjunto();
    const otro = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'Otro', correo: `otro-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    const r = await actualizarMembresiaUsuario(db.pool, c.admin, otro.id, { rol: 'SOPORTE', versionEsperada: otro.version });
    expect(r.rol).toBe('SOPORTE');
    expect(await adminsActivos(c.id)).toBe(1);
  });

  it('carrera: dos ADMIN se degradan a sí mismos a la vez y queda al menos uno', async () => {
    const c = await nuevoConjunto();
    const b = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'B', correo: `b-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    const r = await Promise.allSettled([
      actualizarMembresiaUsuario(db.pool, c.admin, c.admin.idUsuario, { rol: 'SOPORTE', versionEsperada: 1 }),
      actualizarMembresiaUsuario(db.pool, actorDe(c, b.id), b.id, { rol: 'SOPORTE', versionEsperada: b.version }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazo = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(ValidationError);
    expect(await adminsActivos(c.id)).toBe(1);
  });

  it('carrera: dos ADMIN se degradan mutuamente a la vez y queda al menos uno', async () => {
    const c = await nuevoConjunto();
    const b = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'B', correo: `b-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    const r = await Promise.allSettled([
      actualizarMembresiaUsuario(db.pool, c.admin, b.id, { activo: false, versionEsperada: b.version }),
      actualizarMembresiaUsuario(db.pool, actorDe(c, b.id), c.admin.idUsuario, { activo: false, versionEsperada: 1 }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const perdedor = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect([ValidationError, Forbidden].some((E) => perdedor.reason instanceof E)).toBe(true);
    expect(await adminsActivos(c.id)).toBe(1);
  });

  it('carrera: A desactiva a B mientras B asciende a un SOPORTE; nunca se aplica el ascenso de un B ya desactivado', async () => {
    const c = await nuevoConjunto();
    const b = await guardarUsuarioConjunto(db.pool, c.admin, { nombre: 'B', correo: `b-${n}@demo.mailflow.test`, rol: 'ADMIN' });
    // Un tercero tiene el candado del conjunto: A y B llegan a él en orden FIFO (A primero) y esperan.
    const candado = new sql.Transaction(db.pool);
    await candado.begin();
    await new sql.Request(candado)
      .input('c', sql.Int, c.id)
      .query('SELECT idConjunto FROM dbo.CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE idConjunto = @c');
    const bloqueadas = async () =>
      (await db.q<{ n: number }>("SELECT COUNT(*) AS n FROM sys.dm_exec_requests WHERE blocking_session_id > 0 AND wait_type LIKE 'LCK%'"))[0]!.n;
    const esperar = async (n2: number) => {
      for (let i = 0; i < 200 && (await bloqueadas()) < n2; i++) await new Promise((r) => setTimeout(r, 25));
      expect(await bloqueadas()).toBeGreaterThanOrEqual(n2);
    };
    const pA = actualizarMembresiaUsuario(db.pool, c.admin, b.id, { activo: false, versionEsperada: b.version });
    await esperar(1);
    const pB = actualizarMembresiaUsuario(db.pool, actorDe(c, b.id), c.soporte.idUsuario, { rol: 'ADMIN', versionEsperada: 1 });
    await esperar(2);
    await candado.rollback();
    const [rA, rB] = await Promise.allSettled([pA, pB]);
    expect(rA.status).toBe('fulfilled');
    expect(rB.status).toBe('rejected');
    expect((rB as PromiseRejectedResult).reason).toBeInstanceOf(Forbidden);
    expect((await membresia(c.soporte.idUsuario, c.id))?.rol).toBe('SOPORTE');
    expect((await membresia(b.id, c.id))?.activo).toBe(false);
  });

  it('permite desactivar a quien tiene solicitudes asignadas (la BD no lo impide) y no toca las asignaciones', async () => {
    const c = await nuevoConjunto();
    const antes = await db.q<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.ASIGNACIONES');
    const r = await actualizarMembresiaUsuario(db.pool, c.admin, c.soporte.idUsuario, { activo: false, versionEsperada: 1 });
    expect(r.activo).toBe(false);
    expect(await db.q<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.ASIGNACIONES')).toEqual(antes);
  });

  it('el desactivado ya no inicia sesión en ese conjunto pero sí en otro donde sigue activo', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const u = await guardarUsuarioConjunto(db.pool, a.admin, { nombre: 'Doble', correo: `doble-${n}@demo.mailflow.test`, rol: 'SOPORTE' });
    await guardarUsuarioConjunto(db.pool, b.admin, { nombre: 'Doble', correo: `doble-${n}@demo.mailflow.test`, rol: 'SOPORTE' });
    await crearSesion(db.pool, { idUsuario: u.id, idConjunto: a.id });
    await actualizarMembresiaUsuario(db.pool, a.admin, u.id, { activo: false, versionEsperada: u.version });
    await expect(crearSesion(db.pool, { idUsuario: u.id, idConjunto: a.id })).rejects.toBeInstanceOf(ErrorAcceso);
    await expect(crearSesion(db.pool, { idUsuario: u.id, idConjunto: b.id })).resolves.toBeDefined();
  });
});

describe('listarUsuariosConjunto', () => {
  it('por defecto solo activos; incluirInactivos añade las membresías inactivas y expone activo y versión', async () => {
    const c = await nuevoConjunto();
    await actualizarMembresiaUsuario(db.pool, c.admin, c.soporte.idUsuario, { activo: false, versionEsperada: 1 });
    expect((await listarUsuariosConjunto(db.pool, c.id)).map((x) => x.id)).toEqual([c.admin.idUsuario]);
    const todos = await listarUsuariosConjunto(db.pool, c.id, { incluirInactivos: true });
    expect(todos.map((x) => x.id).sort()).toEqual([c.admin.idUsuario, c.soporte.idUsuario].sort());
    expect(todos.find((x) => x.id === c.admin.idUsuario)).toMatchObject({ activo: true, version: 1, rol: 'ADMIN' });
    expect(todos.find((x) => x.id === c.soporte.idUsuario)).toMatchObject({ activo: false, version: 2 });
  });
});
