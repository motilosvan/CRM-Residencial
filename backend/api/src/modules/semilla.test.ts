import { randomBytes } from 'node:crypto';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idConjuntoInicial, runSql, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { crearPool } from '../db/pool.js';
import { asegurarUsuarioApp } from '../db/usuarioApp.js';
import { SLUG_CONJUNTO_INICIAL } from './conjuntos.js';
import { asegurarUsuariosIniciales, hayAdminActivo } from './semilla.js';

/** Cada grupo usa su propia BD y ejecuta la semilla con el login de la aplicación (crm_app), no con el migrador. */
interface Entorno { db: TestDb; app: sql.ConnectionPool; cerrar: () => Promise<void> }

async function crearEntorno(prefix: string): Promise<Entorno> {
  const db = await setupTestDb(prefix);
  const login = `soc_sem_${randomBytes(4).toString('hex')}`;
  const password = `Aa1-${randomBytes(18).toString('base64url')}`;
  await asegurarUsuarioApp(db.config, db.config.database, login, password);
  const app = await crearPool({ ...db.config, user: login, password }, { max: 10 });
  return {
    db,
    app,
    cerrar: async () => {
      await app.close();
      await runSql({ ...db.config, database: 'master' }, `IF SUSER_ID('${login}') IS NOT NULL DROP LOGIN [${login}]`);
      await db.close();
    },
  };
}

interface FilaUsuario { correo: string; slug: string | null; rolMembresia: string | null; activoMembresia: boolean | null; n: number }
const filasUsuarios = (db: TestDb) =>
  db.q<FilaUsuario>(
    `SELECT u.correo, c.slug, m.rol AS rolMembresia, m.activo AS activoMembresia, COUNT(*) OVER (PARTITION BY u.correo, c.slug) AS n
       FROM dbo.USUARIOS u
       LEFT JOIN dbo.USUARIO_CONJUNTOS m ON m.idUsuario = u.idUsuario
       LEFT JOIN dbo.CONJUNTOS c ON c.idConjunto = m.idConjunto
      ORDER BY u.correo, c.slug`,
  );
const conjuntos = (db: TestDb) =>
  db.q<{ slug: string; nombre: string; activo: boolean; version: number }>(
    'SELECT slug, nombre, activo, version FROM dbo.CONJUNTOS ORDER BY slug',
  );
const auditoria = (db: TestDb) =>
  db.q<{ slug: string; idUsuario: number | null; entidad: string; accion: string; detalle: string | null }>(
    `SELECT c.slug, a.idUsuario, a.entidad, a.accion, a.detalle
       FROM dbo.AUDITORIA_ADMIN a JOIN dbo.CONJUNTOS c ON c.idConjunto = a.idConjunto ORDER BY a.idAuditoria`,
  );
const NUEVO = { slug: 'torres-del-sol', nombre: 'Torres del Sol' };

