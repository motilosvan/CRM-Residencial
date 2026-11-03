import { describe, expect, it } from 'vitest';
import { cargarConfig } from './config.js';

const base = { IMAP_USER: 'Admin@Gmail.com', IMAP_APP_PASSWORD: 'abcd efgh ijkl mnop' };

describe('Gateway · cargarConfig', () => {
  it('aplica valores por defecto, quita espacios a la contraseña de aplicación y arma la cuenta usuario/buzón', () => {
    const c = cargarConfig(base);
    expect(c).toMatchObject({
      host: 'imap.gmail.com', port: 993, usuario: 'admin@gmail.com', contrasena: 'abcdefghijklmnop',
      buzon: 'INBOX', cuenta: 'admin@gmail.com/INBOX', intervaloS: 45, diasIniciales: 7,
      maxPorCiclo: 50, maxIntentos: 3, marcarLeido: false,
    });
  });

  it('una variable vacía (IMAP_USER= en .env) cuenta como faltante y el error la nombra', () => {
    expect(() => cargarConfig({ ...base, IMAP_USER: '' })).toThrow(/IMAP_USER/);
    expect(() => cargarConfig({ IMAP_USER: 'a@b.co' })).toThrow(/IMAP_APP_PASSWORD/);
    expect(cargarConfig({ ...base, IMAP_HOST: '' }).host).toBe('imap.gmail.com');
  });

  it('el mensaje de error nunca incluye el valor de la contraseña', () => {
    try {
      cargarConfig({ ...base, IMAP_APP_PASSWORD: 'secreto-xyz', IMAP_PORT: 'no-numero' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/IMAP_PORT/);
      expect((e as Error).message).not.toContain('secreto-xyz');
    }
  });

  it('valida rangos y booleanos', () => {
    expect(() => cargarConfig({ ...base, IMAP_INTERVALO_S: '1' })).toThrow(/IMAP_INTERVALO_S/);
    expect(() => cargarConfig({ ...base, IMAP_MARCAR_LEIDO: 'si' })).toThrow(/IMAP_MARCAR_LEIDO/);
    expect(cargarConfig({ ...base, IMAP_MARCAR_LEIDO: 'true' }).marcarLeido).toBe(true);
  });
});
