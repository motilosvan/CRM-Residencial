import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ErrorConexionBuzon, type DepsBuzon, type ResultadoSincronizacionBuzon } from '../modules/buzones.js';
import { EnviadorLocal } from '../modules/enviador.js';
import { crearSesion } from '../modules/sesiones.js';
import { construirApp, type OpcionesApp } from './app.js';

let db: TestDb;
let app: FastifyInstance;
let sinBuzon: FastifyInstance;
let cookieAdmin: string;
let cookieSoporte: string;

const HOST = '127.0.0.1:3000';
const ORIGIN = 'http://localhost:5173';
const CLAVE = 'abcd efgh ijkl mnop';
const CORREO = 'buzon-http@demo.mailflow.test';
const acceso: OpcionesApp['acceso'] = {
  secreto: 'secreto-de-pruebas-con-más-de-32-caracteres',
  enviador: new EnviadorLocal(() => undefined),
  cookieSegura: false,
  origenesPermitidos: new Set([ORIGIN]),
};

/** Comportamiento de las dependencias IMAP falsas, ajustable por prueba. */
const falso = {
  falloPrueba: null as ErrorConexionBuzon | null,
  esperar: null as Promise<void> | null,
  empezo: null as (() => void) | null,
  resultado: { revisados: 2, nuevos: 1, duplicados: 1, respaldos: 0, pendientes: false } as ResultadoSincronizacionBuzon,
};
const buzon: DepsBuzon = {
  secreto: acceso.secreto,
  hostsPermitidos: new Set(['imap.gmail.com']),
  probarConexion: async () => {
    if (falso.falloPrueba) throw falso.falloPrueba;
  },
  ejecutarSincronizacion: async () => {
    falso.empezo?.();
    if (falso.esperar) await falso.esperar;
    // Campos extra no deben llegar a la respuesta.
    return { ...falso.resultado, extra: 'no-debe-salir' } as ResultadoSincronizacionBuzon;
  },
};

const req = (
  instancia: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  opts: { cookie?: string; payload?: unknown; origin?: string } = {},
) =>
  instancia.inject({
    method,
    url,
    headers: {
      host: HOST,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(method !== 'GET' ? { origin: opts.origin ?? ORIGIN } : {}),
    },
    ...(opts.payload !== undefined ? { payload: opts.payload as Record<string, unknown> } : {}),
  });

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_buzhttp');
  const conj = await idConjuntoInicial(db);
  const idAdmin = await crearUsuario(db, { nombre: 'Admin', correo: 'admin-buz@demo.mailflow.test', rol: 'ADMIN' });
  const idSoporte = await crearUsuario(db, { nombre: 'Soporte', correo: 'soporte-buz@demo.mailflow.test', rol: 'SOPORTE' });
  cookieAdmin = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conj })).token}`;
  cookieSoporte = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idSoporte, idConjunto: conj })).token}`;
  app = construirApp({ pool: db.pool, hostsPermitidos: new Set([HOST]), acceso, buzon });
  sinBuzon = construirApp({ pool: db.pool, hostsPermitidos: new Set([HOST]), acceso });
});

afterAll(async () => {
  await app.close();
  await sinBuzon.close();
  await db.close();
});

