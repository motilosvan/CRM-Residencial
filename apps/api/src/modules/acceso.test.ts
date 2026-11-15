import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearUsuario, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ErrorAcceso, ValidationError } from '../errors.js';
import { hashCodigo, solicitarCodigo, verificarCodigo, type DepsAcceso } from './acceso.js';
import { EnviadorLocal, type EnviadorCodigo } from './enviador.js';

const T0 = Date.UTC(2026, 10, 15, 12, 0, 0);
const SECRETO = 'secreto-de-pruebas-con-al-menos-32-caracteres';

let db: TestDb;
let conjunto: number;
let conjuntoId: string;
let idAdmin: number;
let reloj: number;
let codigos: string[];
let enviador: EnviadorLocal;
let lineas: string[];

function deps(extra: Partial<DepsAcceso> = {}): DepsAcceso {
  return {
    secreto: SECRETO,
    enviador,
    ahora: () => new Date(reloj),
    generarCodigo: () => codigos.shift() ?? '999999',
    registrarError: () => undefined,
    ...extra,
  };
}

/** Espera un ErrorAcceso con ese código y lo devuelve para revisar estado y detalle. */
async function errorDe(p: Promise<unknown>, codigo: ErrorAcceso['codigo']): Promise<ErrorAcceso> {
  const err = await p.then(
    () => { throw new Error('se esperaba un ErrorAcceso'); },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorAcceso);
  expect((err as ErrorAcceso).codigo).toBe(codigo);
  return err as ErrorAcceso;
}

async function reto(correo: string) {
  const filas = await db.q<{ codigoHash: Buffer; existeUsuario: boolean; intentosFallidos: number; bloqueadoHasta: Date | null; consumidoEn: Date | null }>(
    `SELECT codigoHash, existeUsuario, intentosFallidos, bloqueadoHasta, consumidoEn FROM RETOS_ACCESO
      WHERE idConjunto = ${conjunto} AND correo = '${correo}'`,
  );
  return filas;
}

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_acc');
  conjunto = await idConjuntoInicial(db);
  conjuntoId = String(conjunto);
  idAdmin = await crearUsuario(db, { nombre: 'Admin Demo', correo: 'admin@demo.mailflow.test', rol: 'ADMIN' });
  for (const correo of ['feliz@demo.mailflow.test', 'reenvio@demo.mailflow.test', 'bloqueo@demo.mailflow.test',
    'carrera@demo.mailflow.test', 'foco5@demo.mailflow.test', 'falla@demo.mailflow.test']) {
    await crearUsuario(db, { nombre: 'Soporte', correo, rol: 'SOPORTE' });
  }
  await crearUsuario(db, { nombre: 'Inactivo', correo: 'inactivo@demo.mailflow.test', rol: 'SOPORTE', activo: false });
  await crearUsuario(db, { nombre: 'Sin membresía', correo: 'exmiembro@demo.mailflow.test', rol: 'SOPORTE' });
  await db.q(`UPDATE m SET activo = 0 FROM USUARIO_CONJUNTOS m JOIN USUARIOS u ON u.idUsuario = m.idUsuario
               WHERE u.correo = 'exmiembro@demo.mailflow.test'`);
});
afterAll(async () => db.close());

beforeEach(() => {
  reloj = T0;
  codigos = ['111111', '222222', '333333', '444444', '555555'];
  lineas = [];
  enviador = new EnviadorLocal((l) => lineas.push(l));
});

describe('Acceso · flujo feliz', () => {
  it('solicita, envía el código y lo verifica; en la BD solo queda el HMAC', async () => {
    const correo = 'feliz@demo.mailflow.test';
    const r = await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    expect(r).toEqual({ venceEn: T0 + 600_000, reenvioDisponibleEn: T0 + 60_000 });
    expect(enviador.ultimo).toMatchObject({ correo, codigo: '111111', conjunto: 'Parque Central de Occidente' });
    expect(enviador.ultimo!.venceEn.getTime()).toBe(T0 + 600_000);

    const [fila] = await reto(correo);
    expect(fila!.codigoHash.length).toBe(32);
    expect(fila!.codigoHash.toString('latin1')).not.toContain('111111');
    expect(fila!.codigoHash.toString('hex')).not.toContain('111111');
    expect(fila!.codigoHash.equals(hashCodigo(SECRETO, conjunto, correo, '111111'))).toBe(true);
    expect(fila!.existeUsuario).toBe(true);

    reloj = T0 + 30_000;
    const ok = await verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111 111' });
    const [{ id }] = await db.q<{ id: number }>(`SELECT idUsuario AS id FROM USUARIOS WHERE correo = '${correo}'`) as [{ id: number }];
    expect(ok).toEqual({ idUsuario: id, idConjunto: conjunto });

    const [usado] = await reto(correo);
    expect(usado!.consumidoEn?.getTime()).toBe(T0 + 30_000);
    expect(usado!.intentosFallidos).toBe(0);
  });

  it('un código ya usado da CODIGO_INCORRECTO', async () => {
    const correo = 'feliz@demo.mailflow.test';
    reloj = T0 + 120_000;
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    await verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111111' });
    const e = await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111111' }), 'CODIGO_INCORRECTO');
    expect(e.estado).toBe(400);
    expect(e.detalle).toEqual({ intentosRestantes: 4 });
  });
});

