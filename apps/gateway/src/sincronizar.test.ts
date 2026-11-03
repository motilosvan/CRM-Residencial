import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { leerCheckpoint } from '../../api/src/modules/consultas.js';
import { ingestarCorreo, type CorreoEntrante } from '../../api/src/modules/ingesta.js';
import { setupTestDb, type TestDb } from '../../api/test/helpers/testDb.js';
import { BuzonFalso } from '../test/buzonFalso.js';
import { mensajeCrudo } from '../test/mensajes.js';
import { correoNoDescargable } from './parseo.js';
import { ErrorSincronizacion, Intentos, sincronizar, type OpcionesSincronizacion } from './sincronizar.js';

let db: TestDb;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_gw');
});
afterAll(async () => db.close());

const AHORA = new Date('2026-10-20T15:00:00Z');
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);
let nCuenta = 0;

/** Cada prueba usa su propia cuenta (checkpoint independiente) sobre la misma BD. */
const opciones = (extra: Partial<OpcionesSincronizacion> = {}): OpcionesSincronizacion => ({
  cuenta: `prueba${++nCuenta}@gmail.com/INBOX`,
  diasIniciales: 7,
  maxPorCiclo: 50,
  maxIntentos: 3,
  marcarLeido: false,
  ahora: () => AHORA,
  ...extra,
});

const correosCon = (prefijo: string) =>
  db.q<{ n: number }>(`SELECT COUNT(*) AS n FROM CORREOS WHERE messageId LIKE '${prefijo}%'`).then((r) => r[0]!.n);
const totales = () =>
  db.q<{ correos: number; solicitudes: number }>(
    'SELECT (SELECT COUNT(*) FROM CORREOS) AS correos, (SELECT COUNT(*) FROM SOLICITUDES) AS solicitudes',
  ).then((r) => r[0]!);
const categoriaDe = (messageId: string) =>
  db.q<{ categoria: string }>(
    `SELECT cat.nombre AS categoria FROM CORREOS c JOIN SOLICITUDES s ON s.idCorreo = c.idCorreo
       JOIN CATEGORIAS cat ON cat.idCategoria = s.idCategoria WHERE c.messageId = '${messageId}'`,
  ).then((r) => r[0]?.categoria);

/** Error con forma de mssql: RequestError = la BD respondió; ConnectionError = no se pudo llegar. */
const errorSql = (name: string, extra: object = {}) => Object.assign(new Error(name), { name, ...extra });

