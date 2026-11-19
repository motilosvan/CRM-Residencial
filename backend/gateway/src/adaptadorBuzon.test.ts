import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorConexionBuzon, type BuzonActivo } from '../../api/src/modules/buzones.js';
import { leerCheckpoint } from '../../api/src/modules/consultas.js';
import { idConjuntoInicial, setupTestDb, type TestDb } from '../../api/test/helpers/testDb.js';
import { BuzonFalso } from '../test/buzonFalso.js';
import { mensajeCrudo } from '../test/mensajes.js';
import { crearAdaptadorBuzon } from './adaptadorBuzon.js';
import type { FuenteCorreo } from './fuente.js';

let db: TestDb;
let idConjunto: number;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_gwadap');
  idConjunto = await idConjuntoInicial(db);
});
afterAll(async () => db.close());

const AHORA = new Date('2026-10-20T15:00:00Z');
const conexion = { host: 'imap.prueba', port: 993, usuario: 'buzon@demo.mailflow.test', contrasena: 'x', buzon: 'INBOX' };

/** Adaptador cuyo "IMAP" es el buzón en memoria; registra con qué opciones se pidió cada fuente. */
function adaptadorCon(b: BuzonFalso) {
  const pedidas: { marcarLeido: boolean; esperaMs?: number }[] = [];
  const adaptador = crearAdaptadorBuzon({
    maxPorCiclo: 50,
    maxIntentos: 3,
    ahora: () => AHORA,
    crearFuente: (_c, o) => {
      pedidas.push(o);
      return b.fuente();
    },
  });
  return { adaptador, pedidas };
}