describe('Acceso · no enumeración de correos', () => {
  it('un correo no registrado recibe la misma respuesta, sin envío, y nunca entra', async () => {
    const correo = 'nadie@mail.com';
    const r = await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    expect(r).toEqual({ venceEn: T0 + 600_000, reenvioDisponibleEn: T0 + 60_000 });
    expect(enviador.ultimo).toBeUndefined();
    expect(lineas).toEqual([]);
    const [fila] = await reto(correo);
    expect(fila!.existeUsuario).toBe(false);

    const e = await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111111' }), 'CODIGO_INCORRECTO');
    expect(e.detalle).toEqual({ intentosRestantes: 4 });
  });

  it('sin reto previo: CODIGO_INCORRECTO con 5 intentos y sin escribir', async () => {
    const correo = 'jamas@mail.com';
    const e = await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '123456' }), 'CODIGO_INCORRECTO');
    expect(e.estado).toBe(400);
    expect(e.detalle).toEqual({ intentosRestantes: 5 });
    expect(await reto(correo)).toEqual([]);
  });

  it.each([
    ['usuario inactivo', 'inactivo@demo.mailflow.test'],
    ['membresía inactiva', 'exmiembro@demo.mailflow.test'],
  ])('%s se comporta como no registrado', async (_caso, correo) => {
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    expect(enviador.ultimo).toBeUndefined();
    expect((await reto(correo))[0]!.existeUsuario).toBe(false);
    await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111111' }), 'CODIGO_INCORRECTO');
  });
});

describe('Acceso · tiempos', () => {
  it('REENVIO_PRONTO a los 59 s, aceptado a los 60 s; CODIGO_VENCIDO a los 10 min + 1 ms', async () => {
    const correo = 'reenvio@demo.mailflow.test';
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });

    reloj = T0 + 59_000;
    const pronto = await errorDe(solicitarCodigo(db.pool, deps(), { conjuntoId, correo }), 'REENVIO_PRONTO');
    expect(pronto.estado).toBe(429);

    const t1 = T0 + 60_000;
    reloj = t1;
    expect(await solicitarCodigo(db.pool, deps(), { conjuntoId, correo })).toEqual({ venceEn: t1 + 600_000, reenvioDisponibleEn: t1 + 60_000 });
    expect(enviador.ultimo!.codigo).toBe('222222');

    reloj = t1 + 600_001;
    const vencido = await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '222222' }), 'CODIGO_VENCIDO');
    expect(vencido.estado).toBe(410);
    expect((await reto(correo))[0]!.intentosFallidos).toBe(0);
  });
});

describe('Acceso · bloqueo', () => {
  it('5 fallos bloquean 15 min (también para pedir otro código); después el contador vuelve a 0', async () => {
    const correo = 'bloqueo@demo.mailflow.test';
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    for (let i = 1; i <= 4; i++) {
      const e = await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '000000' }), 'CODIGO_INCORRECTO');
      expect(e.detalle).toEqual({ intentosRestantes: 5 - i });
    }
    const b = await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '000000' }), 'BLOQUEADO');
    expect(b.estado).toBe(429);
    expect(b.detalle?.desbloqueoEn).toBe(T0 + 900_000);

    // Ni el código correcto ni un código nuevo durante el bloqueo.
    await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111111' }), 'BLOQUEADO');
    reloj = T0 + 120_000;
    const s = await errorDe(solicitarCodigo(db.pool, deps(), { conjuntoId, correo }), 'BLOQUEADO');
    expect(s.detalle?.desbloqueoEn).toBe(T0 + 900_000);

    reloj = T0 + 900_000;
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    const [fila] = await reto(correo);
    expect(fila!.intentosFallidos).toBe(0);
    expect(fila!.bloqueadoHasta).toBeNull();
    expect(await verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '222222' })).toMatchObject({ idConjunto: conjunto });
  });

  it('foco 5: pedir un código nuevo no reinicia el contador (3 fallos + 2 fallos = BLOQUEADO)', async () => {
    const correo = 'foco5@demo.mailflow.test';
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    for (let i = 0; i < 3; i++) {
      await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '000000' }), 'CODIGO_INCORRECTO');
    }
    reloj = T0 + 60_000;
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    const e = await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '000000' }), 'CODIGO_INCORRECTO');
    expect(e.detalle).toEqual({ intentosRestantes: 1 });
    await errorDe(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '000000' }), 'BLOQUEADO');
  });
});

