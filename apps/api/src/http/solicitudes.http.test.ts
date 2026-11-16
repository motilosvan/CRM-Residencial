import type { FastifyInstance } from 'fastify';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
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
let idSoporteA2: number;
let idAdminB: number;
let cookieAdminA: string;
let cookieSoporteA: string;
let cookieSoporteA2: string;
let solA1: number;
let solA2: number;
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
      ...(method === 'POST' ? { origin: opts.origin ?? ORIGIN } : {}),
    },
    ...(opts.payload !== undefined ? { payload: opts.payload as Record<string, unknown> } : {}),
  });

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_solhttp');
  conjA = await idConjuntoInicial(db);
  const resB = await db.pool
    .request()
    .input('slug', sql.VarChar(80), 'conjunto-b')
    .input('nombre', sql.NVarChar(120), 'Conjunto B')
    .query<{ idConjunto: number }>(
      `INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto VALUES (@slug, @nombre)`,
    );
  conjB = resB.recordset[0]!.idConjunto;

  idAdminA = await crearUsuario(db, { nombre: 'Admin A', correo: 'admin-a@test.local', rol: 'ADMIN' });
  idSoporteA = await crearUsuario(db, { nombre: 'Soporte A1', correo: 'sop1-a@test.local', rol: 'SOPORTE' });
  idSoporteA2 = await crearUsuario(db, { nombre: 'Soporte A2', correo: 'sop2-a@test.local', rol: 'SOPORTE' });
  idAdminB = await crearUsuario(db, { nombre: 'Admin B', correo: 'admin-b@test.local', rol: 'ADMIN', slug: 'conjunto-b' });

  cookieAdminA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idAdminA, idConjunto: conjA })).token}`;
  cookieSoporteA = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idSoporteA, idConjunto: conjA })).token}`;
  cookieSoporteA2 = `mailflow_sesion=${(await crearSesion(db.pool, { idUsuario: idSoporteA2, idConjunto: conjA })).token}`;

  const i1 = await ingestarCorreo(db.pool, {
    messageId: '<sol-a1@test>',
    remitente: 'res1@mail.com',
    asunto: 'Fuga en el sótano',
    cuerpo: 'Hay mucha agua en el sótano',
    idConjunto: conjA,
  });
  if (i1.duplicado) throw new Error('duplicado inesperado');
  solA1 = i1.idSolicitud;

  const i2 = await ingestarCorreo(db.pool, {
    messageId: '<sol-a2@test>',
    remitente: 'res2@mail.com',
    asunto: 'Paz y salvo administración',
    cuerpo: 'Solicito paz y salvo',
    idConjunto: conjA,
  });
  if (i2.duplicado) throw new Error('duplicado inesperado');
  solA2 = i2.idSolicitud;

  const iB = await ingestarCorreo(db.pool, {
    messageId: '<sol-b1@test>',
    remitente: 'resb@mail.com',
    asunto: 'Ruido en torre B',
    cuerpo: 'Ruido nocturno',
    idConjunto: conjB,
  });
  if (iB.duplicado) throw new Error('duplicado inesperado');
  solB1 = iB.idSolicitud;

  await registrarSugerencia(db.pool, {
    idSolicitud: solA2,
    categoria: 'SEGURIDAD',
    prioridad: 'ALTA',
    resumen: 'Posible alerta de seguridad',
    justificacion: 'Prueba de aceptación T7→T4',
    proveedor: 'test',
    modelo: 'modelo-test',
  });

  app = construirApp({ pool: db.pool, hostsPermitidos: new Set([HOST]), acceso });
});

afterAll(async () => {
  await app.close();
  await db.close();
});