describe('API · buzón del conjunto', () => {
  it('401 sin sesión en las tres rutas', async () => {
    for (const [m, url] of [
      ['PUT', '/api/buzon'],
      ['POST', '/api/buzon/desconectar'],
      ['POST', '/api/buzon/sincronizar'],
    ] as const) {
      const r = await req(app, m, url, { payload: {} });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
    }
  });

  it('un PUT con Origin ajeno se rechaza (403) antes de tocar nada', async () => {
    const r = await req(app, 'PUT', '/api/buzon', {
      cookie: cookieAdmin, origin: 'https://evil.example', payload: { correo: CORREO, contrasena: CLAVE },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ error: 'Origen no permitido' });
  });

  it('sin buzón conectado, sincronizar responde 422 y desconectar 404', async () => {
    expect((await req(app, 'POST', '/api/buzon/sincronizar', { cookie: cookieSoporte, payload: {} })).statusCode).toBe(422);
    expect((await req(app, 'POST', '/api/buzon/desconectar', { cookie: cookieAdmin, payload: {} })).statusCode).toBe(404);
  });

  it('403 para SOPORTE al conectar y al desconectar', async () => {
    const r = await req(app, 'PUT', '/api/buzon', { cookie: cookieSoporte, payload: { correo: CORREO, contrasena: CLAVE } });
    expect(r.statusCode).toBe(403);
    expect((await req(app, 'POST', '/api/buzon/desconectar', { cookie: cookieSoporte, payload: {} })).statusCode).toBe(403);
  });

  it('422 si la prueba IMAP falla o la entrada es inválida, sin filtrar la dirección', async () => {
    falso.falloPrueba = new ErrorConexionBuzon('AUTENTICACION');
    try {
      const r = await req(app, 'PUT', '/api/buzon', { cookie: cookieAdmin, payload: { correo: CORREO, contrasena: CLAVE } });
      expect(r.statusCode).toBe(422);
      expect(r.json().error).toMatch(/contraseña de aplicación/);
      expect(r.body).not.toContain(CORREO);
    } finally {
      falso.falloPrueba = null;
    }
    const mala = await req(app, 'PUT', '/api/buzon', { cookie: cookieAdmin, payload: { correo: 'x', contrasena: CLAVE } });
    expect(mala.statusCode).toBe(422);
    const interno = await req(app, 'PUT', '/api/buzon', {
      cookie: cookieAdmin, payload: { correo: CORREO, contrasena: CLAVE, imapHost: '127.0.0.1', imapPort: 6379 },
    });
    expect(interno.statusCode).toBe(422);
  });

  it('PUT conecta (200 con el estado del gateway, sin la contraseña) y 409 ante versionEsperada vieja', async () => {
    const r = await req(app, 'PUT', '/api/buzon', { cookie: cookieAdmin, payload: { correo: CORREO, contrasena: CLAVE } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ conectado: true, buzon: { correo: CORREO, activo: true, version: 1 }, cuentas: [] });
    expect(r.body).not.toMatch(/contrasena/i);
    expect(r.body).not.toContain('abcdefghijklmnop');

    const viejo = await req(app, 'PUT', '/api/buzon', {
      cookie: cookieAdmin, payload: { correo: CORREO, contrasena: CLAVE, versionEsperada: 7 },
    });
    expect(viejo.statusCode).toBe(409);

    const estado = await req(app, 'GET', '/api/gateway/estado', { cookie: cookieSoporte });
    expect(estado.json()).toMatchObject({ conectado: true, buzon: { version: 1 } });
    expect(estado.body).not.toMatch(/contrasena/i);
  });

  it('POST sincronizar: 200 con solo los cinco contadores; 409 si ya hay otra en curso', async () => {
    const r = await req(app, 'POST', '/api/buzon/sincronizar', { cookie: cookieSoporte, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ revisados: 2, nuevos: 1, duplicados: 1, respaldos: 0, pendientes: false });

    let soltar!: () => void;
    falso.esperar = new Promise<void>((s) => (soltar = s));
    const empezo = new Promise<void>((s) => (falso.empezo = s));
    try {
      const primera = req(app, 'POST', '/api/buzon/sincronizar', { cookie: cookieAdmin, payload: {} });
      await empezo;
      expect((await req(app, 'POST', '/api/buzon/sincronizar', { cookie: cookieSoporte, payload: {} })).statusCode).toBe(409);
      soltar();
      expect((await primera).statusCode).toBe(200);
    } finally {
      falso.esperar = null;
      falso.empezo = null;
    }
  });

  it('POST desconectar: 409 con versión vieja; 200 con el estado desconectado', async () => {
    expect((await req(app, 'POST', '/api/buzon/desconectar', { cookie: cookieAdmin, payload: { versionEsperada: 9 } })).statusCode).toBe(409);
    const r = await req(app, 'POST', '/api/buzon/desconectar', { cookie: cookieAdmin, payload: { versionEsperada: 1 } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ conectado: false, buzon: { activo: false, version: 2 } });
  });

  it('si la app no recibe dependencias de buzón, las rutas no existen (404)', async () => {
    const r = await req(sinBuzon, 'PUT', '/api/buzon', { cookie: cookieAdmin, payload: { correo: CORREO, contrasena: CLAVE } });
    expect(r.statusCode).toBe(404);
    expect((await req(sinBuzon, 'POST', '/api/buzon/sincronizar', { cookie: cookieAdmin, payload: {} })).statusCode).toBe(404);
  });
});
