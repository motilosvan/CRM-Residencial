import type { FastifyInstance } from 'fastify';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { EnviadorLocal } from '../modules/enviador.js';
import { crearSesion } from '../modules/sesiones.js';
import { construirApp, type OpcionesApp } from './app.js';

let db: TestDb;
let app: FastifyInstance;
let conjA: number;
let idAdminA: number;
let idSoporteA: number;
let idSoporteB: number;
let cookieAdminA: string;
let cookieSoporteA: string;

const HOST = '127.0.0.1:3000';
const ORIGIN = 'http://localhost:5173';
const acceso: OpcionesApp['acceso'] = {
  secreto: 'secreto-de-pruebas-con-más-de-32-caracteres',
  enviador: new EnviadorLocal(() => undefined),
  cookieSegura: false,
  origenesPermitidos: new Set([ORIGIN]),
};

const req = (
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  opts: { cookie?: string; payload?: unknown; origin?: string } = {},
) =>
  app.inject({
    method,
    url,
    headers: {
      host: HOST,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(method !== 'GET' ? { origin: opts.origin ?? ORIGIN } : {}),
    },
    ...(opts.payload !== undefined ? { payload: opts.payload as Record<string, unknown> } : {}),
  });

async function nuevoConjunto(slug: string): Promise<number> {
  const r = await db.pool
    .request()
    .input('slug', sql.VarChar(80), slug)
    .input('nombre', sql.NVarChar(120), slug)
    .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)');
  return r.recordset[0]!.id;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_usrhttp');
  conjA = await nuevoConjunto('usr-http-a');
  await nuevoConjunto('usr-http-b');
  idAdminA = await crearUsuario(db, { nombre: 'Admin A', correo: 'admin-a@demo.mailflow.test', rol: 'ADMIN', slug: 'usr-http-a' });
  idSoporteA = await crearUsuario(db, { nombre: 'Soporte A', correo: 'sop-a@demo.mailflow.test', rol: 'SOPORTE', slug: 'usr-http-a' });
  idSoporteB = await crearUsuario(db, { nombre: 'Soporte B', correo: 'sop-b@demo.mailflow.test', rol: 'SOPORTE', slug: 'usr-http-b' });
  cookieAdminA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idAdminA, idConjunto: conjA })).token}`;
  cookieSoporteA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idSoporteA, idConjunto: conjA })).token}`;
  app = construirApp({ pool: db.pool, hostsPermitidos: new Set([HOST]), acceso });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.close();
});