describe('asegurarUsuariosIniciales sin conjunto configurado', () => {
  let e: Entorno;
  beforeAll(async () => { e = await crearEntorno('CorreosCRM_sem'); });
  afterAll(async () => e.cerrar());

  it('crea solo el admin inicial en el conjunto de la 0007, sin usuarios demo, y es idempotente', async () => {
    await asegurarUsuariosIniciales(e.app, { adminCorreo: 'Jefe@Mail.com', conjuntoInicial: null });
    await asegurarUsuariosIniciales(e.app, { adminCorreo: 'jefe@mail.com', conjuntoInicial: null });
    expect(await filasUsuarios(e.db)).toEqual([
      { correo: 'jefe@mail.com', slug: SLUG_CONJUNTO_INICIAL, rolMembresia: 'ADMIN', activoMembresia: true, n: 1 },
    ]);
    expect((await filasUsuarios(e.db)).some((f) => f.correo.endsWith('@demo.mailflow.test'))).toBe(false);
    expect((await conjuntos(e.db)).map((c) => [c.slug, c.activo])).toEqual([[SLUG_CONJUNTO_INICIAL, true]]);
  });

  it('audita el alta del admin una sola vez, como sistema', async () => {
    const a = await auditoria(e.db);
    expect(a).toEqual([
      { slug: SLUG_CONJUNTO_INICIAL, idUsuario: null, entidad: 'USUARIO', accion: 'CREAR', detalle: expect.any(String) },
    ]);
    expect(a[0]!.detalle).not.toMatch(/@/);
  });

  it('sin adminCorreo ni conjunto no crea nada', async () => {
    await asegurarUsuariosIniciales(e.app, { adminCorreo: null, conjuntoInicial: null });
    expect((await filasUsuarios(e.db)).map((f) => f.correo)).toEqual(['jefe@mail.com']);
    expect(await auditoria(e.db)).toHaveLength(1);
  });

  it('un usuario existente sin membresía la recibe, sin duplicar el usuario', async () => {
    const id = await crearUsuario(e.db, { nombre: 'Sin Membresia', correo: 'sinmem@mail.com', rol: 'ADMIN' });
    await e.db.q(`DELETE FROM dbo.USUARIO_CONJUNTOS WHERE idUsuario = ${id}`);
    await asegurarUsuariosIniciales(e.app, { adminCorreo: 'sinmem@mail.com', conjuntoInicial: null });
    expect((await filasUsuarios(e.db)).filter((x) => x.correo === 'sinmem@mail.com')).toEqual([
      { correo: 'sinmem@mail.com', slug: SLUG_CONJUNTO_INICIAL, rolMembresia: 'ADMIN', activoMembresia: true, n: 1 },
    ]);
  });

  it('reactiva al admin inicial si su membresía estaba inactiva y lo audita', async () => {
    const antes = (await auditoria(e.db)).length;
    await e.db.q(`UPDATE dbo.USUARIO_CONJUNTOS SET activo = 0 WHERE idUsuario = (SELECT idUsuario FROM dbo.USUARIOS WHERE correo = 'jefe@mail.com')`);
    await asegurarUsuariosIniciales(e.app, { adminCorreo: 'jefe@mail.com', conjuntoInicial: null });
    expect((await filasUsuarios(e.db)).find((x) => x.correo === 'jefe@mail.com')?.activoMembresia).toBe(true);
    const a = await auditoria(e.db);
    expect(a).toHaveLength(antes + 1);
    expect(a.at(-1)).toMatchObject({ entidad: 'USUARIO', accion: 'ACTIVAR', idUsuario: null });
  });
});

