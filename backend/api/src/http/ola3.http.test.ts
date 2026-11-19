import type { FastifyInstance } from 'fastify';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { EnviadorLocal } from '../modules/enviador.js';
import { ingestarCorreo } from '../modules/ingesta.js';
import { crearResidenteConjunto } from '../modules/residentes.js';
import { crearSesion } from '../modules/sesiones.js';
import { construirApp, type OpcionesApp } from './app.js';

let db: TestDb;
let app: FastifyInstance;
let conjA: number;
let conjB: number;
let cookieAdminA: string;
let cookieSoporteA: string;
let cookieAdminB: string;
let solA1: number;
let solB1: number;

const HOST = '127.0.0.1:3000';
const ORIGIN = 'http://localhost:5173';
const acceso: OpcionesApp['acceso'] = {
  secreto: 'secreto-de-pruebas-con-más-de-32-caracteres',
  enviador: new EnviadorLocal(() => undefined),
  cookieSegura: false,
  origenesPermitidos: new Set([ORIGIN]),
};

const req = (
  method: 'GET' | 'POST',
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

async function nuevoConjunto(slug: string, nombre: string): Promise<number> {
  const r = await db.pool
    .request()
    .input('slug', sql.VarChar(80), slug)
    .input('nombre', sql.NVarChar(120), nombre)
    .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)');
  return r.recordset[0]!.id;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_ola3');
  conjA = await nuevoConjunto('ola3-a', 'Conjunto Ola3 A');
  conjB = await nuevoConjunto('ola3-b', 'Conjunto Ola3 B');

  const idAdminA = await crearUsuario(db, { nombre: 'Admin O3 A', correo: 'admin-o3a@demo.mailflow.test', rol: 'ADMIN', slug: 'ola3-a' });
  const idSoporteA = await crearUsuario(db, { nombre: 'Soporte O3 A', correo: 'sop-o3a@demo.mailflow.test', rol: 'SOPORTE', slug: 'ola3-a' });
  const idAdminB = await crearUsuario(db, { nombre: 'Admin O3 B', correo: 'admin-o3b@demo.mailflow.test', rol: 'ADMIN', slug: 'ola3-b' });

  cookieAdminA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idAdminA, idConjunto: conjA })).token}`;
  cookieSoporteA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idSoporteA, idConjunto: conjA })).token}`;
  cookieAdminB = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idAdminB, idConjunto: conjB })).token}`;

  await crearResidenteConjunto(db.pool, { idUsuario: idAdminA, rol: 'ADMIN', idConjunto: conjA }, {
    nombre: 'Residente O3 A',
    unidad: 'T1-101',
    correo: 'res-o3a@demo.mailflow.test',
  });

  const iA = await ingestarCorreo(db.pool, {
    messageId: '<o3-a1@test>',
    remitente: 'res-o3a@demo.mailflow.test',
    asunto: 'Fuga en sótano',
    cuerpo: 'Hay una fuga de agua',
    idConjunto: conjA,
  });
  const iB = await ingestarCorreo(db.pool, {
    messageId: '<o3-b1@test>',
    remitente: 'res-o3b@demo.mailflow.test',
    asunto: 'Asunto B',
    cuerpo: 'Cuerpo B',
    idConjunto: conjB,
  });
  if (iA.duplicado || iB.duplicado) throw new Error('duplicado inesperado');
  solA1 = iA.idSolicitud;
  solB1 = iB.idSolicitud;

  app = construirApp({ pool: db.pool, hostsPermitidos: new Set([HOST]), acceso });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('Ola 3 HTTP · GET /api/auditoria', () => {
  it('exige autenticación (401) y rol ADMIN (403 para SOPORTE)', async () => {
    expect((await req('GET', '/api/auditoria')).statusCode).toBe(401);
    expect((await req('GET', '/api/auditoria', { cookie: cookieSoporteA })).statusCode).toBe(403);
  });

  it('devuelve eventos paginados del conjunto para ADMIN, filtrables por ?q= y aislados entre conjuntos', async () => {
    const r = await req('GET', '/api/auditoria', { cookie: cookieAdminA });
    expect(r.statusCode).toBe(200);
    const body = r.json<{
      total: number;
      eventos: { tipo: string; entidad: string; codigo: string; accion: string; actor: string; detalle: string | null; fecha: string }[];
    }>();
    expect(body.total).toBeGreaterThanOrEqual(2);
    const codA = `SOL-${String(solA1).padStart(6, '0')}`;
    const codB = `SOL-${String(solB1).padStart(6, '0')}`;
    expect(body.eventos.some((e) => e.codigo === codA && e.tipo === 'ESTADO')).toBe(true);
    expect(body.eventos.some((e) => e.entidad === 'RESIDENTE' && e.tipo === 'ADMIN')).toBe(true);
    expect(body.eventos.some((e) => e.codigo === codB)).toBe(false);

    // Filtro por q y paginación
    const rQ = await req('GET', `/api/auditoria?q=${codA}&limite=1&desplazamiento=0`, { cookie: cookieAdminA });
    expect(rQ.statusCode).toBe(200);
    expect(rQ.json<{ total: number; eventos: unknown[] }>().total).toBe(1);
    expect(rQ.json<{ eventos: { codigo: string }[] }>().eventos).toHaveLength(1);

    // Conjunto B no ve eventos de A
    const rB = await req('GET', `/api/auditoria?q=${codA}`, { cookie: cookieAdminB });
    expect(rB.statusCode).toBe(200);
    expect(rB.json<{ total: number; eventos: unknown[] }>().total).toBe(0);

    // Parámetros inválidos -> 422
    expect((await req('GET', '/api/auditoria?limite=0', { cookie: cookieAdminA })).statusCode).toBe(422);
    expect((await req('GET', '/api/auditoria?limite=abc', { cookie: cookieAdminA })).statusCode).toBe(422);
  });
});

describe('Ola 3 HTTP · POST /api/laboratorio/probar', () => {
  it('exige autenticación (401) y valida CSRF (403)', async () => {
    expect((await req('POST', '/api/laboratorio/probar', { payload: { asunto: 'Robo' } })).statusCode).toBe(401);
    expect(
      (
        await req('POST', '/api/laboratorio/probar', {
          cookie: cookieAdminA,
          origin: 'https://evil.example',
          payload: { asunto: 'Robo' },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('devuelve 422 si asunto y cuerpo están vacíos', async () => {
    expect((await req('POST', '/api/laboratorio/probar', { cookie: cookieAdminA, payload: {} })).statusCode).toBe(422);
    expect(
      (
        await req('POST', '/api/laboratorio/probar', {
          cookie: cookieSoporteA,
          payload: { asunto: '   ', cuerpo: '\n\t ' },
        })
      ).statusCode,
    ).toBe(422);
  });

  it('enmascara datos personales, clasifica, prioriza y extrae palabrasDetectadas para ADMIN y SOPORTE sin tocar la BD', async () => {
    const antes = (
      await db.pool
        .request()
        .query<{ correos: number; solicitudes: number }>(
          'SELECT (SELECT COUNT(*) FROM dbo.CORREOS) AS correos, (SELECT COUNT(*) FROM dbo.SOLICITUDES) AS solicitudes',
        )
    ).recordset[0]!;

    const payload = {
      asunto: 'Robo en apto 302 — urgente',
      cuerpo: 'Soy Carlos Ruiz, CC 1023456789, cel 3101234567, correo carlos@mail.com. Hubo un robo y disparo.',
    };

    for (const cookie of [cookieAdminA, cookieSoporteA]) {
      const r = await req('POST', '/api/laboratorio/probar', { cookie, payload });
      expect(r.statusCode).toBe(200);
      const body = r.json<{
        asuntoEnmascarado: string;
        cuerpoEnmascarado: string;
        categoria: string;
        prioridad: string;
        palabrasDetectadas: string[];
      }>();

      expect(body.asuntoEnmascarado).toContain('[UNIDAD_PROTEGIDA]');
      expect(body.asuntoEnmascarado).not.toContain('302');
      expect(body.cuerpoEnmascarado).toContain('[NOMBRE_PROTEGIDO]');
      expect(body.cuerpoEnmascarado).toContain('[DOC_PROTEGIDO]');
      expect(body.cuerpoEnmascarado).toContain('[TEL_PROTEGIDO]');
      expect(body.cuerpoEnmascarado).toContain('[CORREO_PROTEGIDO]');
      expect(body.cuerpoEnmascarado).not.toContain('1023456789');
      expect(body.cuerpoEnmascarado).not.toContain('3101234567');
      expect(body.cuerpoEnmascarado).not.toContain('carlos@mail.com');
      expect(body.categoria).toBe('SEGURIDAD');
      expect(body.prioridad).toBe('ALTA');
      expect(body.palabrasDetectadas).toEqual(expect.arrayContaining(['robo', 'disparo', 'urgente']));
    }

    const despues = (
      await db.pool
        .request()
        .query<{ correos: number; solicitudes: number }>(
          'SELECT (SELECT COUNT(*) FROM dbo.CORREOS) AS correos, (SELECT COUNT(*) FROM dbo.SOLICITUDES) AS solicitudes',
        )
    ).recordset[0]!;
    expect(despues).toEqual(antes);
  });
});
