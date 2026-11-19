import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ErrorApi, ErrorAuth } from '../contratos';
import { construirConsulta, pedir, pedirApi, pedirApiSinCuerpo, pedirApiTexto, pedirOpcional } from './cliente';
import { respuesta, simularFetch } from './ayudas.test-util';

const esquema = z.object({ ok: z.boolean() });

afterEach(() => vi.unstubAllGlobals());

async function fallo(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('Debía rechazar');
}

describe('pedir', () => {
  it('GET a /api + ruta con cookie del mismo origen', async () => {
    const f = simularFetch(async () => respuesta(200, { ok: true }));
    expect(await pedir('/x', esquema)).toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith('/api/x', expect.objectContaining({ credentials: 'same-origin' }));
    expect(f.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
  });

  it('POST con cuerpo JSON y signal', async () => {
    const f = simularFetch(async () => respuesta(200, { ok: true }));
    const ctl = new AbortController();
    await pedir('/y', esquema, { metodo: 'POST', cuerpo: { a: 1 }, signal: ctl.signal });
    const init = f.mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.signal).toBe(ctl.signal);
  });

  it('fetch que rechaza → RED', async () => {
    simularFetch(async () => {
      throw new TypeError('fallo');
    });
    expect(await fallo(pedir('/x', esquema))).toMatchObject({ codigo: 'RED' });
  });

  it('AbortError se propaga', async () => {
    simularFetch(async () => {
      throw new DOMException('abortado', 'AbortError');
    });
    const e = await fallo(pedir('/x', esquema));
    expect(e).not.toBeInstanceOf(ErrorAuth);
    expect((e as Error).name).toBe('AbortError');
  });

  it('forma inesperada → RED', async () => {
    simularFetch(async () => respuesta(200, { otro: 1 }));
    expect(await fallo(pedir('/x', esquema))).toMatchObject({ codigo: 'RED' });
  });

  it('cuerpo no JSON → RED', async () => {
    simularFetch(async () => new Response('<html>', { status: 200 }));
    expect(await fallo(pedir('/x', esquema))).toMatchObject({ codigo: 'RED' });
  });

  it('error con código conocido → ErrorAuth con detalle', async () => {
    simularFetch(async () =>
      respuesta(429, { error: 'x', codigo: 'BLOQUEADO', desbloqueoEn: 123, intentosRestantes: 0 }),
    );
    const e = (await fallo(pedir('/x', esquema))) as ErrorAuth;
    expect(e).toBeInstanceOf(ErrorAuth);
    expect(e.codigo).toBe('BLOQUEADO');
    expect(e.desbloqueoEn).toBe(123);
    expect(e.intentosRestantes).toBe(0);
  });

  it('error con código desconocido o sin código → RED', async () => {
    simularFetch(async () => respuesta(401, { error: 'x', codigo: 'NO_AUTENTICADO' }));
    expect(await fallo(pedir('/x', esquema))).toMatchObject({ codigo: 'RED' });
    simularFetch(async () => respuesta(500, { error: 'x' }));
    expect(await fallo(pedir('/x', esquema))).toMatchObject({ codigo: 'RED' });
  });
});

describe('pedirOpcional', () => {
  it('devuelve null ante 401', async () => {
    simularFetch(async () => respuesta(401, { error: 'x', codigo: 'NO_AUTENTICADO' }));
    expect(await pedirOpcional('/x', esquema)).toBeNull();
  });
  it('devuelve el cuerpo ante 200 y falla ante otros errores', async () => {
    simularFetch(async () => respuesta(200, { ok: true }));
    expect(await pedirOpcional('/x', esquema)).toEqual({ ok: true });
    simularFetch(async () => respuesta(500, { error: 'x' }));
    expect(await fallo(pedirOpcional('/x', esquema))).toMatchObject({ codigo: 'RED' });
  });
});

describe('construirConsulta', () => {
  it('objeto → query, omitiendo undefined y cadenas vacías', () => {
    expect(construirConsulta({ a: 1, b: 'x y', c: undefined, d: '', e: false })).toBe('?a=1&b=x+y&e=false');
  });
  it('sin parámetros útiles → cadena vacía', () => {
    expect(construirConsulta()).toBe('');
    expect(construirConsulta({ a: undefined, b: '' })).toBe('');
  });
});

