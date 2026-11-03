import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { crearPool } from '../db/pool.js';
import { ingestarCorreo } from '../modules/ingesta.js';
import { construirApp } from './app.js';

let db: TestDb;
let app: FastifyInstance;
const errores: string[] = [];
const HOST = '127.0.0.1:3000';

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_http');
  await db.q(`INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES (N'Ana Pérez', 'T1-101', 'ana@mail.com')`);
  await ingestarCorreo(db.pool, {
    messageId: '<http-1@mail>', remitente: 'ana@mail.com', asunto: 'Fuga en el baño', cuerpo: 'Hay agua 💧',
    checkpoint: { cuenta: 'buzon@gmail.com/INBOX', uidValidity: 3, uid: 10 },
  });
  await ingestarCorreo(db.pool, { messageId: '<http-2@mail>', remitente: 'otro@mail.com', asunto: 'Paz y salvo', cuerpo: '' });
  app = construirApp({ pool: db.pool, hostsPermitidos: new Set([HOST]), registrarError: (d) => errores.push(d) });
});
afterAll(async () => {
  await app.close();
  await db.close();
});

const get = (url: string, host = HOST) => app.inject({ method: 'GET', url, headers: { host } });

describe('API · buzón', () => {
  it('GET /api/correos lista el buzón con residente, solicitud y fechas ISO', async () => {
    const r = await get('/api/correos');
    expect(r.statusCode).toBe(200);
    const body = r.json<{ total: number; correos: Record<string, unknown>[] }>();
    expect(body.total).toBe(2);
    const fuga = body.correos.find((c) => c.asunto === 'Fuga en el baño')!;
    expect(fuga).toMatchObject({ residente: 'Ana Pérez', unidad: 'T1-101', estado: 'NUEVA', categoria: 'MANTENIMIENTO' });
    expect(fuga.fechaRecepcion).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('GET /api/correos?q= filtra; parámetros inválidos ⇒ 422', async () => {
    expect((await get('/api/correos?q=paz')).json<{ total: number }>().total).toBe(1);
    expect((await get('/api/correos?q=')).json<{ total: number }>().total).toBe(2);
    expect((await get('/api/correos?limite=abc')).statusCode).toBe(422);
    expect((await get('/api/correos?limite=500')).statusCode).toBe(422);
    expect((await get('/api/correos?q=a&q=b')).statusCode).toBe(422);
  });

  it('GET /api/correos/:id devuelve el cuerpo completo; 404 si no existe; 422 si el id no es válido', async () => {
    const { correos } = (await get('/api/correos?q=fuga')).json<{ correos: { id: number }[] }>();
    const r = await get(`/api/correos/${correos[0]!.id}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ cuerpo: 'Hay agua 💧', remitente: 'ana@mail.com' });
    expect((await get('/api/correos/999999')).statusCode).toBe(404);
    expect((await get('/api/correos/abc')).statusCode).toBe(422);
  });

  it('GET /api/gateway/estado informa la cuenta leída y el volumen', async () => {
    const r = await get('/api/gateway/estado');
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ totalCorreos: 2, cuentas: [{ cuenta: 'buzon@gmail.com/INBOX', ultimoUid: 10 }] });
  });
});

describe('API · defensas', () => {
  it('rechaza un Host ajeno (DNS rebinding) con 421', async () => {
    expect((await get('/api/correos', 'evil.example:3000')).statusCode).toBe(421);
  });

  it('ruta inexistente ⇒ 404 JSON; no hay rutas de escritura todavía', async () => {
    expect((await get('/api/nada')).statusCode).toBe(404);
    const post = await app.inject({ method: 'POST', url: '/api/correos', headers: { host: HOST }, payload: {} });
    expect(post.statusCode).toBe(404);
  });

  it('BD inalcanzable ⇒ 500 genérico y el registro lleva solo tipo y código', async () => {
    const cerrado = await crearPool(db.config, { max: 1 });
    await cerrado.close();
    const roto = construirApp({ pool: cerrado, hostsPermitidos: new Set([HOST]), registrarError: (d) => errores.push(d) });
    const r = await roto.inject({ method: 'GET', url: '/api/correos', headers: { host: HOST } });
    await roto.close();
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ error: 'Error interno' });
    expect(errores.at(-1)).toMatch(/^Error interno: \w+/);
  });
});
