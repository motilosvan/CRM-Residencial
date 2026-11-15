import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ErrorAcceso, ValidationError } from '../errors.js';
import {
  LIMITE_INACTIVIDAD_MS,
  RENOVACION_MIN_MS,
  cambiarConjuntoActivo,
  crearSesion,
  leerSesion,
  revocarSesion,
} from './sesiones.js';

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const en = (ms: number) => new Date(T0 + ms);
const MIN = 60_000;

let db: TestDb;
let conjunto: number;
let norte: number; // segundo conjunto: el admin es SOPORTE allí
let sur: number; // conjunto activo sin membresía del admin
let cerrado: number; // conjunto inactivo con membresía del admin
let idAdmin: number;

/** Espera un ErrorAcceso con ese código y lo devuelve para revisar el estado. */
async function errorDe(p: Promise<unknown>, codigo: ErrorAcceso['codigo']): Promise<ErrorAcceso> {
  const err = await p.then(
    () => { throw new Error('se esperaba un ErrorAcceso'); },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorAcceso);
  expect((err as ErrorAcceso).codigo).toBe(codigo);
  return err as ErrorAcceso;
}

async function fila(token: string) {
  const hex = createHash('sha256').update(token).digest('hex');
  const [f] = await db.q<{ idConjuntoActivo: number; ultimaActividad: Date; revocadaEn: Date | null }>(
    `SELECT idConjuntoActivo, ultimaActividad, revocadaEn FROM SESIONES WHERE tokenHash = 0x${hex}`,
  );
  return f;
}

async function nuevoConjunto(slug: string, nombre: string, activo: boolean): Promise<number> {
  const [r] = await db.q<{ id: number }>(
    `INSERT INTO CONJUNTOS (slug, nombre, activo) OUTPUT inserted.idConjunto AS id VALUES ('${slug}', N'${nombre}', ${activo ? 1 : 0})`,
  );
  return r!.id;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_ses');
  conjunto = await idConjuntoInicial(db);
  norte = await nuevoConjunto('torres-del-norte', 'Torres del Norte', true);
  sur = await nuevoConjunto('villa-sur', 'Villa Sur', true);
  cerrado = await nuevoConjunto('cerrado', 'Conjunto Cerrado', false);
  idAdmin = await crearUsuario(db, { nombre: 'Admin Demo', correo: 'admin@demo.mailflow.test', rol: 'ADMIN' });
  await db.q(`INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) VALUES (${idAdmin}, ${norte}, 'SOPORTE'), (${idAdmin}, ${cerrado}, 'ADMIN')`);
});
afterAll(async () => db.close());

describe('Sesiones · crear y leer', () => {
  it('constantes del spec', () => {
    expect(LIMITE_INACTIVIDAD_MS).toBe(30 * MIN);
    expect(RENOVACION_MIN_MS).toBe(MIN);
  });

  it('devuelve el DTO completo y en la BD solo queda el SHA-256 del token', async () => {
    const { token, sesion } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const inicial = {
      id: String(conjunto),
      slug: 'parque-central-occidente',
      nombre: 'Parque Central de Occidente',
      paleta: { primario: '#355E3B', acento: '#D6A64F', secundario: '#789653' },
    };
    const esperado = {
      usuario: { id: String(idAdmin), nombre: 'Admin Demo', correo: 'admin@demo.mailflow.test', rol: 'ADMIN' },
      conjuntoActivo: inicial,
      // Membresías activas en conjuntos activos, por nombre: sin "Conjunto Cerrado" ni "Villa Sur".
      conjuntos: [inicial, { id: String(norte), slug: 'torres-del-norte', nombre: 'Torres del Norte' }],
      ultimaActividad: T0,
    };
    expect(sesion).toEqual(esperado);

    const leida = await leerSesion(db.pool, token, en(1000));
    expect(leida).toMatchObject({ ...esperado, idUsuario: idAdmin, idConjuntoActivo: conjunto });
    expect(typeof leida.idSesion).toBe('number');

    const filas = await db.q<{ tokenHash: Buffer }>(`SELECT tokenHash FROM SESIONES WHERE idSesion = ${leida.idSesion}`);
    expect(filas).toHaveLength(1);
    const hash = filas[0]!.tokenHash;
    expect(hash.equals(createHash('sha256').update(token).digest())).toBe(true);
    expect(hash.toString('latin1')).not.toContain(token);
    expect(hash.toString('base64url')).not.toBe(token);
    const [{ n }] = (await db.q<{ n: number }>(
      `SELECT COUNT(*) AS n FROM SESIONES WHERE CONVERT(VARCHAR(100), tokenHash, 2) LIKE '%${Buffer.from(token).toString('hex').slice(0, 16)}%'`,
    )) as [{ n: number }];
    expect(n).toBe(0);
  });

  it('crear para un usuario sin membresía activa en el conjunto → 403 SIN_MEMBRESIA', async () => {
    const e = await errorDe(crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: sur }, en(0)), 'SIN_MEMBRESIA');
    expect(e.estado).toBe(403);
    await errorDe(crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: cerrado }, en(0)), 'SIN_MEMBRESIA');
  });

  it.each([
    ['ausente', undefined],
    ['vacío', ''],
    ['desconocido', 'A'.repeat(43)],
    ['de 10 000 caracteres', 'x'.repeat(10_000)],
  ])('token %s → 401 NO_AUTENTICADO', async (_caso, token) => {
    const e = await errorDe(leerSesion(db.pool, token, en(0)), 'NO_AUTENTICADO');
    expect(e.estado).toBe(401);
  });
});

