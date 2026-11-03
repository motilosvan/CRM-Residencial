import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigGateway } from './config.js';
import { ErrorDescarga, esRechazoDelMensaje, FuenteImap } from './fuente.js';

/**
 * Doble de imapflow (solo para estas pruebas; es el protocolo IMAP, nada transaccional). Registra cada
 * sesión para comprobar que ninguna queda abierta, y deja hacer fallar cada paso de `abrir()`.
 */
const imap = vi.hoisted(() => ({
  sesiones: [] as { logouts: number; closes: number; liberada: boolean }[],
  falloConnect: null as Error | null,
  falloLock: null as Error | null,
  falloLogout: null as Error | null,
  falloFetch: null as Error | null,
  sinBuzon: false,
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    mailbox: unknown = false;
    private readonly s = { logouts: 0, closes: 0, liberada: false };
    constructor() {
      imap.sesiones.push(this.s);
    }
    on() {
      return this;
    }
    async connect() {
      if (imap.falloConnect) throw imap.falloConnect;
    }
    async getMailboxLock() {
      if (imap.falloLock) throw imap.falloLock;
      if (!imap.sinBuzon) this.mailbox = { uidValidity: 7n, uidNext: 12 };
      return { release: () => void (this.s.liberada = true) };
    }
    async fetchOne(uid: string) {
      if (imap.falloFetch) throw imap.falloFetch;
      return { uid: Number(uid), source: Buffer.from('Subject: x\r\n\r\ny'), internalDate: '2026-10-01T10:00:00Z' };
    }
    async logout() {
      this.s.logouts++;
      if (imap.falloLogout) throw imap.falloLogout;
    }
    close() {
      this.s.closes++;
    }
  },
}));

const cfg: ConfigGateway = {
  host: 'imap.prueba', port: 993, usuario: 'buzon@gmail.com', contrasena: 'x', buzon: 'INBOX',
  cuenta: 'buzon@gmail.com/INBOX', intervaloS: 45, diasIniciales: 7, maxPorCiclo: 50, maxIntentos: 3, marcarLeido: false,
};

/** Una sesión quedó cerrada si se pidió LOGOUT (o, si este falló, se cortó el socket). */
const cerrada = (s: { logouts: number; closes: number }) => s.logouts + s.closes > 0;

beforeEach(() => {
  imap.sesiones.length = 0;
  imap.falloConnect = imap.falloLock = imap.falloLogout = imap.falloFetch = null;
  imap.sinBuzon = false;
});

describe('Gateway · FuenteImap abre y cierra la sesión', () => {
  it('ciclo normal: abre el buzón y al cerrar libera el candado y hace LOGOUT una sola vez', async () => {
    const f = new FuenteImap(cfg);
    expect(await f.abrir()).toEqual({ uidValidity: 7, uidNext: 12 });
    await f.cerrar();
    await f.cerrar(); // idempotente
    expect(imap.sesiones).toEqual([{ logouts: 1, closes: 0, liberada: true }]);
  });

  it('si la carpeta no se puede abrir (ya autenticado), abrir() cierra la sesión antes de fallar', async () => {
    imap.falloLock = Object.assign(new Error('Command failed'), { responseStatus: 'NO' });
    for (let ciclo = 0; ciclo < 3; ciclo++) {
      const f = new FuenteImap(cfg);
      await expect(f.abrir()).rejects.toThrow('Command failed');
      expect(imap.sesiones.at(-1)!.logouts).toBe(1); // abrir() ya la cerró por sí mismo
      await f.cerrar(); // lo que hace sincronizar() en su finally: no debe repetir el LOGOUT
    }
    expect(imap.sesiones).toHaveLength(3);
    expect(imap.sesiones.every((s) => s.logouts === 1)).toBe(true); // ninguna sesión se acumula
  });

  it('si el servidor no informa el buzón seleccionado, libera el candado y cierra', async () => {
    imap.sinBuzon = true;
    await expect(new FuenteImap(cfg).abrir()).rejects.toThrow(/No se pudo abrir el buzón/);
    expect(imap.sesiones).toEqual([{ logouts: 1, closes: 0, liberada: true }]);
  });

  it('si falla la conexión o el LOGOUT, el socket se cierra igual', async () => {
    imap.falloConnect = Object.assign(new Error('certificado'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' });
    imap.falloLogout = new Error('sin conexión');
    await expect(new FuenteImap(cfg).abrir()).rejects.toMatchObject({ code: 'SELF_SIGNED_CERT_IN_CHAIN' });
    expect(imap.sesiones).toHaveLength(1);
    expect(cerrada(imap.sesiones[0]!)).toBe(true);
    expect(imap.sesiones[0]!.closes).toBe(1);
  });
});

/** Error con la forma que deja imapflow cuando el servidor responde NO/BAD a un comando. */
const rechazo = (status: 'NO' | 'BAD', extra: object = {}) =>
  Object.assign(new Error('Command failed'), { responseStatus: status, ...extra });

describe('Gateway · descarga: rechazo del mensaje vs. problema de conexión', () => {
  it('esRechazoDelMensaje: NO/BAD del servidor sí; cortes, bloqueos pasajeros y throttling no', () => {
    expect(esRechazoDelMensaje(rechazo('NO', { responseText: 'Some messages could not be FETCHed (Failure)' }))).toBe(true);
    expect(esRechazoDelMensaje(rechazo('BAD'))).toBe(true);
    expect(esRechazoDelMensaje(rechazo('NO', { serverResponseCode: 'UNAVAILABLE' }))).toBe(false);
    expect(esRechazoDelMensaje(rechazo('NO', { responseText: '[UNAVAILABLE] Temporary System Error' }))).toBe(false);
    expect(esRechazoDelMensaje(rechazo('NO', { code: 'ETHROTTLE' }))).toBe(false);
    expect(esRechazoDelMensaje(Object.assign(new Error('x'), { code: 'NoConnection', responseStatus: 'BYE' }))).toBe(false);
    expect(esRechazoDelMensaje(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(false);
    expect(esRechazoDelMensaje(null)).toBe(false);
  });

  it('FuenteImap.descargar convierte el rechazo en ErrorDescarga y deja pasar los demás errores', async () => {
    const f = new FuenteImap(cfg);
    await f.abrir();
    expect(await f.descargar(5)).toMatchObject({ uid: 5, fechaInterna: new Date('2026-10-01T10:00:00Z') });

    imap.falloFetch = rechazo('NO');
    const err = await f.descargar(5).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorDescarga);
    expect(err).toMatchObject({ uid: 5, causa: imap.falloFetch });

    imap.falloFetch = Object.assign(new Error('Connection not available'), { code: 'NoConnection' });
    expect(await f.descargar(5).catch((e: unknown) => e)).toBe(imap.falloFetch);
    await f.cerrar();
  });
});
