import { describe, expect, it } from 'vitest';
import { cargarConfig } from './config.js';

const SECRETO = 'secreto-de-pruebas-con-más-de-32-caracteres';
const base = { AUTH_SECRETO: SECRETO };

describe('Gateway · cargarConfig', () => {
  it('aplica valores por defecto y toma el secreto con el que se descifran los buzones', () => {
    expect(cargarConfig(base)).toEqual({ secreto: SECRETO, intervaloS: 45, maxPorCiclo: 50, maxIntentos: 3 });
  });

  it('ya no exige credenciales IMAP en el entorno: los buzones viven en la BD', () => {
    expect(() => cargarConfig(base)).not.toThrow();
    const c = cargarConfig({ ...base, IMAP_USER: 'viejo@demo.mailflow.test', IMAP_APP_PASSWORD: 'x' }) as unknown as Record<string, unknown>;
    expect(Object.keys(c).sort()).toEqual(['intervaloS', 'maxIntentos', 'maxPorCiclo', 'secreto']);
  });

  it('AUTH_SECRETO es obligatorio (≥ 32); una variable vacía cuenta como faltante y el error la nombra sin su valor', () => {
    expect(() => cargarConfig({})).toThrow(/AUTH_SECRETO/);
    expect(() => cargarConfig({ AUTH_SECRETO: '' })).toThrow(/AUTH_SECRETO/);
    try {
      cargarConfig({ AUTH_SECRETO: 'corto-xyz' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/AUTH_SECRETO/);
      expect((e as Error).message).not.toContain('corto-xyz');
    }
  });

  it('valida rangos y el error nunca incluye el secreto', () => {
    expect(() => cargarConfig({ ...base, IMAP_INTERVALO_S: '1' })).toThrow(/IMAP_INTERVALO_S/);
    expect(() => cargarConfig({ ...base, IMAP_MAX_INTENTOS: '0' })).toThrow(/IMAP_MAX_INTENTOS/);
    try {
      cargarConfig({ ...base, IMAP_MAX_POR_CICLO: 'no-numero' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/IMAP_MAX_POR_CICLO/);
      expect((e as Error).message).not.toContain(SECRETO);
    }
    expect(cargarConfig({ ...base, IMAP_INTERVALO_S: '60', IMAP_MAX_POR_CICLO: '10', IMAP_MAX_INTENTOS: '5' })).toMatchObject({
      intervaloS: 60, maxPorCiclo: 10, maxIntentos: 5,
    });
  });
});