describe('Sesiones · inactividad', () => {
  it('a los 30 min + 1 ms → 401 SESION_INACTIVA y queda revocada; el segundo intento da NO_AUTENTICADO', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    const e = await errorDe(leerSesion(db.pool, token, en(30 * MIN + 1)), 'SESION_INACTIVA');
    expect(e.estado).toBe(401);
    expect((await fila(token))!.revocadaEn?.getTime()).toBe(T0 + 30 * MIN + 1);
    await errorDe(leerSesion(db.pool, token, en(30 * MIN + 2)), 'NO_AUTENTICADO');
  });

  it('justo a los 30 min sigue viva', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    expect((await leerSesion(db.pool, token, en(30 * MIN))).ultimaActividad).toBe(T0 + 30 * MIN);
  });

  it('una lectura a los 29 min renueva y permite otra 29 min después', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    expect((await leerSesion(db.pool, token, en(29 * MIN))).ultimaActividad).toBe(T0 + 29 * MIN);
    expect((await fila(token))!.ultimaActividad.getTime()).toBe(T0 + 29 * MIN);
    expect((await leerSesion(db.pool, token, en(58 * MIN))).ultimaActividad).toBe(T0 + 58 * MIN);
  });

  it('dos lecturas con 10 s de diferencia no cambian ultimaActividad', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    expect((await leerSesion(db.pool, token, en(10_000))).ultimaActividad).toBe(T0);
    expect((await leerSesion(db.pool, token, en(20_000))).ultimaActividad).toBe(T0);
    expect((await fila(token))!.ultimaActividad.getTime()).toBe(T0);
  });
});

describe('Sesiones · revocar', () => {
  it('tras revocarSesion → NO_AUTENTICADO y la fila sigue existiendo', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    await revocarSesion(db.pool, token, en(5000));
    await errorDe(leerSesion(db.pool, token, en(6000)), 'NO_AUTENTICADO');
    expect((await fila(token))!.revocadaEn?.getTime()).toBe(T0 + 5000);
  });

  it('nunca lanza por token desconocido, vacío o ausente', async () => {
    await expect(revocarSesion(db.pool, 'B'.repeat(43), en(0))).resolves.toBeUndefined();
    await expect(revocarSesion(db.pool, '', en(0))).resolves.toBeUndefined();
    await expect(revocarSesion(db.pool, undefined, en(0))).resolves.toBeUndefined();
    await expect(revocarSesion(db.pool, 'x'.repeat(10_000), en(0))).resolves.toBeUndefined();
  });
});

