import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearConjuntosHttp } from './conjuntosHttp';
import { respuesta, simularFetch } from './ayudas.test-util';

afterEach(() => vi.unstubAllGlobals());

describe('conjuntosHttp', () => {
  it('GET /api/conjuntos devuelve la lista (paleta y logo opcionales)', async () => {
    const lista = [
      { id: '1', slug: 'a', nombre: 'A', paleta: { primario: '#355E3B', acento: '#D6A64F' } },
      { id: '2', slug: 'b', nombre: 'B', logoUrl: 'https://x.test/l.png' },
    ];
    const f = simularFetch(async () => respuesta(200, lista));
    const ctl = new AbortController();
    expect(await crearConjuntosHttp().listar(ctl.signal)).toEqual(lista);
    expect(f.mock.calls[0][0]).toBe('/api/conjuntos');
    expect(f.mock.calls[0][1]?.signal).toBe(ctl.signal);
  });

  it('forma inesperada o 500 → RED', async () => {
    simularFetch(async () => respuesta(200, [{ id: 1 }]));
    await expect(crearConjuntosHttp().listar()).rejects.toMatchObject({ codigo: 'RED' });
    simularFetch(async () => respuesta(500, { error: 'x' }));
    await expect(crearConjuntosHttp().listar()).rejects.toMatchObject({ codigo: 'RED' });
  });
});
