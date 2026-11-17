import type { FastifyInstance } from 'fastify';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { EnviadorLocal } from '../modules/enviador.js';
import { ingestarCorreo } from '../modules/ingesta.js';
import { crearSesion } from '../modules/sesiones.js';
import { registrarSugerencia } from '../modules/sugerencias.js';
import { construirApp, type OpcionesApp } from './app.js';

let db: TestDb;
let app: FastifyInstance;
let conjA: number;
let conjB: number;
let idAdminA: number;
let idSoporteA: number;
let idAdminB: number;
let cookieAdminA: string;
let cookieSoporteA: string;
let cookieAdminB: string;
let correoA1: number;
let correoA2: number;
let correoB1: number;
let solA1: number;

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

async function nuevoConjunto(slug: string, nombre: string): Promise<number> {
  const r = await db.pool
    .request()
    .input('slug', sql.VarChar(80), slug)
    .input('nombre', sql.NVarChar(120), nombre)
    .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)');
  return r.recordset[0]!.id;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_ola2');
  conjA = await nuevoConjunto('ola2-a', 'Conjunto Ola2 A');
  conjB = await nuevoConjunto('ola2-b', 'Conjunto Ola2 B');

  idAdminA = await crearUsuario(db, { nombre: 'Admin A', correo: 'admin-o2a@demo.mailflow.test', rol: 'ADMIN', slug: 'ola2-a' });
  idSoporteA = await crearUsuario(db, { nombre: 'Soporte A', correo: 'sop-o2a@demo.mailflow.test', rol: 'SOPORTE', slug: 'ola2-a' });
  idAdminB = await crearUsuario(db, { nombre: 'Admin B', correo: 'admin-o2b@demo.mailflow.test', rol: 'ADMIN', slug: 'ola2-b' });

  cookieAdminA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idAdminA, idConjunto: conjA })).token}`;
  cookieSoporteA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idSoporteA, idConjunto: conjA })).token}`;
  cookieAdminB = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idAdminB, idConjunto: conjB })).token}`;

  const i1 = await ingestarCorreo(db.pool, {
    messageId: '<o2-a1@test>',
    remitente: 'vecino1@demo.mailflow.test',
    asunto: 'Paz y salvo',
    cuerpo: 'Soy vecino del 101',
    idConjunto: conjA,
  });
  const i2 = await ingestarCorreo(db.pool, {
    messageId: '<o2-a2@test>',
    remitente: 'vecino2@demo.mailflow.test',
    asunto: 'Gotera en techo',
    cuerpo: 'Hay humedad',
    idConjunto: conjA,
  });
  const iB = await ingestarCorreo(db.pool, {
    messageId: '<o2-b1@test>',
    remitente: 'vecinob@demo.mailflow.test',
    asunto: 'Asunto B',
    cuerpo: 'Cuerpo B',
    idConjunto: conjB,
  });
  if (i1.duplicado || i2.duplicado || iB.duplicado) throw new Error('duplicado inesperado');
  correoA1 = i1.idCorreo;
  solA1 = i1.idSolicitud;
  correoA2 = i2.idCorreo;
  correoB1 = iB.idCorreo;

  await registrarSugerencia(db.pool, {
    idSolicitud: solA1,
    categoria: 'ADMINISTRATIVO',
    prioridad: 'BAJA',
    resumen: 'Trámite administrativo',
    justificacion: 'Relacionado con certificación',
    proveedor: 'openrouter',
    modelo: 'modelo-test',
  });

  app = construirApp({ pool: db.pool, hostsPermitidos: new Set([HOST]), acceso });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await db?.close();
});

describe('Ola 2 HTTP · autenticación, autorización y CSRF', () => {
  const rutas: ['GET' | 'POST' | 'PATCH', string][] = [
    ['GET', '/api/residentes'],
    ['POST', '/api/residentes'],
    ['PATCH', '/api/residentes/1'],
    ['POST', '/api/correos/1/vincular-residente'],
    ['GET', '/api/validacion'],
    ['GET', '/api/conjunto/identidad'],
    ['PATCH', '/api/conjunto/identidad'],
    ['GET', '/api/catalogos'],
  ];

  it('401 NO_AUTENTICADO sin sesión en todas las rutas de Ola 2', async () => {
    for (const [m, url] of rutas) {
      const r = await req(m, url, m === 'GET' ? {} : { payload: {} });
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
    }
  });

  it('403 para SOPORTE en todas las rutas de Ola 2 (antes de validar cuerpo)', async () => {
    for (const [m, url] of rutas) {
      const r = await req(m, url, {
        cookie: cookieSoporteA,
        ...(m === 'GET' ? {} : { payload: {} }),
      });
      expect(r.statusCode, `${m} ${url}`).toBe(403);
    }
  });

  it('403 con Origin ajeno en POST y PATCH de Ola 2', async () => {
    for (const [m, url] of [
      ['POST', '/api/residentes'],
      ['PATCH', '/api/residentes/1'],
      ['POST', '/api/correos/1/vincular-residente'],
      ['PATCH', '/api/conjunto/identidad'],
    ] as const) {
      const r = await req(m, url, { cookie: cookieAdminA, origin: 'https://evil.example', payload: {} });
      expect(r.statusCode).toBe(403);
      expect(r.json()).toEqual({ error: 'Origen no permitido' });
    }
  });
});

describe('Ola 2 HTTP · Residentes y vinculación de correos', () => {
  let idResA1: number;
  let idResB1: number;

  it('POST /api/residentes (201), vincula huérfanos, 409 duplicado, 422 inválidos', async () => {
    const r = await req('POST', '/api/residentes', {
      cookie: cookieAdminA,
      payload: { nombre: '  Laura Rojas ', unidad: 'T1-101', correo: 'Vecino1@Demo.Mailflow.Test', telefono: '3001112233' },
    });
    expect(r.statusCode).toBe(201);
    const body = r.json<{ id: number; correo: string; totalSolicitudes: number; version: number }>();
    expect(body).toMatchObject({
      nombre: 'Laura Rojas',
      unidad: 'T1-101',
      correo: 'vecino1@demo.mailflow.test',
      telefono: '3001112233',
      activo: true,
      version: 1,
      totalSolicitudes: 1,
    });
    idResA1 = body.id;

    // Verifica que correoA1 quedó vinculado automáticamente al residente recién creado
    const detCorreoA1 = await req('GET', `/api/correos/${correoA1}`, { cookie: cookieAdminA });
    expect(detCorreoA1.statusCode).toBe(200);
    expect(detCorreoA1.json()).toMatchObject({ id: correoA1, idResidente: idResA1, residente: 'Laura Rojas' });

    // Duplicado en el mismo conjunto → 409
    expect(
      (
        await req('POST', '/api/residentes', {
          cookie: cookieAdminA,
          payload: { nombre: 'Dup', unidad: 'T1-102', correo: 'vecino1@demo.mailflow.test' },
        })
      ).statusCode,
    ).toBe(409);

    // Inválido → 422
    expect(
      (await req('POST', '/api/residentes', { cookie: cookieAdminA, payload: { nombre: '', unidad: '101' } })).statusCode,
    ).toBe(422);

    // Crear residente en conjunto B
    const rB = await req('POST', '/api/residentes', {
      cookie: cookieAdminB,
      payload: { nombre: 'Residente B', unidad: 'B-1', correo: 'vecino1@demo.mailflow.test' },
    });
    expect(rB.statusCode).toBe(201);
    idResB1 = rB.json<{ id: number }>().id;
  });

  it('GET /api/residentes filtra por ?q=, ?soloActivos= y aísla conjuntos', async () => {
    const r2 = await req('POST', '/api/residentes', {
      cookie: cookieAdminA,
      payload: { nombre: 'Mario Inactivo', unidad: 'T1-102' },
    });
    const idInact = r2.json<{ id: number }>().id;
    await req('PATCH', `/api/residentes/${idInact}`, {
      cookie: cookieAdminA,
      payload: { activo: false, versionEsperada: 1 },
    });

    const todos = await req('GET', '/api/residentes', { cookie: cookieAdminA });
    expect(todos.statusCode).toBe(200);
    expect(todos.json<{ id: number }[]>().map((x) => x.id)).toEqual([idResA1, idInact]);

    const activos = await req('GET', '/api/residentes?soloActivos=true', { cookie: cookieAdminA });
    expect(activos.statusCode).toBe(200);
    expect(activos.json<{ id: number }[]>().map((x) => x.id)).toEqual([idResA1]);

    const busq = await req('GET', '/api/residentes?q=Laura', { cookie: cookieAdminA });
    expect(busq.json<{ id: number }[]>().map((x) => x.id)).toEqual([idResA1]);

    expect((await req('GET', '/api/residentes?soloActivos=abc', { cookie: cookieAdminA })).statusCode).toBe(422);
    expect((await req('GET', '/api/residentes?q=a&q=b', { cookie: cookieAdminA })).statusCode).toBe(422);
  });

  it('PATCH /api/residentes/:id actualiza (200), 409 versión vieja, 404 otro conjunto, 422 id inválido', async () => {
    const upd = await req('PATCH', `/api/residentes/${idResA1}`, {
      cookie: cookieAdminA,
      payload: { unidad: 'T1-101A', versionEsperada: 1 },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json()).toMatchObject({ id: idResA1, unidad: 'T1-101A', version: 2 });

    expect(
      (await req('PATCH', `/api/residentes/${idResA1}`, { cookie: cookieAdminA, payload: { unidad: 'X', versionEsperada: 1 } })).statusCode,
    ).toBe(409);

    expect(
      (await req('PATCH', `/api/residentes/${idResB1}`, { cookie: cookieAdminA, payload: { nombre: 'Hack', versionEsperada: 1 } })).statusCode,
    ).toBe(404);

    expect(
      (await req('PATCH', '/api/residentes/abc', { cookie: cookieAdminA, payload: { nombre: 'X', versionEsperada: 1 } })).statusCode,
    ).toBe(422);
  });

  it('POST /api/correos/:id/vincular-residente (200), aislamiento 404 y validaciones 422', async () => {
    // Correo de otro conjunto → 404
    expect(
      (
        await req('POST', `/api/correos/${correoB1}/vincular-residente`, {
          cookie: cookieAdminA,
          payload: { idResidente: idResA1 },
        })
      ).statusCode,
    ).toBe(404);

    // Residente de otro conjunto → 404
    expect(
      (
        await req('POST', `/api/correos/${correoA2}/vincular-residente`, {
          cookie: cookieAdminA,
          payload: { idResidente: idResB1 },
        })
      ).statusCode,
    ).toBe(404);

    // Payload vacío → 422
    expect((await req('POST', `/api/correos/${correoA2}/vincular-residente`, { cookie: cookieAdminA, payload: {} })).statusCode).toBe(422);

    // Crear y vincular correoA2
    const v = await req('POST', `/api/correos/${correoA2}/vincular-residente`, {
      cookie: cookieAdminA,
      payload: { residente: { nombre: 'Carlos Mendez', unidad: 'T2-201' } },
    });
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({ id: correoA2, residente: 'Carlos Mendez', unidad: 'T2-201' });

    // Si se intenta vincular otro correo creando residente con mismo remitente ya existente → 409
    const i3 = await ingestarCorreo(db.pool, {
      messageId: '<o2-a3@test>',
      remitente: 'vecino2@demo.mailflow.test',
      asunto: 'Otro',
      idConjunto: conjA,
    });
    if (i3.duplicado) throw new Error('duplicado inesperado');
    await db.pool.request().input('id', sql.Int, i3.idCorreo).query('UPDATE dbo.CORREOS SET idResidente = NULL WHERE idCorreo = @id');
    expect(
      (
        await req('POST', `/api/correos/${i3.idCorreo}/vincular-residente`, {
          cookie: cookieAdminA,
          payload: { residente: { nombre: 'Dup', unidad: 'T2-202' } },
        })
      ).statusCode,
    ).toBe(409);

    // Restauramos el vínculo de i3 para dejar limpia la cola de remitentesSinResidente
    await req('POST', `/api/correos/${i3.idCorreo}/vincular-residente`, {
      cookie: cookieAdminA,
      payload: { idResidente: v.json<{ idResidente: number }>().idResidente },
    });
  });
});

describe('Ola 2 HTTP · Validación, Identidad y Catálogos', () => {
  it('GET /api/validacion devuelve sugerencias pendientes y remitentes sin residente del conjunto', async () => {
    const r = await req('GET', '/api/validacion', { cookie: cookieAdminA });
    expect(r.statusCode).toBe(200);
    const body = r.json<{
      sugerencias: { idSolicitud: number; sugerencia: { categoria: string } }[];
      remitentesSinResidente: unknown[];
    }>();
    expect(body.sugerencias.map((s) => s.idSolicitud)).toEqual([solA1]);
    expect(body.sugerencias[0]!.sugerencia.categoria).toBe('ADMINISTRATIVO');
    // Todos los correos de conjA quedaron vinculados en el bloque anterior
    expect(body.remitentesSinResidente).toEqual([]);

    // Conjunto B solo ve lo suyo
    const rB = await req('GET', '/api/validacion', { cookie: cookieAdminB });
    expect(rB.statusCode).toBe(200);
    expect(rB.json<{ remitentesSinResidente: { id: number }[] }>().remitentesSinResidente.map((c) => c.id)).toEqual([correoB1]);
  });

  it('GET/PATCH /api/conjunto/identidad actualiza, refleja en /api/auth/sesion, 409 versión vieja y 422 inválidos', async () => {
    const g1 = await req('GET', '/api/conjunto/identidad', { cookie: cookieAdminA });
    expect(g1.statusCode).toBe(200);
    expect(g1.json()).toEqual({ id: String(conjA), slug: 'ola2-a', nombre: 'Conjunto Ola2 A', version: 1 });

    const p1 = await req('PATCH', '/api/conjunto/identidad', {
      cookie: cookieAdminA,
      payload: {
        nombre: 'Parque Ola 2',
        logoUrl: 'https://cdn.demo.mailflow.test/ola2.png',
        colorPrimario: '#1e3a5f',
        colorAcento: '#e0a458',
        versionEsperada: 1,
      },
    });
    expect(p1.statusCode).toBe(200);
    expect(p1.json()).toEqual({
      id: String(conjA),
      slug: 'ola2-a',
      nombre: 'Parque Ola 2',
      logoUrl: 'https://cdn.demo.mailflow.test/ola2.png',
      paleta: { primario: '#1E3A5F', acento: '#E0A458' },
      version: 2,
    });

    // Sesión refleja identidad nueva inmediatamente
    const ses = await req('GET', '/api/auth/sesion', { cookie: cookieAdminA });
    expect(ses.json<{ conjuntoActivo: Record<string, unknown> }>().conjuntoActivo).toMatchObject({
      nombre: 'Parque Ola 2',
      logoUrl: 'https://cdn.demo.mailflow.test/ola2.png',
      paleta: { primario: '#1E3A5F', acento: '#E0A458' },
    });

    // 409 versión vieja
    expect(
      (await req('PATCH', '/api/conjunto/identidad', { cookie: cookieAdminA, payload: { nombre: 'Vieja', versionEsperada: 1 } })).statusCode,
    ).toBe(409);

    // 422 sin versionEsperada, URL javascript: y paleta incompleta
    expect(
      (await req('PATCH', '/api/conjunto/identidad', { cookie: cookieAdminA, payload: { nombre: 'Sin Versión' } })).statusCode,
    ).toBe(422);
    expect(
      (await req('PATCH', '/api/conjunto/identidad', { cookie: cookieAdminA, payload: { logoUrl: 'javascript:alert(1)', versionEsperada: 2 } })).statusCode,
    ).toBe(422);
    expect(
      (await req('PATCH', '/api/conjunto/identidad', { cookie: cookieAdminA, payload: { colorPrimario: null, versionEsperada: 2 } })).statusCode,
    ).toBe(422);
  });

  it('GET /api/catalogos devuelve categorías, prioridades, palabrasClaveUrgencia, estados y transiciones', async () => {
    const r = await req('GET', '/api/catalogos', { cookie: cookieAdminA });
    expect(r.statusCode).toBe(200);
    const body = r.json<{
      categorias: { nombre: string; prioridadBase: string; palabrasClave: string[] }[];
      prioridades: { nombre: string; peso: number; slaHoras: number }[];
      palabrasClaveUrgencia: string[];
      estados: { nombre: string; esFinal: boolean }[];
      transiciones: { origen: string; destino: string }[];
    }>();
    expect(body.categorias).toHaveLength(5);
    expect(body.prioridades.map((p) => p.nombre)).toEqual(['ALTA', 'MEDIA', 'BAJA']);
    expect(body.palabrasClaveUrgencia).toContain('urgente');
    expect(body.estados.find((e) => e.nombre === 'CERRADA')?.esFinal).toBe(true);
    expect(body.transiciones).toHaveLength(6);
  });
});