describe('Sesiones · cambiar de conjunto', () => {
  it('a un conjunto con membresía activa devuelve el rol de ese conjunto', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    const s = await cambiarConjuntoActivo(db.pool, token, String(norte), en(1000));
    expect(s.conjuntoActivo).toEqual({ id: String(norte), slug: 'torres-del-norte', nombre: 'Torres del Norte' });
    expect(s.usuario.rol).toBe('SOPORTE');
    expect(s.conjuntos).toHaveLength(2);
    expect('idSesion' in s).toBe(false);

    const leida = await leerSesion(db.pool, token, en(2000));
    expect(leida.idConjuntoActivo).toBe(norte);
    expect(leida.usuario.rol).toBe('SOPORTE');
    expect((await fila(token))!.idConjuntoActivo).toBe(norte);
  });

  it.each([
    ['sin membresía', () => sur],
    ['conjunto inactivo', () => cerrado],
    ['conjunto inexistente', () => 999_999],
  ])('%s → 403 SIN_MEMBRESIA y el conjunto activo no cambia', async (_caso, destino) => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    const e = await errorDe(cambiarConjuntoActivo(db.pool, token, String(destino()), en(1000)), 'SIN_MEMBRESIA');
    expect(e.estado).toBe(403);
    expect((await leerSesion(db.pool, token, en(2000))).idConjuntoActivo).toBe(conjunto);
  });

  it.each(['abc', '', '12x', '-1', '1234567890'])('conjuntoId "%s" → ValidationError', async (conjuntoId) => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    await expect(cambiarConjuntoActivo(db.pool, token, conjuntoId, en(1000))).rejects.toBeInstanceOf(ValidationError);
  });

  it('con token desconocido → 401 NO_AUTENTICADO', async () => {
    await errorDe(cambiarConjuntoActivo(db.pool, 'C'.repeat(43), String(norte), en(0)), 'NO_AUTENTICADO');
  });

  it('con la sesión inactiva → 401 SESION_INACTIVA y queda revocada', async () => {
    const { token } = await crearSesion(db.pool, { idUsuario: idAdmin, idConjunto: conjunto }, en(0));
    await errorDe(cambiarConjuntoActivo(db.pool, token, String(norte), en(30 * MIN + 1)), 'SESION_INACTIVA');
    expect((await fila(token))!.revocadaEn).not.toBeNull();
    expect((await fila(token))!.idConjuntoActivo).toBe(conjunto);
  });
});

describe('Sesiones · foco 3: la membresía manda', () => {
  it('desactivar el usuario hace que la siguiente lectura dé 401 y revoque', async () => {
    const id = await crearUsuario(db, { nombre: 'Soporte Uno', correo: 'soporte1@demo.mailflow.test', rol: 'SOPORTE' });
    const { token } = await crearSesion(db.pool, { idUsuario: id, idConjunto: conjunto }, en(0));
    await db.q(`UPDATE USUARIOS SET activo = 0 WHERE idUsuario = ${id}`);
    const e = await errorDe(leerSesion(db.pool, token, en(1000)), 'NO_AUTENTICADO');
    expect(e.estado).toBe(401);
    expect((await fila(token))!.revocadaEn?.getTime()).toBe(T0 + 1000);
  });

  it('desactivar la membresía en el conjunto activo hace que la siguiente lectura dé 401 y revoque', async () => {
    const id = await crearUsuario(db, { nombre: 'Soporte Dos', correo: 'soporte2@demo.mailflow.test', rol: 'SOPORTE' });
    const { token } = await crearSesion(db.pool, { idUsuario: id, idConjunto: conjunto }, en(0));
    await db.q(`UPDATE USUARIO_CONJUNTOS SET activo = 0 WHERE idUsuario = ${id} AND idConjunto = ${conjunto}`);
    const e = await errorDe(leerSesion(db.pool, token, en(1000)), 'NO_AUTENTICADO');
    expect(e.estado).toBe(401);
    expect((await fila(token))!.revocadaEn?.getTime()).toBe(T0 + 1000);
    // La revocación es definitiva: reactivar la membresía no revive el token.
    await db.q(`UPDATE USUARIO_CONJUNTOS SET activo = 1 WHERE idUsuario = ${id} AND idConjunto = ${conjunto}`);
    await errorDe(leerSesion(db.pool, token, en(2000)), 'NO_AUTENTICADO');
  });
});
