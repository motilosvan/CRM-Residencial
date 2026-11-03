import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { NotFound, ValidationError } from '../errors.js';
import { detalleCorreo, estadoGateway, leerCheckpoint, listarCorreos } from './consultas.js';
import { ingestarCorreo } from './ingesta.js';

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_buz');
  await db.q(`INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES (N'Ana Pérez', 'T1-101', 'ana@mail.com')`);
  const base = Date.UTC(2026, 9, 1, 12);
  await ingestarCorreo(db.pool, {
    messageId: '<buz-1@mail>', remitente: 'ana@mail.com', asunto: 'Fuga de agua en el baño',
    cuerpo: 'Hay una fuga desde anoche. '.repeat(20), recibidoEn: new Date(base),
  });
  await ingestarCorreo(db.pool, {
    messageId: '<buz-2@mail>', remitente: 'extrano@otro.com', asunto: 'Consulta 100%_[general]',
    cuerpo: 'Hola', recibidoEn: new Date(base + 60_000),
  });
  await ingestarCorreo(db.pool, {
    messageId: '<buz-3@mail>', remitente: 'ana@mail.com', asunto: 'Robo en el parqueadero',
    cuerpo: 'Revisen las cámaras 📹', recibidoEn: new Date(base + 120_000),
    checkpoint: { cuenta: 'buzon@gmail.com', uidValidity: 7, uid: 42 },
  });
});
afterAll(async () => db.close());

describe('Buzón · listarCorreos', () => {
  it('devuelve los correos más recientes primero, con residente y solicitud vinculados', async () => {
    const r = await listarCorreos(db.pool);
    expect(r.total).toBe(3);
    expect(r.correos.map((c) => c.asunto)).toEqual([
      'Robo en el parqueadero',
      'Consulta 100%_[general]',
      'Fuga de agua en el baño',
    ]);
    const robo = r.correos[0]!;
    expect(robo).toMatchObject({
      remitente: 'ana@mail.com', residente: 'Ana Pérez', unidad: 'T1-101',
      estado: 'NUEVA', categoria: 'SEGURIDAD', prioridad: 'ALTA',
    });
    expect(robo.codigo).toMatch(/^SOL-\d{6}$/);
    const desconocido = r.correos[1]!;
    expect(desconocido.residente).toBeNull();
    expect(desconocido.idResidente).toBeNull();
  });

  it('el extracto se recorta a 200 caracteres', async () => {
    const r = await listarCorreos(db.pool, { q: 'fuga' });
    expect(r.correos[0]!.extracto.length).toBe(200);
  });

  it('busca en asunto, remitente y nombre del residente; los comodines de LIKE se toman literales', async () => {
    expect((await listarCorreos(db.pool, { q: 'Pérez' })).total).toBe(2);
    expect((await listarCorreos(db.pool, { q: 'otro.com' })).total).toBe(1);
    expect((await listarCorreos(db.pool, { q: '100%_[' })).total).toBe(1);
    expect((await listarCorreos(db.pool, { q: '%' })).total).toBe(1); // solo el asunto que contiene "%"
    expect((await listarCorreos(db.pool, { q: '_' })).total).toBe(1);
  });

  it('pagina con limite y desplazamiento sin cambiar el total', async () => {
    const r = await listarCorreos(db.pool, { limite: 1, desplazamiento: 1 });
    expect(r.total).toBe(3);
    expect(r.correos.map((c) => c.asunto)).toEqual(['Consulta 100%_[general]']);
  });

  it('rechaza filtros inválidos con ValidationError', async () => {
    await expect(listarCorreos(db.pool, { limite: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(listarCorreos(db.pool, { q: 'x'.repeat(201) })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Buzón · detalleCorreo', () => {
  it('incluye el cuerpo completo (NVARCHAR: emojis intactos)', async () => {
    const { correos } = await listarCorreos(db.pool, { q: 'Robo' });
    const d = await detalleCorreo(db.pool, correos[0]!.id);
    expect(d.cuerpo).toBe('Revisen las cámaras 📹');
    expect(d.categoria).toBe('SEGURIDAD');
  });

  it('NotFound si no existe; ValidationError si el id no es válido', async () => {
    await expect(detalleCorreo(db.pool, 999_999)).rejects.toBeInstanceOf(NotFound);
    await expect(detalleCorreo(db.pool, -1)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Buzón · checkpoint y estado del gateway', () => {
  it('leerCheckpoint devuelve números (BIGINT llega como texto) o null si la cuenta no existe', async () => {
    expect(await leerCheckpoint(db.pool, 'buzon@gmail.com')).toEqual({ uidValidity: 7, ultimoUid: 42 });
    expect(await leerCheckpoint(db.pool, 'nadie@gmail.com')).toBeNull();
  });

  it('estadoGateway resume cuentas y volumen del buzón', async () => {
    const e = await estadoGateway(db.pool);
    expect(e.totalCorreos).toBe(3);
    expect(e.cuentas).toEqual([expect.objectContaining({ cuenta: 'buzon@gmail.com', ultimoUid: 42 })]);
    expect(e.ultimoCorreo).toBeInstanceOf(Date);
  });
});

describe('T1 · sinClasificar (respaldo del gateway)', () => {
  it('guarda SIN_CLASIFICAR/MEDIA aunque el texto sea clasificable', async () => {
    const r = await ingestarCorreo(db.pool, {
      messageId: '<buz-respaldo@mail>', remitente: 'ana@mail.com',
      asunto: 'Robo e incendio', cuerpo: 'Emergencia', sinClasificar: true,
    });
    expect(r).toMatchObject({ duplicado: false, categoria: 'SIN_CLASIFICAR', prioridad: 'MEDIA' });
  });
});