describe('Gateway · sincronizar', () => {
  it('primera lectura: solo la ventana de días; después, solo lo nuevo (checkpoint T6)', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t1-viejo@x>' }), haceDias(30));
    b.agregar(mensajeCrudo({ id: '<t1-a@x>' }), haceDias(2));
    b.agregar(mensajeCrudo({ id: '<t1-b@x>' }), haceDias(1));
    const o = opciones();

    expect(await sincronizar(db.pool, b.fuente(), o)).toEqual({ revisados: 2, nuevos: 2, duplicados: 0, respaldos: 0, pendientes: false });
    expect(await correosCon('<t1-viejo')).toBe(0);
    expect(await leerCheckpoint(db.pool, o.cuenta)).toEqual({ uidValidity: 1, ultimoUid: 3 });

    expect((await sincronizar(db.pool, b.fuente(), o)).revisados).toBe(0); // sin novedades

    b.agregar(mensajeCrudo({ id: '<t1-c@x>' }), AHORA);
    expect(await sincronizar(db.pool, b.fuente(), o)).toMatchObject({ revisados: 1, nuevos: 1 });
    expect(await leerCheckpoint(db.pool, o.cuenta)).toEqual({ uidValidity: 1, ultimoUid: 4 });
    expect(b.leidos.size).toBe(0); // marcarLeido=false: el buzón no se toca
    expect(b.cierres).toBe(b.aperturas); // cada ciclo cierra su conexión
  });

  it('si abrir() falla (p. ej. la carpeta no existe), la conexión se cierra igual: no se acumulan sesiones', async () => {
    const b = new BuzonFalso();
    b.falloAlAbrir = Object.assign(new Error('Command failed'), { responseStatus: 'NO' });
    const o = opciones();
    for (let i = 0; i < 3; i++) await expect(sincronizar(db.pool, b.fuente(), o)).rejects.toThrow('Command failed');
    expect(b.aperturas).toBe(3);
    expect(b.cierres).toBe(3);
    expect(await leerCheckpoint(db.pool, o.cuenta)).toBeNull();
  });

  it('reiniciar el worker 3 veces, incluso perdiendo el checkpoint ⇒ 0 duplicados (también sin Message-ID)', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t2-a@x>', asunto: 'Gotera en el techo' }), haceDias(1));
    b.agregar(mensajeCrudo({ id: null, asunto: 'Sin Message-ID', cuerpo: 'contenido único de t2' }), haceDias(1));
    const o = opciones();
    expect(await sincronizar(db.pool, b.fuente(), o)).toMatchObject({ nuevos: 2 });
    const antes = await totales();

    for (let i = 0; i < 3; i++) {
      // Proceso nuevo (contador de intentos vacío) y, en el peor caso, sin checkpoint: relee la ventana.
      await db.q(`DELETE FROM GATEWAY_CHECKPOINT WHERE cuenta = '${o.cuenta}'`);
      expect(await sincronizar(db.pool, b.fuente(), o, new Intentos())).toMatchObject({ revisados: 2, nuevos: 0, duplicados: 2 });
    }
    expect(await totales()).toEqual(antes);
    expect(await leerCheckpoint(db.pool, o.cuenta)).toEqual({ uidValidity: 1, ultimoUid: 2 });
  });

  it('UIDVALIDITY nuevo: relee la ventana sin duplicar y el checkpoint adopta la nueva validez', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t3-a@x>' }), haceDias(1));
    b.agregar(mensajeCrudo({ id: '<t3-b@x>' }), haceDias(1));
    const o = opciones();
    await sincronizar(db.pool, b.fuente(), o);

    b.renumerar(); // t3-a → UID 3, t3-b → UID 4
    const nuevo = b.agregar(mensajeCrudo({ id: '<t3-c@x>' }), AHORA);
    expect(await sincronizar(db.pool, b.fuente(), o)).toMatchObject({ revisados: 3, nuevos: 1, duplicados: 2 });
    expect(await correosCon('<t3-')).toBe(3);
    expect(await leerCheckpoint(db.pool, o.cuenta)).toEqual({ uidValidity: 2, ultimoUid: nuevo });
  });

  it('procesa por lotes de maxPorCiclo, en orden de UID, e informa si quedan pendientes', async () => {
    const b = new BuzonFalso();
    for (let i = 1; i <= 5; i++) b.agregar(mensajeCrudo({ id: `<t4-${i}@x>` }), haceDias(1));
    const o = opciones({ maxPorCiclo: 2 });

    expect(await sincronizar(db.pool, b.fuente(), o)).toMatchObject({ revisados: 2, pendientes: true });
    expect(await sincronizar(db.pool, b.fuente(), o)).toMatchObject({ revisados: 2, pendientes: true });
    expect(await sincronizar(db.pool, b.fuente(), o)).toMatchObject({ revisados: 1, pendientes: false });
    const orden = await db.q<{ imapUid: string }>(`SELECT imapUid FROM CORREOS WHERE messageId LIKE '<t4-%' ORDER BY idCorreo`);
    expect(orden.map((r) => Number(r.imapUid))).toEqual([1, 2, 3, 4, 5]);
  });

  it('un correo que falla detiene el ciclo sin avanzar; tras maxIntentos se guarda SIN_CLASIFICAR y sigue', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t5-a@x>' }), haceDias(1));
    b.agregar(mensajeCrudo({ id: '<t5-malo@x>', asunto: 'Robo en portería' }), haceDias(1));
    b.agregar(mensajeCrudo({ id: '<t5-c@x>' }), haceDias(1));
    const ingestar = async (pool: Parameters<typeof ingestarCorreo>[0], c: CorreoEntrante) => {
      if (c.messageId === '<t5-malo@x>' && !c.sinClasificar) throw errorSql('RequestError', { number: 50000 });
      return ingestarCorreo(pool, c);
    };
    const o = opciones({ maxIntentos: 2, marcarLeido: true, ingestar });
    const intentos = new Intentos();

    for (let fallo = 1; fallo <= 2; fallo++) {
      const err = await sincronizar(db.pool, b.fuente(), o, intentos).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ErrorSincronizacion);
      expect((err as ErrorSincronizacion).uid).toBe(2);
      expect(await correosCon('<t5-')).toBe(1); // el siguiente (t5-c) NO se procesó: el orden protege el checkpoint
      expect(await leerCheckpoint(db.pool, o.cuenta)).toEqual({ uidValidity: 1, ultimoUid: 1 });
      expect([...b.leidos]).toEqual([1]); // solo se marca leído lo que ya hizo COMMIT
    }

    expect(await sincronizar(db.pool, b.fuente(), o, intentos)).toMatchObject({ revisados: 2, nuevos: 1, respaldos: 1 });
    expect(await categoriaDe('<t5-malo@x>')).toBe('SIN_CLASIFICAR');
    expect(await correosCon('<t5-')).toBe(3);
    expect([...b.leidos].sort()).toEqual([1, 2, 3]);
  });

  it('un fallo de infraestructura (BD inalcanzable) no cuenta como intento: no degrada a SIN_CLASIFICAR', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t6-a@x>', asunto: 'Robo de bicicleta', cuerpo: 'Revisen las cámaras' }), haceDias(1));
    let caida = true;
    const ingestar = async (pool: Parameters<typeof ingestarCorreo>[0], c: CorreoEntrante) => {
      if (caida) throw errorSql('ConnectionError', { code: 'ESOCKET' });
      return ingestarCorreo(pool, c);
    };
    const o = opciones({ maxIntentos: 1, ingestar });
    const intentos = new Intentos();
    for (let i = 0; i < 3; i++) await expect(sincronizar(db.pool, b.fuente(), o, intentos)).rejects.toBeInstanceOf(ErrorSincronizacion);

    caida = false;
    expect(await sincronizar(db.pool, b.fuente(), o, intentos)).toMatchObject({ nuevos: 1, respaldos: 0 });
    expect(await categoriaDe('<t6-a@x>')).toBe('SEGURIDAD');
  });

  it('un correo que no se deja guardar ni SIN_CLASIFICAR se registra en versión mínima y el buzón sigue', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t8-a@x>' }), haceDias(1));
    const veneno = b.agregar(mensajeCrudo({ id: '<t8-veneno@x>', de: 'Ana <ana@mail.com>', asunto: 'Fuga en el baño' }), haceDias(1));
    b.agregar(mensajeCrudo({ id: '<t8-c@x>' }), haceDias(1));
    // Un dato que la BD rechaza siempre (p. ej. una fecha fuera de rango): pasarlo a SIN_CLASIFICAR no lo arregla.
    const ingestar = async (pool: Parameters<typeof ingestarCorreo>[0], c: CorreoEntrante) => {
      if (c.messageId === '<t8-veneno@x>' && c.recibidoEn) throw errorSql('RequestError', { number: 242 });
      return ingestarCorreo(pool, c);
    };
    const o = opciones({ maxIntentos: 2, ingestar });
    const intentos = new Intentos();

    // 2 intentos normales + 1 SIN_CLASIFICAR con todos los datos: fallan y el ciclo no pasa del correo.
    for (let i = 0; i < 3; i++) {
      const err = await sincronizar(db.pool, b.fuente(), o, intentos).catch((e: unknown) => e);
      expect((err as ErrorSincronizacion).uid).toBe(veneno);
      expect(await correosCon('<t8-')).toBe(1);
    }

    expect(await sincronizar(db.pool, b.fuente(), o, intentos)).toMatchObject({ revisados: 2, nuevos: 1, respaldos: 1 });
    expect(await correosCon('<t8-')).toBe(3);
    expect(await leerCheckpoint(db.pool, o.cuenta)).toEqual({ uidValidity: 1, ultimoUid: 3 });
    const [g] = await db.q<{ remitente: string; asunto: string; cuerpo: string }>(
      `SELECT remitente, asunto, cuerpo FROM CORREOS WHERE messageId = '<t8-veneno@x>'`,
    );
    expect(g).toMatchObject({ remitente: 'desconocido@invalid', asunto: `(correo no guardado) UID ${veneno}` });
    // Los datos originales y la causa quedan como texto para que un humano lo encuentre en el buzón.
    for (const texto of [`UID ${veneno}`, 'ana@mail.com', 'Fuga en el baño', 'RequestError 242']) expect(g!.cuerpo).toContain(texto);
    expect(await categoriaDe('<t8-veneno@x>')).toBe('SIN_CLASIFICAR');
  });

  it('un mensaje que el servidor se niega a entregar se registra sin contenido tras maxIntentos y el buzón sigue', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t9-a@x>' }), haceDias(1));
    const roto = b.agregar(mensajeCrudo({ id: '<t9-roto@x>' }), haceDias(1));
    b.agregar(mensajeCrudo({ id: '<t9-c@x>' }), haceDias(1));
    b.rechazados.add(roto);
    const o = opciones({ maxIntentos: 2 });
    const intentos = new Intentos();

    for (let i = 0; i < 2; i++) {
      const err = await sincronizar(db.pool, b.fuente(), o, intentos).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ErrorSincronizacion);
      expect((err as ErrorSincronizacion).uid).toBe(roto);
      expect(await correosCon('<t9-')).toBe(1);
    }

    expect(await sincronizar(db.pool, b.fuente(), o, intentos)).toMatchObject({ revisados: 2, nuevos: 1, respaldos: 1 });
    expect(await correosCon('<t9-')).toBe(2);
    expect(await leerCheckpoint(db.pool, o.cuenta)).toEqual({ uidValidity: 1, ultimoUid: 3 });
    const { messageId } = correoNoDescargable({ cuenta: o.cuenta, uidValidity: 1, uid: roto });
    const [g] = await db.q<{ asunto: string; cuerpo: string }>(`SELECT asunto, cuerpo FROM CORREOS WHERE messageId = '${messageId}'`);
    expect(g!.asunto).toBe(`(correo no descargable) UID ${roto}`);
    expect(g!.cuerpo).toContain(`UID ${roto}`);
    expect(g!.cuerpo).toContain('ErrorDescarga (Error IMAP NO)');
    expect(await categoriaDe(messageId)).toBe('SIN_CLASIFICAR');
  });

  it('un corte de conexión al descargar no cuenta como intento: al volver, el correo se guarda completo', async () => {
    const b = new BuzonFalso();
    const uid = b.agregar(mensajeCrudo({ id: '<t10-a@x>', asunto: 'Robo de bicicleta', cuerpo: 'Revisen las cámaras' }), haceDias(1));
    b.cortes.add(uid);
    const o = opciones({ maxIntentos: 1 });
    const intentos = new Intentos();
    for (let i = 0; i < 3; i++) await expect(sincronizar(db.pool, b.fuente(), o, intentos)).rejects.toMatchObject({ code: 'NoConnection' });
    expect(intentos.de(`1:${uid}`)).toBe(0);

    b.cortes.clear();
    expect(await sincronizar(db.pool, b.fuente(), o, intentos)).toMatchObject({ nuevos: 1, respaldos: 0 });
    expect(await categoriaDe('<t10-a@x>')).toBe('SEGURIDAD');
  });

  it('un MIME que no se puede interpretar se guarda igual como respaldo SIN_CLASIFICAR (regla 8)', async () => {
    const b = new BuzonFalso();
    b.agregar(mensajeCrudo({ id: '<t7-roto@x>', asunto: 'Robo' }), haceDias(0));
    const parsear = async () => {
      throw new Error('MIME ilegible');
    };
    expect(await sincronizar(db.pool, b.fuente(), opciones({ parsear }))).toMatchObject({ revisados: 1, respaldos: 1 });
    expect(await categoriaDe('<t7-roto@x>')).toBe('SIN_CLASIFICAR');
  });
});