const errores = {
  AUTENTICACION: Object.assign(new Error('Authentication failed'), { authenticationFailed: true }),
  CERTIFICADO: Object.assign(new Error('self signed'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' }),
  CONEXION: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
} as const;

describe('Gateway · adaptador de buzón (DepsBuzon sobre FuenteImap + sincronizar)', () => {
  it('probarConexion abre en solo lectura, con esperas acotadas a 15 s, y cierra la sesión', async () => {
    const b = new BuzonFalso();
    const { adaptador, pedidas } = adaptadorCon(b);
    await adaptador.probarConexion(conexion);
    expect(pedidas).toEqual([{ marcarLeido: false, esperaMs: 15_000 }]);
    expect(b.aperturas).toBe(1);
    expect(b.cierres).toBe(1);
  });

  it('probarConexion traduce autenticación, certificado y cualquier otro fallo al abrir, y cierra igual', async () => {
    for (const [codigo, err] of Object.entries(errores)) {
      const b = new BuzonFalso();
      b.falloAlAbrir = err;
      const { adaptador } = adaptadorCon(b);
      const e = await adaptador.probarConexion(conexion).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ErrorConexionBuzon);
      expect(e).toMatchObject({ codigo });
      expect((e as Error).message).not.toContain(conexion.usuario);
      expect(b.cierres).toBe(b.aperturas);
    }
  });

  it('probarConexion vence a los 15 s si el servidor no responde: CONEXION y la fuente se cierra (temporizadores falsos)', async () => {
    vi.useFakeTimers();
    try {
      let cierres = 0;
      const muda: FuenteCorreo = {
        abrir: () => new Promise(() => {}), // nunca responde
        uidsDesde: async () => [],
        uidsMayoresQue: async () => [],
        descargar: async () => null,
        marcarLeido: async () => {},
        cerrar: async () => {
          cierres++;
        },
      };
      const adaptador = crearAdaptadorBuzon({ maxPorCiclo: 50, maxIntentos: 3, crearFuente: () => muda });
      const p = adaptador.probarConexion(conexion);
      const esperado = expect(p).rejects.toMatchObject({ name: 'ErrorConexionBuzon', codigo: 'CONEXION' });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(cierres).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      await esperado;
      expect(cierres).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ejecutarSincronizacion guarda en el conjunto del buzón con checkpoint `idConjunto:usuario/buzon`', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<adap-1@x>' }), new Date(AHORA.getTime() - 86_400_000));
    const { adaptador, pedidas } = adaptadorCon(b);
    const buzon: BuzonActivo = { ...conexion, idConjunto, diasIniciales: 7, marcarLeido: true };
    expect(await adaptador.ejecutarSincronizacion(db.pool, buzon)).toEqual({
      revisados: 1, nuevos: 1, duplicados: 0, respaldos: 0, pendientes: false,
    });
    expect(pedidas).toEqual([{ marcarLeido: true }]);
    expect(b.leidos.size).toBe(1);
    expect(await leerCheckpoint(db.pool, `${idConjunto}:buzon@demo.mailflow.test/INBOX`)).toEqual({ uidValidity: 1, ultimoUid: 1 });
    expect(await leerCheckpoint(db.pool, 'buzon@demo.mailflow.test/INBOX')).toBeNull();
    const [fila] = await db.q<{ idConjunto: number }>("SELECT idConjunto FROM CORREOS WHERE messageId = '<adap-1@x>'");
    expect(fila!.idConjunto).toBe(idConjunto);
  });

  it('ejecutarSincronizacion: un TypeError a mitad de ciclo se propaga tal cual; un ECONNRESET sí es CONEXION', async () => {
    const buzon: BuzonActivo = { ...conexion, idConjunto, diasIniciales: 7, marcarLeido: false };
    const error = new TypeError('bug del ciclo');
    const reset = () => Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    const b = new BuzonFalso();
    const fuente = b.fuente();
    const conBug = crearAdaptadorBuzon({
      maxPorCiclo: 50, maxIntentos: 3, ahora: () => AHORA,
      crearFuente: () => ({ ...fuente, uidsDesde: async () => { throw error; }, uidsMayoresQue: async () => { throw error; } }),
    });
    const e = await conBug.ejecutarSincronizacion(db.pool, buzon).catch((x: unknown) => x);
    expect(e).toBe(error);
    expect(e).not.toBeInstanceOf(ErrorConexionBuzon);

    const conRed = crearAdaptadorBuzon({
      maxPorCiclo: 50, maxIntentos: 3, ahora: () => AHORA,
      crearFuente: () => ({ ...fuente, uidsDesde: async () => { throw reset(); }, uidsMayoresQue: async () => { throw reset(); } }),
    });
    await expect(conRed.ejecutarSincronizacion(db.pool, buzon)).rejects.toMatchObject({ name: 'ErrorConexionBuzon', codigo: 'CONEXION' });
  });

  it('los mensajes de log de la sincronización llevan el conjunto y nunca la dirección del buzón', async () => {
    const b = new BuzonFalso();
    const id = b.agregar(mensajeCrudo({ id: '<adap-log@x>' }), new Date(AHORA.getTime() - 86_400_000));
    b.rechazados.add(id);
    const lineas: string[] = [];
    const adaptador = crearAdaptadorBuzon({
      maxPorCiclo: 50, maxIntentos: 2, ahora: () => AHORA, log: (m) => lineas.push(m), crearFuente: () => b.fuente(),
    });
    const buzon: BuzonActivo = { ...conexion, usuario: 'otro-log@demo.mailflow.test', idConjunto, diasIniciales: 7, marcarLeido: false };
    for (let i = 0; i < 2; i++) await expect(adaptador.ejecutarSincronizacion(db.pool, buzon)).rejects.toThrow(); // el correo falla
    await adaptador.ejecutarSincronizacion(db.pool, buzon); // agotados los intentos: se registra sin contenido y se loguea
    expect(lineas.length).toBeGreaterThan(0);
    for (const l of lineas) {
      expect(l.startsWith(`Conjunto ${idConjunto}: `)).toBe(true);
      expect(l).not.toContain('@');
    }
  });

  it('ejecutarSincronizacion traduce los fallos de conexión a ErrorConexionBuzon', async () => {
    for (const [codigo, err] of Object.entries(errores)) {
      const b = new BuzonFalso();
      b.falloAlAbrir = err;
      const { adaptador } = adaptadorCon(b);
      const buzon: BuzonActivo = { ...conexion, idConjunto, diasIniciales: 7, marcarLeido: false };
      await expect(adaptador.ejecutarSincronizacion(db.pool, buzon)).rejects.toMatchObject({ name: 'ErrorConexionBuzon', codigo });
    }
  });
});