describe('POST /api/usuarios', () => {
  it('401 sin sesión', async () => {
    const r = await req('POST', '/api/usuarios', { payload: { nombre: 'X', correo: 'x@demo.mailflow.test', rol: 'SOPORTE' } });
    expect(r.statusCode).toBe(401);
  });

  it('403 para SOPORTE', async () => {
    const r = await req('POST', '/api/usuarios', { cookie: cookieSoporteA, payload: { nombre: 'X', correo: 'x@demo.mailflow.test', rol: 'SOPORTE' } });
    expect(r.statusCode).toBe(403);
  });

  it('403 con Origin ajeno', async () => {
    const r = await req('POST', '/api/usuarios', {
      cookie: cookieAdminA,
      origin: 'https://malo.example',
      payload: { nombre: 'X', correo: 'x@demo.mailflow.test', rol: 'SOPORTE' },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ error: 'Origen no permitido' });
  });

  it('201 con el UsuarioConjunto creado', async () => {
    const r = await req('POST', '/api/usuarios', {
      cookie: cookieAdminA,
      payload: { nombre: ' Nueva Persona ', correo: 'Nueva@Demo.Mailflow.Test', rol: 'SOPORTE' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ id: expect.any(Number), nombre: 'Nueva Persona', correo: 'nueva@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1 });
  });

  it('409 si ya es miembro activo', async () => {
    const r = await req('POST', '/api/usuarios', { cookie: cookieAdminA, payload: { nombre: 'Soporte A', correo: 'sop-a@demo.mailflow.test', rol: 'SOPORTE' } });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ error: 'Ese usuario ya pertenece al conjunto' });
  });

  it('422 con datos inválidos o cuerpo ausente', async () => {
    expect((await req('POST', '/api/usuarios', { cookie: cookieAdminA, payload: { nombre: 'X', correo: 'malo', rol: 'SOPORTE' } })).statusCode).toBe(422);
    expect((await req('POST', '/api/usuarios', { cookie: cookieAdminA, payload: { nombre: 'X', correo: 'x@demo.mailflow.test', rol: 'ROOT' } })).statusCode).toBe(422);
    expect((await req('POST', '/api/usuarios', { cookie: cookieAdminA })).statusCode).toBe(422);
  });
});

describe('PATCH /api/usuarios/:id', () => {
  it('401 sin sesión', async () => {
    expect((await req('PATCH', `/api/usuarios/${idSoporteA}`, { payload: { rol: 'ADMIN', versionEsperada: 1 } })).statusCode).toBe(401);
  });

  it('403 para SOPORTE', async () => {
    const r = await req('PATCH', `/api/usuarios/${idSoporteA}`, { cookie: cookieSoporteA, payload: { rol: 'ADMIN', versionEsperada: 1 } });
    expect(r.statusCode).toBe(403);
  });

  it('403 con Origin ajeno (el control cubre PATCH)', async () => {
    const r = await req('PATCH', `/api/usuarios/${idSoporteA}`, {
      cookie: cookieAdminA,
      origin: 'https://malo.example',
      payload: { rol: 'ADMIN', versionEsperada: 1 },
    });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toEqual({ error: 'Origen no permitido' });
  });

  it('404 para un usuario de otro conjunto o inexistente', async () => {
    expect((await req('PATCH', `/api/usuarios/${idSoporteB}`, { cookie: cookieAdminA, payload: { rol: 'ADMIN', versionEsperada: 1 } })).statusCode).toBe(404);
    expect((await req('PATCH', '/api/usuarios/999999999', { cookie: cookieAdminA, payload: { rol: 'ADMIN', versionEsperada: 1 } })).statusCode).toBe(404);
  });

  it('422 con id no numérico, sin cambios pedidos o sin versionEsperada', async () => {
    expect((await req('PATCH', '/api/usuarios/abc', { cookie: cookieAdminA, payload: { rol: 'ADMIN', versionEsperada: 1 } })).statusCode).toBe(422);
    expect((await req('PATCH', `/api/usuarios/${idSoporteA}`, { cookie: cookieAdminA, payload: { versionEsperada: 1 } })).statusCode).toBe(422);
    expect((await req('PATCH', `/api/usuarios/${idSoporteA}`, { cookie: cookieAdminA, payload: { rol: 'ADMIN' } })).statusCode).toBe(422);
  });

  it('422 al degradar o desactivar al último ADMIN', async () => {
    const r = await req('PATCH', `/api/usuarios/${idAdminA}`, { cookie: cookieAdminA, payload: { rol: 'SOPORTE', versionEsperada: 1 } });
    expect(r.statusCode).toBe(422);
    expect((await req('PATCH', `/api/usuarios/${idAdminA}`, { cookie: cookieAdminA, payload: { activo: false, versionEsperada: 1 } })).statusCode).toBe(422);
  });

  it('200 con el UsuarioConjunto actualizado, y 409 con la versión vieja', async () => {
    const r = await req('PATCH', `/api/usuarios/${idSoporteA}`, { cookie: cookieAdminA, payload: { rol: 'ADMIN', versionEsperada: 1 } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ id: idSoporteA, nombre: 'Soporte A', correo: 'sop-a@demo.mailflow.test', rol: 'ADMIN', activo: true, version: 2 });
    const viejo = await req('PATCH', `/api/usuarios/${idSoporteA}`, { cookie: cookieAdminA, payload: { rol: 'SOPORTE', versionEsperada: 1 } });
    expect(viejo.statusCode).toBe(409);
    // restaurar: soporteA vuelve a SOPORTE para no afectar otras pruebas
    expect((await req('PATCH', `/api/usuarios/${idSoporteA}`, { cookie: cookieAdminA, payload: { rol: 'SOPORTE', versionEsperada: 2 } })).statusCode).toBe(200);
  });
});

describe('GET /api/usuarios?incluirInactivos', () => {
  it('por defecto solo activos; con incluirInactivos=true también los inactivos; el desactivado pierde la sesión', async () => {
    const desact = await req('PATCH', `/api/usuarios/${idSoporteA}`, { cookie: cookieAdminA, payload: { activo: false, versionEsperada: 3 } });
    expect(desact.statusCode).toBe(200);
    const activos = (await req('GET', '/api/usuarios', { cookie: cookieAdminA })).json<{ id: number }[]>();
    expect(activos.map((u) => u.id)).not.toContain(idSoporteA);
    const todos = (await req('GET', '/api/usuarios?incluirInactivos=true', { cookie: cookieAdminA })).json<{ id: number; activo: boolean }[]>();
    expect(todos.find((u) => u.id === idSoporteA)).toMatchObject({ activo: false });
    expect((await req('GET', '/api/usuarios?incluirInactivos=true', { cookie: cookieSoporteA })).statusCode).toBe(401);
  });
});
