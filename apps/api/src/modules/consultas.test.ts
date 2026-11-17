import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CATEGORIAS, PALABRAS_CLAVE_POR_CATEGORIA } from '../domain/clasificador.js';
import { ESTADOS, TRANSICIONES } from '../domain/estados.js';
import { PALABRAS_CLAVE_URGENCIA, PRIORIDAD_BASE_POR_CATEGORIA } from '../domain/priorizador.js';
import { crearUsuario, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ValidationError } from '../errors.js';
import { asignar } from './asignaciones.js';
import { colaValidacion, obtenerCatalogos } from './consultas.js';
import { ingestarCorreo } from './ingesta.js';
import { crearResidenteConjunto } from './residentes.js';
import { cambiarEstado, reclasificar, type Actor } from './solicitudes.js';
import { aceptarSugerencia, registrarFalloSugerencia, registrarSugerencia } from './sugerencias.js';

let db: TestDb;
let n = 0;

interface ConjuntoTest {
  id: number;
  slug: string;
  admin: Actor;
  soporte: Actor;
}

async function nuevoConjunto(): Promise<ConjuntoTest> {
  const slug = `cons-${++n}`;
  const id = (
    await db.pool
      .request()
      .input('slug', sql.VarChar(80), slug)
      .input('nombre', sql.NVarChar(120), `Conjunto ${n}`)
      .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)')
  ).recordset[0]!.id;
  const idAdmin = await crearUsuario(db, { nombre: `Admin ${n}`, correo: `admin-q-${n}@demo.mailflow.test`, rol: 'ADMIN', slug });
  const idSoporte = await crearUsuario(db, { nombre: `Soporte ${n}`, correo: `sop-q-${n}@demo.mailflow.test`, rol: 'SOPORTE', slug });
  return {
    id,
    slug,
    admin: { idUsuario: idAdmin, rol: 'ADMIN', idConjunto: id },
    soporte: { idUsuario: idSoporte, rol: 'SOPORTE', idConjunto: id },
  };
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_cons');
});
afterAll(async () => {
  await db?.close();
});