describe('pedirApi', () => {
  it('GET con query string y cookie', async () => {
    const f = simularFetch(async () => respuesta(200, { ok: true }));
    expect(await pedirApi('/x', esquema, { consulta: { pagina: 2, q: '' } })).toEqual({ ok: true });
    expect(f).toHaveBeenCalledWith('/api/x?pagina=2', expect.objectContaining({ credentials: 'same-origin' }));
  });

  for (const metodo of ['PUT', 'PATCH', 'POST'] as const) {
    it(`${metodo} con cuerpo JSON`, async () => {
      const f = simularFetch(async () => respuesta(200, { ok: true }));
      await pedirApi('/y', esquema, { metodo, cuerpo: { a: 1 } });
      const init = f.mock.calls[0][1]!;
      expect(init.method).toBe(metodo);
      expect(init.body).toBe(JSON.stringify({ a: 1 }));
      expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    });
  }

  const casos: Array<[number, string]> = [
    [401, 'NO_AUTENTICADO'],
    [403, 'PROHIBIDO'],
    [404, 'NO_ENCONTRADO'],
    [409, 'CONFLICTO'],
    [422, 'INVALIDO'],
    [429, 'LIMITE'],
    [500, 'SERVIDOR'],
    [503, 'SERVIDOR'],
  ];
  for (const [estado, tipo] of casos) {
    it(`${estado} → ErrorApi ${tipo} con el mensaje de la API`, async () => {
      simularFetch(async () => respuesta(estado, { error: 'Texto de la API' }));
      const e = (await fallo(pedirApi('/x', esquema))) as ErrorApi;
      expect(e).toBeInstanceOf(ErrorApi);
      expect(e.estado).toBe(estado);
      expect(e.tipo).toBe(tipo);
      expect(e.mensaje).toBe('Texto de la API');
    });
  }

  it('error sin cuerpo JSON → mensaje genérico en español', async () => {
    simularFetch(async () => new Response('<html>', { status: 502 }));
    const e = (await fallo(pedirApi('/x', esquema))) as ErrorApi;
    expect(e.tipo).toBe('SERVIDOR');
    expect(e.mensaje).toMatch(/inténtalo/i);
  });

  it('fetch que rechaza → RED', async () => {
    simularFetch(async () => {
      throw new TypeError('fallo');
    });
    const e = (await fallo(pedirApi('/x', esquema))) as ErrorApi;
    expect(e).toBeInstanceOf(ErrorApi);
    expect(e.tipo).toBe('RED');
    expect(e.estado).toBe(0);
  });

  it('forma inesperada o cuerpo no JSON → RED', async () => {
    simularFetch(async () => respuesta(200, { otro: 1 }));
    expect(await fallo(pedirApi('/x', esquema))).toMatchObject({ tipo: 'RED' });
    simularFetch(async () => new Response('<html>', { status: 200 }));
    expect(await fallo(pedirApi('/x', esquema))).toMatchObject({ tipo: 'RED' });
  });

  it('AbortError se propaga sin convertirse', async () => {
    simularFetch(async () => {
      throw new DOMException('abortado', 'AbortError');
    });
    const e = await fallo(pedirApi('/x', esquema));
    expect(e).not.toBeInstanceOf(ErrorApi);
    expect((e as Error).name).toBe('AbortError');
  });
});

describe('pedirApiSinCuerpo y pedirApiTexto', () => {
  it('sin cuerpo: acepta 204 y lanza ErrorApi ante error', async () => {
    simularFetch(async () => new Response(null, { status: 204 }));
    await expect(pedirApiSinCuerpo('/x', { metodo: 'PATCH', cuerpo: {} })).resolves.toBeUndefined();
    simularFetch(async () => respuesta(409, { error: 'Otra persona lo cambió' }));
    expect(await fallo(pedirApiSinCuerpo('/x', { metodo: 'PUT' }))).toMatchObject({ tipo: 'CONFLICTO' });
  });

  it('texto: devuelve el CSV tal cual y lanza ErrorApi ante error', async () => {
    simularFetch(async () => new Response('a,b\n1,2\n', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
    expect(await pedirApiTexto('/reportes', { consulta: { formato: 'csv' } })).toBe('a,b\n1,2\n');
    simularFetch(async () => respuesta(403, { error: 'Sin permiso' }));
    expect(await fallo(pedirApiTexto('/reportes'))).toMatchObject({ tipo: 'PROHIBIDO' });
  });
});