describe('API · solicitudes, autorización y aislamiento por conjunto (B2/S4)', () => {
  it('exige sesión en todas las rutas de solicitudes, usuarios, resumen y reportes (401)', async () => {
    const rutas: ['GET' | 'POST', string][] = [
      ['GET', '/api/solicitudes'],
      ['GET', `/api/solicitudes/${solA1}`],
      ['POST', `/api/solicitudes/${solA1}/asignar`],
      ['POST', `/api/solicitudes/${solA1}/estado`],
      ['POST', `/api/solicitudes/${solA1}/reclasificar`],
      ['POST', `/api/solicitudes/${solA1}/aceptar-sugerencia`],
      ['GET', '/api/usuarios'],
      ['GET', '/api/resumen'],
      ['GET', '/api/reportes'],
    ];
    for (const [m, url] of rutas) {
      const r = await req(m, url, m === 'POST' ? { payload: {} } : {});
      expect(r.statusCode).toBe(401);
      expect(r.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
    }
  });

  it('aislamiento por conjunto: solicitudes de otro conjunto no aparecen y devuelven 404', async () => {
    const lista = await req('GET', '/api/solicitudes', { cookie: cookieAdminA });
    expect(lista.statusCode).toBe(200);
    const ids = lista.json<{ id: number }[]>().map((s) => s.id);
    expect(ids).toContain(solA1);
    expect(ids).toContain(solA2);
    expect(ids).not.toContain(solB1);

    expect((await req('GET', `/api/solicitudes/${solB1}`, { cookie: cookieAdminA })).statusCode).toBe(404);
    expect(
      (
        await req('POST', `/api/solicitudes/${solB1}/asignar`, {
          cookie: cookieAdminA,
          payload: { idResponsable: idSoporteA, version: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await req('POST', `/api/solicitudes/${solB1}/estado`, {
          cookie: cookieAdminA,
          payload: { nuevoEstado: 'EN_PROCESO', version: 1 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await req('POST', `/api/solicitudes/${solB1}/reclasificar`, {
          cookie: cookieAdminA,
          payload: { prioridad: 'ALTA', version: 1 },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('asignar con usuario de otro conjunto devuelve 422 (no 500 por trigger 50026)', async () => {
    const r = await req('POST', `/api/solicitudes/${solA1}/asignar`, {
      cookie: cookieAdminA,
      payload: { idResponsable: idAdminB, version: 1 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json<{ error: string }>().error).toMatch(/conjunto/i);
  });

  it('matriz de permisos: ADMIN vs SOPORTE en asignar, listar, detalle, estado, reclasificar, usuarios y reportes', async () => {
    // SOPORTE no puede asignar ni listar usuarios ni ver reportes
    expect(
      (
        await req('POST', `/api/solicitudes/${solA1}/asignar`, {
          cookie: cookieSoporteA,
          payload: { idResponsable: idSoporteA, version: 1 },
        })
      ).statusCode,
    ).toBe(403);
    expect((await req('GET', '/api/usuarios', { cookie: cookieSoporteA })).statusCode).toBe(403);
    expect((await req('GET', '/api/reportes', { cookie: cookieSoporteA })).statusCode).toBe(403);

    // SOPORTE antes de tener asignadas: lista vacía y detalle 403
    const listaVacia = await req('GET', '/api/solicitudes', { cookie: cookieSoporteA });
    expect(listaVacia.statusCode).toBe(200);
    expect(listaVacia.json()).toEqual([]);
    expect((await req('GET', `/api/solicitudes/${solA1}`, { cookie: cookieSoporteA })).statusCode).toBe(403);

    // ADMIN asigna solA1 a idSoporteA
    const asig = await req('POST', `/api/solicitudes/${solA1}/asignar`, {
      cookie: cookieAdminA,
      payload: { idResponsable: idSoporteA, version: 1 },
    });
    expect(asig.statusCode).toBe(200);
    expect(asig.json()).toMatchObject({ sinCambios: false, estado: 'ASIGNADA', version: 2 });

    // SOPORTE A1 ve solA1 pero no solA2; SOPORTE A2 no ve ninguna
    const listaS1 = await req('GET', '/api/solicitudes', { cookie: cookieSoporteA });
    expect(listaS1.json<{ id: number }[]>().map((s) => s.id)).toEqual([solA1]);
    expect((await req('GET', `/api/solicitudes/${solA1}`, { cookie: cookieSoporteA })).statusCode).toBe(200);
    expect((await req('GET', `/api/solicitudes/${solA1}`, { cookie: cookieSoporteA2 })).statusCode).toBe(403);

    // SOPORTE A2 no puede cambiar el estado de solA1 (403); SOPORTE A1 sí puede (200)
    expect(
      (
        await req('POST', `/api/solicitudes/${solA1}/estado`, {
          cookie: cookieSoporteA2,
          payload: { nuevoEstado: 'EN_PROCESO', version: 2 },
        })
      ).statusCode,
    ).toBe(403);

    const est = await req('POST', `/api/solicitudes/${solA1}/estado`, {
      cookie: cookieSoporteA,
      payload: { nuevoEstado: 'EN_PROCESO', version: 2, comentario: 'En revisión' },
    });
    expect(est.statusCode).toBe(200);
    expect(est.json()).toMatchObject({ idSolicitud: solA1, estado: 'EN_PROCESO', version: 3 });

    // Versión desactualizada → 409
    const conf = await req('POST', `/api/solicitudes/${solA1}/estado`, {
      cookie: cookieSoporteA,
      payload: { nuevoEstado: 'RESUELTA', version: 2 },
    });
    expect(conf.statusCode).toBe(409);

    // Transición inválida → 422
    const inv = await req('POST', `/api/solicitudes/${solA1}/estado`, {
      cookie: cookieSoporteA,
      payload: { nuevoEstado: 'NUEVA', version: 3 },
    });
    expect(inv.statusCode).toBe(422);

    // SOPORTE no puede reclasificar ni aceptar sugerencia (403); ADMIN sí puede
    expect(
      (
        await req('POST', `/api/solicitudes/${solA2}/reclasificar`, {
          cookie: cookieSoporteA,
          payload: { prioridad: 'ALTA', version: 1 },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await req('POST', `/api/solicitudes/${solA2}/aceptar-sugerencia`, {
          cookie: cookieSoporteA,
          payload: { version: 1 },
        })
      ).statusCode,
    ).toBe(403);

    const acep = await req('POST', `/api/solicitudes/${solA2}/aceptar-sugerencia`, {
      cookie: cookieAdminA,
      payload: { version: 1 },
    });
    expect(acep.statusCode).toBe(200);
    expect(acep.json()).toMatchObject({ idSolicitud: solA2, categoria: 'SEGURIDAD', prioridad: 'ALTA', version: 2 });

    // Aceptar sugerencia cuando no hay sugerencia LISTA → 422
    expect(
      (
        await req('POST', `/api/solicitudes/${solA1}/aceptar-sugerencia`, {
          cookie: cookieAdminA,
          payload: { version: 3 },
        })
      ).statusCode,
    ).toBe(422);

    // ADMIN lista usuarios del conjunto (lee USUARIO_CONJUNTOS.rol, no mezcla conjunto B)
    const usr = await req('GET', '/api/usuarios', { cookie: cookieAdminA });
    expect(usr.statusCode).toBe(200);
    const correosUsr = usr.json<{ correo: string }[]>().map((u) => u.correo);
    expect(correosUsr).toContain('admin-a@test.local');
    expect(correosUsr).toContain('sop1-a@test.local');
    expect(correosUsr).not.toContain('admin-b@test.local');
  });

  it('T5 · GET /api/reportes devuelve métricas exactas por conjunto y exporta CSV', async () => {
    // Fijamos tiempos exactos en solA1 (MANTENIMIENTO, SLA 24h = 1440 min) para validar SLA
    await db.pool
      .request()
      .input('id', sql.Int, solA1)
      .query(
        `UPDATE SOLICITUDES
            SET fechaCreacion = '2026-11-10T10:00:00Z',
                primeraRespuesta = '2026-11-10T11:30:00Z'
          WHERE idSolicitud = @id`,
      );

    const rep = await req('GET', '/api/reportes', { cookie: cookieAdminA });
    expect(rep.statusCode).toBe(200);
    const body = rep.json<{
      totales: { total: number; abiertas: number; resueltas: number; cerradas: number };
      global: { totalConRespuesta: number; minutosPromedio: number; dentroSla: number; porcentajeSla: number };
      carga: { idUsuario: number; nombre: string; abiertas: number }[];
    }>();
    expect(body.totales).toEqual({ total: 2, abiertas: 2, resueltas: 0, cerradas: 0 });
    expect(body.global).toEqual({ totalConRespuesta: 1, minutosPromedio: 90, dentroSla: 1, porcentajeSla: 100 });
    expect(body.carga.find((c) => c.idUsuario === idSoporteA)?.abiertas).toBe(1);
    expect(body.carga.find((c) => c.idUsuario === idSoporteA2)?.abiertas).toBe(0);

    const csv = await req('GET', '/api/reportes?formato=csv', { cookie: cookieAdminA });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('seccion,concepto,cantidad,minutos_promedio,dentro_sla,porcentaje_sla');
    expect(csv.body).toContain('sla,MANTENIMIENTO,1,90,1,100');
  });

  it('límite de peticiones por IP protege /api/auth/codigo y /api/auth/verificar con 429', async () => {
    let reloj = 1_000_000;
    const limitada = construirApp({
      pool: db.pool,
      hostsPermitidos: new Set([HOST]),
      acceso,
      limitePeticiones: { max: 2, ventanaMs: 60_000, ahora: () => reloj },
    });
    try {
      let n = 0;
      const pedir = () =>
        limitada.inject({
          method: 'POST',
          url: '/api/auth/codigo',
          headers: { host: HOST, origin: ORIGIN },
          payload: { conjuntoId: String(conjA), correo: `nadie-${++n}@test.local` },
        });
      expect((await pedir()).statusCode).toBe(200);
      expect((await pedir()).statusCode).toBe(200);
      const r3 = await pedir();
      expect(r3.statusCode).toBe(429);
      expect(r3.json()).toMatchObject({ codigo: 'LIMITE_IP' });

      // Al vencer la ventana vuelve a permitir
      reloj += 61_000;
      expect((await pedir()).statusCode).toBe(200);
    } finally {
      await limitada.close();
    }
  });
});
