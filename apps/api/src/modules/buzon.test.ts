import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONJ_SQL, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { NotFound, ValidationError } from '../errors.js';
import { detalleCorreo, estadoGateway, leerCheckpoint, listarCorreos } from './consultas.js';
import { ingestarCorreo } from './ingesta.js';

let db: TestDb;
let inicial: number;
let norte: number;
let vacio: number;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_buz');
  await db.q(`INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${CONJ_SQL}, N'Ana Pérez', 'T1-101', 'ana@mail.com')`);
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
  inicial = await idConjuntoInicial(db);
  // Otro conjunto con correos que coinciden con las búsquedas del inicial: ninguno debe filtrarse hacia él.
  norte = (await db.q<{ id: number }>(`
    INSERT INTO CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES ('torres-del-norte', N'Torres del Norte');`))[0]!.id;
  vacio = (await db.q<{ id: number }>(`
    INSERT INTO CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES ('conjunto-vacio', N'Conjunto Vacío');`))[0]!.id;
  await db.q(`INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${norte}, N'Beto Pérez', 'N-1', 'beto@demo.mailflow.test')`);
  await ingestarCorreo(db.pool, {
    messageId: '<buz-n1@mail>', remitente: 'beto@demo.mailflow.test', asunto: 'Fuga en la torre norte',
    cuerpo: 'Gotea el techo', recibidoEn: new Date(base + 180_000), idConjunto: norte,
    checkpoint: { cuenta: 'norte@demo.mailflow.test', uidValidity: 1, uid: 5 },
  });
  await ingestarCorreo(db.pool, {
    messageId: '<buz-n2@mail>', remitente: 'vecino@demo.mailflow.test', asunto: 'Robo de bicicleta',
    cuerpo: 'En el sótano', recibidoEn: new Date(base + 240_000), idConjunto: norte,
  });
});
afterAll(async () => db.close());