describe('asegurarUsuariosIniciales con conjunto configurado', () => {
  let e: Entorno;
  const avisos: string[] = [];
  beforeAll(async () => { e = await crearEntorno('CorreosCRM_semc'); });
  afterAll(async () => e.cerrar());

  it('crea el conjunto, pone ahí al admin y desactiva el de la 0007 si está vacío', async () => {
    await asegurarUsuariosIniciales(e.app, { adminCorreo: 'jefe@mail.com', conjuntoInicial: NUEVO, log: (m) => avisos.push(m) });
    expect(await conjuntos(e.db)).toEqual([
      { slug: SLUG_CONJUNTO_INICIAL, nombre: expect.any(String), activo: false, version: 2 },
      { slug: NUEVO.slug, nombre: NUEVO.nombre, activo: true, version: 1 },
    ]);
    expect(await filasUsuarios(e.db)).toEqual([
      { correo: 'jefe@mail.com', slug: NUEVO.slug, rolMembresia: 'ADMIN', activoMembresia: true, n: 1 },
    ]);
    expect((await auditoria(e.db)).map((a) => [a.slug, a.entidad, a.accion, a.idUsuario])).toEqual([
      [NUEVO.slug, 'CONJUNTO', 'CREAR', null],
      [SLUG_CONJUNTO_INICIAL, 'CONJUNTO', 'DESACTIVAR', null],
      [NUEVO.slug, 'USUARIO', 'CREAR', null],
    ]);
    expect(avisos).toEqual([]);
  });

  it('una segunda ejecución no duplica ni vuelve a auditar', async () => {
    const antes = await auditoria(e.db);
    await asegurarUsuariosIniciales(e.app, { adminCorreo: 'jefe@mail.com', conjuntoInicial: NUEVO });
    expect(await auditoria(e.db)).toEqual(antes);
    expect((await conjuntos(e.db)).map((c) => c.version)).toEqual([2, 1]);
    expect(await filasUsuarios(e.db)).toHaveLength(1);
  });

  it('no renombra un conjunto existente con otro nombre', async () => {
    await asegurarUsuariosIniciales(e.app, { adminCorreo: null, conjuntoInicial: { slug: NUEVO.slug, nombre: 'Otro Nombre' } });
    expect((await conjuntos(e.db)).find((c) => c.slug === NUEVO.slug)?.nombre).toBe(NUEVO.nombre);
  });

  it('reactiva el conjunto configurado si estaba inactivo', async () => {
    await e.db.q(`UPDATE dbo.CONJUNTOS SET activo = 0, version = version + 1 WHERE slug = '${NUEVO.slug}'`);
    await asegurarUsuariosIniciales(e.app, { adminCorreo: null, conjuntoInicial: NUEVO });
    expect(await conjuntos(e.db)).toContainEqual({ slug: NUEVO.slug, nombre: NUEVO.nombre, activo: true, version: 3 });
    expect((await auditoria(e.db)).at(-1)).toMatchObject({ slug: NUEVO.slug, entidad: 'CONJUNTO', accion: 'ACTIVAR', idUsuario: null });
  });

  it('hayAdminActivo es verdadero con un ADMIN activo en un conjunto activo y falso si el conjunto se desactiva', async () => {
    expect(await hayAdminActivo(e.app)).toBe(true);
    await e.db.q(`UPDATE dbo.CONJUNTOS SET activo = 0, version = version + 1 WHERE slug = '${NUEVO.slug}'`);
    expect(await hayAdminActivo(e.app)).toBe(false);
  });
});

describe('conjunto de la 0007 con datos', () => {
  let e: Entorno;
  beforeAll(async () => { e = await crearEntorno('CorreosCRM_semd'); });
  afterAll(async () => e.cerrar());

  it('no se desactiva si tiene correos y se avisa sin datos personales', async () => {
    await e.db.q(`INSERT INTO dbo.CORREOS (idConjunto, remitente, messageId) VALUES (${await idConjuntoInicial(e.db)}, 'ana@mail.com', 'm-sem-1')`);
    const avisos: string[] = [];
    await asegurarUsuariosIniciales(e.app, { adminCorreo: 'jefe@mail.com', conjuntoInicial: NUEVO, log: (m) => avisos.push(m) });
    expect((await conjuntos(e.db)).map((c) => [c.slug, c.activo])).toEqual([[SLUG_CONJUNTO_INICIAL, true], [NUEVO.slug, true]]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain(SLUG_CONJUNTO_INICIAL);
    expect(avisos[0]).not.toMatch(/@/);
    expect((await auditoria(e.db)).some((a) => a.accion === 'DESACTIVAR')).toBe(false);
  });
});

describe('arranques concurrentes', () => {
  let e: Entorno;
  beforeAll(async () => { e = await crearEntorno('CorreosCRM_semx'); });
  afterAll(async () => e.cerrar());

  it('dos semillas a la vez terminan con un solo conjunto, un usuario y una membresía', async () => {
    const op = { adminCorreo: 'jefe@mail.com', conjuntoInicial: NUEVO };
    await Promise.all([asegurarUsuariosIniciales(e.app, op), asegurarUsuariosIniciales(e.app, op)]);
    expect((await conjuntos(e.db)).filter((c) => c.slug === NUEVO.slug)).toHaveLength(1);
    expect(await filasUsuarios(e.db)).toEqual([
      { correo: 'jefe@mail.com', slug: NUEVO.slug, rolMembresia: 'ADMIN', activoMembresia: true, n: 1 },
    ]);
    const a = await auditoria(e.db);
    expect(a.filter((x) => x.entidad === 'CONJUNTO' && x.accion === 'CREAR')).toHaveLength(1);
    expect(a.filter((x) => x.entidad === 'USUARIO' && x.accion === 'CREAR')).toHaveLength(1);
  });
});