describe('Acceso · focos', () => {
  it('foco 1: el correo se normaliza (espacios y mayúsculas) y opera sobre el mismo reto', async () => {
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo: ' Admin@Demo.Mailflow.Test ' });
    expect(enviador.ultimo!.correo).toBe('admin@demo.mailflow.test');
    reloj = T0 + 10_000;
    await errorDe(solicitarCodigo(db.pool, deps(), { conjuntoId, correo: 'admin@demo.mailflow.test' }), 'REENVIO_PRONTO');
    expect(await verificarCodigo(db.pool, deps(), { conjuntoId, correo: 'ADMIN@demo.mailflow.test', codigo: '111111' }))
      .toEqual({ idUsuario: idAdmin, idConjunto: conjunto });
    expect(await reto('admin@demo.mailflow.test')).toHaveLength(1);
  });

  it('foco 2: dos verificaciones simultáneas del código correcto → una entra, la otra CODIGO_INCORRECTO', async () => {
    const correo = 'carrera@demo.mailflow.test';
    await solicitarCodigo(db.pool, deps(), { conjuntoId, correo });
    const r = await Promise.allSettled([
      verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111111' }),
      verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '111111' }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazos = r.filter((x): x is PromiseRejectedResult => x.status === 'rejected');
    expect(rechazos).toHaveLength(1);
    expect(rechazos[0]!.reason).toBeInstanceOf(ErrorAcceso);
    expect((rechazos[0]!.reason as ErrorAcceso).codigo).toBe('CODIGO_INCORRECTO');
  });
});

describe('Acceso · envío', () => {
  it('un enviador que rechaza no cambia la respuesta; se registra el tipo de error sin el correo', async () => {
    const correo = 'falla@demo.mailflow.test';
    const roto: EnviadorCodigo = { enviar: () => Promise.reject(new Error(`SMTP rechazó a ${correo}`)) };
    const registrarError = vi.fn<(d: string) => void>();
    const r = await solicitarCodigo(db.pool, deps({ enviador: roto, registrarError }), { conjuntoId, correo });
    expect(r).toEqual({ venceEn: T0 + 600_000, reenvioDisponibleEn: T0 + 60_000 });
    await vi.waitFor(() => expect(registrarError).toHaveBeenCalledTimes(1));
    const texto = registrarError.mock.calls[0]![0];
    expect(texto).not.toContain('@');
    expect(texto).not.toContain('111111');
  });
});

describe('Acceso · validación', () => {
  it('rechaza entradas mal formadas y conjuntos inexistentes o inactivos con ValidationError', async () => {
    const correo = 'admin@demo.mailflow.test';
    await expect(solicitarCodigo(db.pool, deps(), { conjuntoId: 'abc', correo })).rejects.toBeInstanceOf(ValidationError);
    await expect(solicitarCodigo(db.pool, deps(), { conjuntoId, correo: 'no-es-correo' })).rejects.toBeInstanceOf(ValidationError);
    await expect(solicitarCodigo(db.pool, deps(), { conjuntoId, correo: `${'a'.repeat(320)}@mail.com` })).rejects.toBeInstanceOf(ValidationError);
    await expect(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '12345' })).rejects.toBeInstanceOf(ValidationError);
    await expect(verificarCodigo(db.pool, deps(), { conjuntoId, correo, codigo: '12345a' })).rejects.toBeInstanceOf(ValidationError);
    await expect(solicitarCodigo(db.pool, deps(), { conjuntoId: '999999', correo })).rejects.toBeInstanceOf(ValidationError);
    await expect(verificarCodigo(db.pool, deps(), { conjuntoId: '999999', correo, codigo: '123456' })).rejects.toBeInstanceOf(ValidationError);

    const [{ id }] = await db.q<{ id: number }>(
      `INSERT INTO CONJUNTOS (slug, nombre, activo) OUTPUT inserted.idConjunto AS id VALUES ('cerrado', N'Cerrado', 0)`,
    ) as [{ id: number }];
    await expect(solicitarCodigo(db.pool, deps(), { conjuntoId: String(id), correo })).rejects.toBeInstanceOf(ValidationError);
  });
});
