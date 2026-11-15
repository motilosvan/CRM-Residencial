import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { EnviadorLocal } from '../modules/enviador.js';
import { ingestarCorreo } from '../modules/ingesta.js';
import { crearSesion, revocarSesion } from '../modules/sesiones.js';
import { construirApp } from './app.js';

const HOST = '127.0.0.1:3000';
const ORIGEN = 'http://localhost:5173';
const CORREO = 'admin@demo.mailflow.test';

let db: TestDb;
let inicial: number;
let norte: number;
let sur: number;
let idAdmin: number;
let app: FastifyInstance;
let appSegura: FastifyInstance;
const enviador = new EnviadorLocal(() => undefined);
const errores: string[] = [];
let ahora = new Date();
let codigoFijo = '123456';

const base = () => ({
  secreto: 'secreto-de-pruebas-con-más-de-32-caracteres',
  enviador,
  ahora: () => ahora,
  generarCodigo: () => codigoFijo,
  origenesPermitidos: new Set([ORIGEN]),
});

const pedir = (a: FastifyInstance, method: 'GET' | 'POST', url: string, opts: { cookie?: string; payload?: unknown; origin?: string } = {}) =>
  a.inject({
    method,
    url,
    headers: {
      host: HOST,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
    },
    ...(opts.payload !== undefined ? { payload: opts.payload as object } : {}),
  });

/** Valor `mailflow_sesion=...` listo para la cabecera Cookie, tomado del Set-Cookie. */
function cookieDe(r: LightMyRequestResponse): string {
  const sc = r.headers['set-cookie'];
  const linea = (Array.isArray(sc) ? sc : [sc]).find((l) => l?.startsWith('mailflow_sesion='));
  return linea!.split(';')[0]!;
}

async function nuevoConjunto(slug: string, nombre: string): Promise<number> {
  const [r] = await db.q<{ id: number }>(`INSERT INTO CONJUNTOS (slug, nombre, activo) OUTPUT inserted.idConjunto AS id VALUES ('${slug}', N'${nombre}', 1)`);
  return r!.id;
}

/** Pide y verifica un código; devuelve la respuesta de verificar. */
async function entrar(a: FastifyInstance, conjuntoId = inicial) {
  ahora = new Date(Math.max(ahora.getTime(), Date.now()) + 2 * 60_000); // supera el reenvío de 60 s del código anterior
  const c = await pedir(a, 'POST', '/api/auth/codigo', { payload: { conjuntoId: String(conjuntoId), correo: CORREO }, origin: ORIGEN });
  expect(c.statusCode).toBe(200);
  return pedir(a, 'POST', '/api/auth/verificar', {
    payload: { conjuntoId: String(conjuntoId), correo: CORREO, codigo: codigoFijo },
    origin: ORIGEN,
  });
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_acchttp');
  inicial = await idConjuntoInicial(db);
  norte = await nuevoConjunto('torres-del-norte', 'Torres del Norte');
  sur = await nuevoConjunto('villa-sur', 'Villa Sur');
  idAdmin = await crearUsuario(db, { nombre: 'Admin Demo', correo: CORREO, rol: 'ADMIN' });
  await db.q(`INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) VALUES (${idAdmin}, ${norte}, 'SOPORTE')`);
  await ingestarCorreo(db.pool, { messageId: '<norte-1@mail>', remitente: 'vecino@mail.com', asunto: 'Asunto del norte', cuerpo: 'x', idConjunto: norte });
  await ingestarCorreo(db.pool, { messageId: '<ini-1@mail>', remitente: 'vecino2@mail.com', asunto: 'Asunto inicial', cuerpo: 'y' });
  const comunes = { pool: db.pool, hostsPermitidos: new Set([HOST]), registrarError: (d: string) => errores.push(d) };
  app = construirApp({ ...comunes, acceso: { ...base(), cookieSegura: false } });
  appSegura = construirApp({ ...comunes, acceso: { ...base(), cookieSegura: true } });
});
afterAll(async () => {
  await app.close();
  await appSegura.close();
  await db.close();
});

describe('Acceso HTTP · conjuntos', () => {
  it('GET /api/conjuntos es público y lista solo los activos', async () => {
    const r = await pedir(app, 'GET', '/api/conjuntos');
    expect(r.statusCode).toBe(200);
    const lista = r.json<{ id: string; slug: string }[]>();
    expect(lista.map((c) => c.slug)).toEqual(expect.arrayContaining(['parque-central-occidente', 'torres-del-norte', 'villa-sur']));
  });
});

