import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ErrorAuth } from '../contratos';
import { pedir, pedirOpcional } from './cliente';
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