describe('colaValidacion', () => {
  it('devuelve sugerencias pendientes y remitentes sin residente del conjunto, filtrando decisiones posteriores, cerradas e iguales', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();

    // Residente conocido en A (sus correos NO deben aparecer en remitentesSinResidente)
    await crearResidenteConjunto(db.pool, a.admin, {
      nombre: 'Residente Conocido',
      unidad: 'T1-101',
      correo: `conocido-${n}@demo.mailflow.test`,
    });

    const base = Date.UTC(2026, 10, 1, 10);

    // 1) Pendiente por diferencia de categoría (sugerencia LISTA distinta a la actual) + remitente sin residente
    const s1 = await ingestarCorreo(db.pool, {
      messageId: `<val-1-${n}>`,
      remitente: `sinres1-${n}@demo.mailflow.test`,
      asunto: 'Paz y salvo',
      cuerpo: 'Texto largo '.repeat(30),
      recibidoEn: new Date(base),
      idConjunto: a.id,
    });
    // 2) Pendiente solo por diferencia de prioridad + asignada y en proceso después (NO es reclasificación)
    const s2 = await ingestarCorreo(db.pool, {
      messageId: `<val-2-${n}>`,
      remitente: `conocido-${n}@demo.mailflow.test`,
      asunto: 'Gotera en pasillo',
      cuerpo: 'Pequeña gotera',
      recibidoEn: new Date(base + 60_000),
      idConjunto: a.id,
    });
    // 3) Sugerencia LISTA pero igual a la actual → NO pendiente
    const s3 = await ingestarCorreo(db.pool, {
      messageId: `<val-3-${n}>`,
      remitente: `conocido-${n}@demo.mailflow.test`,
      asunto: 'Robo en portería',
      cuerpo: 'Urgente',
      recibidoEn: new Date(base + 120_000),
      idConjunto: a.id,
    });
    // 4) Sugerencia EN_REINTENTO → NO pendiente
    const s4 = await ingestarCorreo(db.pool, {
      messageId: `<val-4-${n}>`,
      remitente: `conocido-${n}@demo.mailflow.test`,
      asunto: 'Ruido',
      cuerpo: 'Música fuerte',
      recibidoEn: new Date(base + 180_000),
      idConjunto: a.id,
    });
    // 5) Solicitud CERRADA con sugerencia distinta → NO pendiente
    const s5 = await ingestarCorreo(db.pool, {
      messageId: `<val-5-${n}>`,
      remitente: `conocido-${n}@demo.mailflow.test`,
      asunto: 'Certificado',
      cuerpo: 'Por favor',
      recibidoEn: new Date(base + 240_000),
      idConjunto: a.id,
    });
    // 6) Solicitud reclasificada manualmente DESPUÉS de la sugerencia a una categoría aún distinta → NO pendiente
    const s6 = await ingestarCorreo(db.pool, {
      messageId: `<val-6-${n}>`,
      remitente: `conocido-${n}@demo.mailflow.test`,
      asunto: 'Hola vecino',
      cuerpo: 'Consulta',
      recibidoEn: new Date(base + 300_000),
      idConjunto: a.id,
    });
    // 7) Solicitud aceptada con T7→T4 → NO pendiente
    const s7 = await ingestarCorreo(db.pool, {
      messageId: `<val-7-${n}>`,
      remitente: `conocido-${n}@demo.mailflow.test`,
      asunto: 'Consulta general',
      cuerpo: 'Ayuda',
      recibidoEn: new Date(base + 360_000),
      idConjunto: a.id,
    });
    // 8) Reclasificada ANTES de que llegara la sugerencia → SÍ pendiente porque la sugerencia es posterior
    const s8 = await ingestarCorreo(db.pool, {
      messageId: `<val-8-${n}>`,
      remitente: `sinres2-${n}@demo.mailflow.test`,
      asunto: 'Tema mixto',
      cuerpo: 'Detalle',
      recibidoEn: new Date(base + 420_000),
      idConjunto: a.id,
    });
    // 9) En conjunto B → NO debe mezclarse con A
    const sB = await ingestarCorreo(db.pool, {
      messageId: `<val-b-${n}>`,
      remitente: `sinres-b-${n}@demo.mailflow.test`,
      asunto: 'En B',
      cuerpo: 'Otro conjunto',
      recibidoEn: new Date(base + 480_000),
      idConjunto: b.id,
    });

    if (
      s1.duplicado ||
      s2.duplicado ||
      s3.duplicado ||
      s4.duplicado ||
      s5.duplicado ||
      s6.duplicado ||
      s7.duplicado ||
      s8.duplicado ||
      sB.duplicado
    ) {
      throw new Error('duplicado inesperado');
    }

    // Reclasificar s8 ANTES de registrar sugerencia
    await reclasificar(db.pool, {
      idSolicitud: s8.idSolicitud,
      categoria: 'ADMINISTRATIVO',
      idUsuario: a.admin.idUsuario,
      versionEsperada: 1,
    });
    // Pequeño respiro de 5ms para que fechaActualizacion de la sugerencia sea estrictamente posterior
    await new Promise((r) => setTimeout(r, 10));

    const sugBase = { proveedor: 'openrouter', modelo: 'test/model', justificacion: 'Motivo IA' };
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: s1.idSolicitud, categoria: 'ADMINISTRATIVO', prioridad: 'BAJA', resumen: 'Resumen 1' });
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: s2.idSolicitud, categoria: 'MANTENIMIENTO', prioridad: 'ALTA', resumen: 'Resumen 2' });
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: s3.idSolicitud, categoria: 'SEGURIDAD', prioridad: 'ALTA', resumen: 'Resumen 3' });
    await registrarFalloSugerencia(db.pool, { proveedor: 'openrouter', modelo: 'test/model', idSolicitud: s4.idSolicitud, causa: 'timeout', maxIntentos: 3, esperaMinutos: 10 });
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: s5.idSolicitud, categoria: 'FACTURACION', prioridad: 'MEDIA', resumen: 'Resumen 5' });
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: s6.idSolicitud, categoria: 'FACTURACION', prioridad: 'BAJA', resumen: 'Resumen 6' });
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: s7.idSolicitud, categoria: 'MANTENIMIENTO', prioridad: 'MEDIA', resumen: 'Resumen 7' });
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: s8.idSolicitud, categoria: 'SEGURIDAD', prioridad: 'ALTA', resumen: 'Resumen 8' });
    await registrarSugerencia(db.pool, { ...sugBase, idSolicitud: sB.idSolicitud, categoria: 'SEGURIDAD', prioridad: 'ALTA', resumen: 'Resumen B' });

    // s2 cambia de estado con un comentario que empieza por "Reclasificada:" (no es reclasificación real: idEstadoAnterior <> idEstadoNuevo) → sigue pendiente
    await asignar(db.pool, { idSolicitud: s2.idSolicitud, idResponsable: a.soporte.idUsuario, idAsignador: a.admin.idUsuario, versionEsperada: 1 });
    await cambiarEstado(db.pool, {
      idSolicitud: s2.idSolicitud,
      nuevoEstado: 'EN_PROCESO',
      idUsuario: a.soporte.idUsuario,
      versionEsperada: 2,
      comentario: 'Reclasificada: nota informativa de soporte',
    });

    // s5 se cierra → sale de la cola
    await asignar(db.pool, { idSolicitud: s5.idSolicitud, idResponsable: a.soporte.idUsuario, idAsignador: a.admin.idUsuario, versionEsperada: 1 });
    await cambiarEstado(db.pool, { idSolicitud: s5.idSolicitud, nuevoEstado: 'EN_PROCESO', idUsuario: a.soporte.idUsuario, versionEsperada: 2 });
    await cambiarEstado(db.pool, { idSolicitud: s5.idSolicitud, nuevoEstado: 'RESUELTA', idUsuario: a.soporte.idUsuario, versionEsperada: 3 });
    await cambiarEstado(db.pool, { idSolicitud: s5.idSolicitud, nuevoEstado: 'CERRADA', idUsuario: a.admin.idUsuario, versionEsperada: 4 });

    // s6 se reclasifica a otra cosa (ADMINISTRATIVO) después de la sugerencia → sale de la cola
    await reclasificar(db.pool, { idSolicitud: s6.idSolicitud, categoria: 'ADMINISTRATIVO', idUsuario: a.admin.idUsuario, versionEsperada: 1 });

    // s7 acepta sugerencia → sale de la cola
    await aceptarSugerencia(db.pool, { idSolicitud: s7.idSolicitud, idUsuario: a.admin.idUsuario, versionEsperada: 1 });

    const cola = await colaValidacion(db.pool, a.id);

    expect(cola.sugerencias.map((x) => x.idSolicitud).sort()).toEqual([s1.idSolicitud, s2.idSolicitud, s8.idSolicitud].sort());
    const item1 = cola.sugerencias.find((x) => x.idSolicitud === s1.idSolicitud)!;
    expect(item1).toMatchObject({
      idSolicitud: s1.idSolicitud,
      codigo: expect.stringMatching(/^SOL-\d{6}$/),
      asunto: 'Paz y salvo',
      remitente: `sinres1-${n}@demo.mailflow.test`,
      estado: 'NUEVA',
      categoriaActual: 'FACTURACION',
      prioridadActual: 'BAJA',
      version: 1,
      sugerencia: {
        categoria: 'ADMINISTRATIVO',
        prioridad: 'BAJA',
        resumen: 'Resumen 1',
        justificacion: 'Motivo IA',
        proveedor: 'openrouter',
        modelo: 'test/model',
      },
    });
    expect(item1.fechaCreacion).toBeInstanceOf(Date);
    expect(item1.sugerencia.fechaActualizacion).toBeInstanceOf(Date);

    // Remitentes sin residente: más recientes primero (s8 luego s1), extracto <= 200
    expect(cola.remitentesSinResidente.map((c) => c.id)).toEqual([s8.idCorreo, s1.idCorreo]);
    expect(cola.remitentesSinResidente[1]!.extracto.length).toBe(200);

    // Doble reclasificación sucesiva: s8 ya fue reclasificada antes de la sugerencia (seguía visible);
    // al reclasificarla de nuevo después de la sugerencia, desaparece de la cola
    await reclasificar(db.pool, {
      idSolicitud: s8.idSolicitud,
      prioridad: 'BAJA',
      idUsuario: a.admin.idUsuario,
      versionEsperada: 2,
    });
    const colaTrasDoble = await colaValidacion(db.pool, a.id);
    expect(colaTrasDoble.sugerencias.map((x) => x.idSolicitud)).not.toContain(s8.idSolicitud);
  });

  it('valida idConjunto positivo', async () => {
    await expect(colaValidacion(db.pool, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(colaValidacion(db.pool, Number.NaN)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('obtenerCatalogos', () => {
  it('devuelve categorías, prioridades, palabrasClaveUrgencia, estados y transiciones alineados con BD y domain/', async () => {
    const cat = await obtenerCatalogos(db.pool);

    expect(cat.categorias.map((c) => c.nombre)).toEqual([...CATEGORIAS]);
    for (const c of cat.categorias) {
      expect(c.id).toBeGreaterThan(0);
      expect(c.prioridadBase).toBe(PRIORIDAD_BASE_POR_CATEGORIA[c.nombre]);
      expect(c.palabrasClave).toEqual([...PALABRAS_CLAVE_POR_CATEGORIA[c.nombre]]);
    }

    expect(cat.prioridades).toEqual([
      { id: expect.any(Number), nombre: 'ALTA', peso: 3, slaHoras: 4 },
      { id: expect.any(Number), nombre: 'MEDIA', peso: 2, slaHoras: 24 },
      { id: expect.any(Number), nombre: 'BAJA', peso: 1, slaHoras: 72 },
    ]);

    expect(cat.palabrasClaveUrgencia).toEqual([...PALABRAS_CLAVE_URGENCIA]);

    expect(cat.estados.map((e) => e.nombre)).toEqual([...ESTADOS]);
    expect(cat.estados.find((e) => e.nombre === 'CERRADA')?.esFinal).toBe(true);
    expect(cat.estados.filter((e) => e.esFinal).map((e) => e.nombre)).toEqual(['CERRADA']);

    expect(cat.transiciones).toHaveLength(TRANSICIONES.length);
    expect(new Set(cat.transiciones.map((t) => `${t.origen}>${t.destino}`))).toEqual(
      new Set(TRANSICIONES.map(([o, d]) => `${o}>${d}`)),
    );
  });
});
