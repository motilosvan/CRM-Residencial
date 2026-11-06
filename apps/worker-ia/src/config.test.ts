import { describe, expect, it } from 'vitest';
import { cargarConfigIA } from './config.js';

describe('Worker IA · cargarConfigIA', () => {
  it('por defecto la IA está apagada y no exige llave', () => {
    expect(cargarConfigIA({})).toMatchObject({ proveedor: 'ninguno', apiKey: '' });
  });

  it('con OpenRouter exige la llave y aplica los valores por defecto', () => {
    expect(() => cargarConfigIA({ IA_PROVEEDOR: 'openrouter' })).toThrow(/OPENROUTER_API_KEY/);
    expect(() => cargarConfigIA({ IA_PROVEEDOR: 'openrouter', OPENROUTER_API_KEY: '' })).toThrow(/OPENROUTER_API_KEY/);
    expect(cargarConfigIA({ IA_PROVEEDOR: 'openrouter', OPENROUTER_API_KEY: 'clave' })).toMatchObject({
      modelo: 'xingchen-agi/xing4.0-29b-a4b:free', intervaloS: 60, maxPorCiclo: 5, pausaEntreLlamadasMs: 10_000, maxIntentos: 3, timeoutMs: 60_000,
    });
  });

  it('rechaza un proveedor desconocido y nunca muestra el valor de la llave', () => {
    try {
      cargarConfigIA({ IA_PROVEEDOR: 'otro', OPENROUTER_API_KEY: 'secreto-xyz' });
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(/IA_PROVEEDOR/);
      expect((e as Error).message).not.toContain('secreto-xyz');
    }
  });
});