describe('Acceso HTTP · flujo completo', () => {
  it('codigo → verificar → sesion → conjunto → salir → sesion 401', async () => {
    const c = await pedir(app, 'POST', '/api/auth/codigo', { payload: { conjuntoId: String(inicial), correo: CORREO }, origin: ORIGEN });
    expect(c.statusCode).toBe(200);
    expect(Object.keys(c.json()).sort()).toEqual(['reenvioDisponibleEn', 'venceEn']);

    const v = await pedir(app, 'POST', '/api/auth/verificar', {
      payload: { conjuntoId: String(inicial), correo: CORREO, codigo: codigoFijo },
      origin: ORIGEN,
    });
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ usuario: { correo: CORREO, rol: 'ADMIN' }, conjuntoActivo: { id: String(inicial) } });
    expect(v.json()).not.toHaveProperty('idSesion');

    const sc = String(v.headers['set-cookie']);
    expect(sc).toMatch(/^mailflow_sesion=[A-Za-z0-9_-]{43};/);
    expect(sc).toContain('HttpOnly');
    expect(sc).toContain('SameSite=Lax');
    expect(sc).toContain('Path=/api');
    expect(sc).not.toContain('Secure');
    const cookie = cookieDe(v);

    const s = await pedir(app, 'GET', '/api/auth/sesion', { cookie });
    expect(s.statusCode).toBe(200);
    expect(s.json()).toMatchObject({ usuario: { correo: CORREO } });

    const cambio = await pedir(app, 'POST', '/api/auth/conjunto', { cookie, payload: { conjuntoId: String(norte) }, origin: ORIGEN });
    expect(cambio.statusCode).toBe(200);
    expect(cambio.json()).toMatchObject({ conjuntoActivo: { id: String(norte) }, usuario: { rol: 'SOPORTE' } });

    const sinMembresia = await pedir(app, 'POST', '/api/auth/conjunto', { cookie, payload: { conjuntoId: String(sur) }, origin: ORIGEN });
    expect(sinMembresia.statusCode).toBe(403);
    expect(sinMembresia.json()).toMatchObject({ codigo: 'SIN_MEMBRESIA' });

    const invalido = await pedir(app, 'POST', '/api/auth/conjunto', { cookie, payload: { conjuntoId: 'abc' }, origin: ORIGEN });
    expect(invalido.statusCode).toBe(422);

    const sinCookie = await pedir(app, 'POST', '/api/auth/conjunto', { payload: { conjuntoId: String(norte) }, origin: ORIGEN });
    expect(sinCookie.statusCode).toBe(401);

    const salir = await pedir(app, 'POST', '/api/auth/salir', { cookie, origin: ORIGEN });
    expect(salir.statusCode).toBe(200);
    expect(salir.json()).toEqual({ ok: true });
    const vacia = String(salir.headers['set-cookie']);
    expect(vacia).toMatch(/^mailflow_sesion=;/);
    expect(vacia).toContain('Path=/api');
    expect(vacia).toMatch(/Expires=Thu, 01 Jan 1970/);

    const despues = await pedir(app, 'GET', '/api/auth/sesion', { cookie });
    expect(despues.statusCode).toBe(401);
    expect(despues.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });

  it('con cookieSegura la cookie lleva Secure (y al vaciarla también)', async () => {
    const v = await entrar(appSegura);
    expect(v.statusCode).toBe(200);
    expect(String(v.headers['set-cookie'])).toContain('Secure');
    const salir = await pedir(appSegura, 'POST', '/api/auth/salir', { cookie: cookieDe(v) });
    expect(String(salir.headers['set-cookie'])).toContain('Secure');
  });

  it('POST /api/auth/salir sin cookie ⇒ 200', async () => {
    const r = await pedir(app, 'POST', '/api/auth/salir');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
  });

  it('SESION_INACTIVA tras 30 min sin actividad', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: inicial }, new Date(Date.now() - 31 * 60_000));
    const r = await pedir(app, 'GET', '/api/auth/sesion', { cookie: `mailflow_sesion=${token}` });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ codigo: 'SESION_INACTIVA' });
  });
});