describe('Buzón · listarCorreos', () => {
  it('devuelve los correos más recientes primero, con residente y solicitud vinculados', async () => {
    const r = await listarCorreos(db.pool, inicial);
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
    const r = await listarCorreos(db.pool, inicial, { q: 'fuga' });
    expect(r.correos[0]!.extracto.length).toBe(200);
  });

  it('busca en asunto, remitente y nombre del residente; los comodines de LIKE se toman literales', async () => {
    expect((await listarCorreos(db.pool, inicial, { q: 'Pérez' })).total).toBe(2);
    expect((await listarCorreos(db.pool, inicial, { q: 'otro.com' })).total).toBe(1);
    expect((await listarCorreos(db.pool, inicial, { q: '100%_[' })).total).toBe(1);
    expect((await listarCorreos(db.pool, inicial, { q: '%' })).total).toBe(1); // solo el asunto que contiene "%"
    expect((await listarCorreos(db.pool, inicial, { q: '_' })).total).toBe(1);
  });

  it('pagina con limite y desplazamiento sin cambiar el total', async () => {
    const r = await listarCorreos(db.pool, inicial, { limite: 1, desplazamiento: 1 });
    expect(r.total).toBe(3);
    expect(r.correos.map((c) => c.asunto)).toEqual(['Consulta 100%_[general]']);
  });

  it('rechaza filtros inválidos con ValidationError', async () => {
    await expect(listarCorreos(db.pool, inicial, { limite: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(listarCorreos(db.pool, inicial, { q: 'x'.repeat(201) })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Buzón · detalleCorreo', () => {
  it('incluye el cuerpo completo (NVARCHAR: emojis intactos)', async () => {
    const { correos } = await listarCorreos(db.pool, inicial, { q: 'Robo' });
    const d = await detalleCorreo(db.pool, inicial, correos[0]!.id);
    expect(d.cuerpo).toBe('Revisen las cámaras 📹');
    expect(d.categoria).toBe('SEGURIDAD');
  });

  it('NotFound si no existe; ValidationError si el id no es válido', async () => {
    await expect(detalleCorreo(db.pool, inicial, 999_999)).rejects.toBeInstanceOf(NotFound);
    await expect(detalleCorreo(db.pool, inicial, -1)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Buzón · checkpoint y estado del gateway', () => {
  it('leerCheckpoint devuelve números (BIGINT llega como texto) o null si la cuenta no existe', async () => {
    expect(await leerCheckpoint(db.pool, 'buzon@gmail.com')).toEqual({ uidValidity: 7, ultimoUid: 42 });
    expect(await leerCheckpoint(db.pool, 'nadie@gmail.com')).toBeNull();
  });

  it('estadoGateway resume cuentas y volumen del buzón', async () => {
    const e = await estadoGateway(db.pool, inicial);
    expect(e.totalCorreos).toBe(3);
    expect(e.cuentas).toEqual([expect.objectContaining({ cuenta: 'buzon@gmail.com', ultimoUid: 42 })]);
    expect(e.ultimoCorreo).toBeInstanceOf(Date);
  });
});

describe('Buzón · filtro por conjunto', () => {
  it('listarCorreos devuelve total y filas solo del conjunto pedido, también al buscar con q', async () => {
    const n = await listarCorreos(db.pool, norte);
    expect(n.total).toBe(2);
    expect(n.correos.map((c) => c.asunto)).toEqual(['Robo de bicicleta', 'Fuga en la torre norte']);
    expect(n.correos[1]).toMatchObject({ residente: 'Beto Pérez', unidad: 'N-1' });

    // "Fuga", "Robo" y "Pérez" existen en ambos conjuntos: cada uno ve solo lo suyo.
    const fugaNorte = await listarCorreos(db.pool, norte, { q: 'Fuga' });
    expect(fugaNorte.total).toBe(1);
    expect(fugaNorte.correos.map((c) => c.asunto)).toEqual(['Fuga en la torre norte']);
    const fugaInicial = await listarCorreos(db.pool, inicial, { q: 'Fuga' });
    expect(fugaInicial.total).toBe(1);
    expect(fugaInicial.correos.map((c) => c.asunto)).toEqual(['Fuga de agua en el baño']);
    expect((await listarCorreos(db.pool, norte, { q: 'Pérez' })).total).toBe(1);
    expect((await listarCorreos(db.pool, inicial, { q: 'Robo' })).total).toBe(1);
    expect((await listarCorreos(db.pool, inicial, { q: 'demo.mailflow.test' })).total).toBe(0);

    const vacioR = await listarCorreos(db.pool, vacio);
    expect(vacioR).toEqual({ total: 0, correos: [] });
  });

  it('detalleCorreo de un correo de otro conjunto lanza NotFound', async () => {
    const [ajeno] = (await listarCorreos(db.pool, norte, { q: 'torre norte' })).correos;
    expect((await detalleCorreo(db.pool, norte, ajeno!.id)).cuerpo).toBe('Gotea el techo');
    await expect(detalleCorreo(db.pool, inicial, ajeno!.id)).rejects.toBeInstanceOf(NotFound);
    const [propio] = (await listarCorreos(db.pool, inicial, { q: 'Robo' })).correos;
    await expect(detalleCorreo(db.pool, norte, propio!.id)).rejects.toBeInstanceOf(NotFound);
  });

  it('estadoGateway cuenta solo las cuentas y los correos del conjunto', async () => {
    const n = await estadoGateway(db.pool, norte);
    expect(n.totalCorreos).toBe(2);
    expect(n.cuentas).toEqual([expect.objectContaining({ cuenta: 'norte@demo.mailflow.test', ultimoUid: 5 })]);
    expect(n.ultimoCorreo).toEqual(new Date(Date.UTC(2026, 9, 1, 12) + 240_000));
    expect(await estadoGateway(db.pool, vacio)).toEqual({ cuentas: [], totalCorreos: 0, ultimoCorreo: null });
  });

  it('idConjunto inválido ⇒ ValidationError', async () => {
    for (const malo of [0, -1, 1.5, Number.NaN]) {
      await expect(listarCorreos(db.pool, malo)).rejects.toBeInstanceOf(ValidationError);
      await expect(detalleCorreo(db.pool, malo, 1)).rejects.toBeInstanceOf(ValidationError);
      await expect(estadoGateway(db.pool, malo)).rejects.toBeInstanceOf(ValidationError);
    }
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