describe('Acceso HTTP · errores del contrato', () => {
  it('422 con cuerpo inválido o conjunto inexistente; el cuerpo trae `error`', async () => {
    for (const payload of [{ conjuntoId: String(inicial), correo: 'no-es-correo' }, { conjuntoId: '999999', correo: CORREO }, {}]) {
      const r = await pedir(app, 'POST', '/api/auth/codigo', { payload });
      expect(r.statusCode).toBe(422);
      expect(typeof r.json<{ error: string }>().error).toBe('string');
    }
    expect((await pedir(app, 'POST', '/api/auth/verificar', { payload: { conjuntoId: String(inicial), correo: CORREO, codigo: '12' } })).statusCode).toBe(422);
  });

  it('429 REENVIO_PRONTO; 400 con intentosRestantes; 410 vencido; 429 BLOQUEADO con desbloqueoEn', async () => {
    const correo = 'bloqueo@demo.mailflow.test';
    await crearUsuario(db, { nombre: 'Bloqueo', correo, rol: 'SOPORTE' });
    const body = { conjuntoId: String(inicial), correo };
    ahora = new Date('2026-11-15T12:00:00Z');
    codigoFijo = '111111';
    expect((await pedir(app, 'POST', '/api/auth/codigo', { payload: body })).statusCode).toBe(200);

    const pronto = await pedir(app, 'POST', '/api/auth/codigo', { payload: body });
    expect(pronto.statusCode).toBe(429);
    expect(pronto.json()).toMatchObject({ codigo: 'REENVIO_PRONTO' });

    const mal = await pedir(app, 'POST', '/api/auth/verificar', { payload: { ...body, codigo: '000000' } });
    expect(mal.statusCode).toBe(400);
    expect(mal.json()).toMatchObject({ codigo: 'CODIGO_INCORRECTO', intentosRestantes: 4 });

    ahora = new Date('2026-11-15T12:11:00Z');
    const vencido = await pedir(app, 'POST', '/api/auth/verificar', { payload: { ...body, codigo: '111111' } });
    expect(vencido.statusCode).toBe(410);
    expect(vencido.json()).toMatchObject({ codigo: 'CODIGO_VENCIDO' });

    ahora = new Date('2026-11-15T13:00:00Z');
    expect((await pedir(app, 'POST', '/api/auth/codigo', { payload: body })).statusCode).toBe(200);
    let ultima!: LightMyRequestResponse;
    for (let i = 0; i < 5; i++) ultima = await pedir(app, 'POST', '/api/auth/verificar', { payload: { ...body, codigo: '000000' } });
    expect(ultima.statusCode).toBe(429);
    expect(ultima.json()).toMatchObject({ codigo: 'BLOQUEADO', desbloqueoEn: ahora.getTime() + 15 * 60_000 });
    const sigue = await pedir(app, 'POST', '/api/auth/codigo', { payload: body });
    expect(sigue.statusCode).toBe(429);
    expect(sigue.json()).toMatchObject({ codigo: 'BLOQUEADO' });
  });
});

describe('Acceso HTTP · Origin', () => {
  it('un POST con Origin ajeno ⇒ 403 en todas las rutas POST', async () => {
    for (const url of ['/api/auth/codigo', '/api/auth/verificar', '/api/auth/conjunto', '/api/auth/salir']) {
      const r = await pedir(app, 'POST', url, { payload: { conjuntoId: '1', correo: CORREO }, origin: 'http://malicioso.test' });
      expect(r.statusCode).toBe(403);
    }
  });

  it('un Origin permitido o ausente pasa; un GET con Origin ajeno no se bloquea', async () => {
    expect((await pedir(app, 'POST', '/api/auth/salir', { origin: ORIGEN })).statusCode).toBe(200);
    expect((await pedir(app, 'POST', '/api/auth/salir')).statusCode).toBe(200);
    expect((await pedir(app, 'GET', '/api/conjuntos', { origin: 'http://malicioso.test' })).statusCode).toBe(200);
  });
});

describe('Acceso HTTP · cookies inválidas', () => {
  it('ausente, malformada, desconocida y revocada ⇒ 401 sin registrar error', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: inicial });
    await revocarSesion(db.pool, token);
    const cookies = [undefined, 'mailflow_sesion=%%%no-valida', `mailflow_sesion=${'A'.repeat(43)}`, `mailflow_sesion=${token}`];
    const antes = errores.length;
    for (const cookie of cookies) {
      for (const url of ['/api/auth/sesion', '/api/correos', '/api/gateway/estado']) {
        const r = await pedir(app, 'GET', url, { cookie });
        expect(r.statusCode).toBe(401);
        expect(r.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
      }
    }
    expect(errores.length).toBe(antes);
  });
});

describe('Acceso HTTP · aislamiento por conjunto', () => {
  it('el buzón es el del conjunto activo y un correo de otro conjunto ⇒ 404', async () => {
    const v = await entrar(app);
    const cookie = cookieDe(v);
    const ini = await pedir(app, 'GET', '/api/correos', { cookie });
    expect(ini.json<{ correos: { asunto: string }[] }>().correos.map((c) => c.asunto)).toEqual(['Asunto inicial']);

    const [{ id: idNorte }] = (await db.q<{ id: number }>(`SELECT idCorreo AS id FROM CORREOS WHERE asunto = 'Asunto del norte'`)) as [{ id: number }];
    const [{ id: idIni }] = (await db.q<{ id: number }>(`SELECT idCorreo AS id FROM CORREOS WHERE asunto = 'Asunto inicial'`)) as [{ id: number }];
    expect((await pedir(app, 'GET', `/api/correos/${idIni}`, { cookie })).statusCode).toBe(200);
    expect((await pedir(app, 'GET', `/api/correos/${idNorte}`, { cookie })).statusCode).toBe(404);

    await pedir(app, 'POST', '/api/auth/conjunto', { cookie, payload: { conjuntoId: String(norte) } });
    const enNorte = await pedir(app, 'GET', '/api/correos', { cookie });
    expect(enNorte.json<{ correos: { asunto: string }[] }>().correos.map((c) => c.asunto)).toEqual(['Asunto del norte']);
    expect((await pedir(app, 'GET', `/api/correos/${idNorte}`, { cookie })).statusCode).toBe(200);
    expect((await pedir(app, 'GET', `/api/correos/${idIni}`, { cookie })).statusCode).toBe(404);
  });
});
