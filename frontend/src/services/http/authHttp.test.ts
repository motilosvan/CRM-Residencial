import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearAuthHttp } from './authHttp';
import { respuesta, simularFetch } from './ayudas.test-util';

afterEach(() => vi.unstubAllGlobals());

const conjunto = { id: '1', slug: 'a', nombre: 'A' };
const sesion = {
  usuario: { id: '7', nombre: 'Demo', correo: 'a@demo.mailflow.test', rol: 'ADMIN' },
  conjuntoActivo: conjunto,
  conjuntos: [conjunto],
  ultimaActividad: 1_000,
};
const p = { conjuntoId: '1', correo: 'a@demo.mailflow.test' };

function cuerpoDe(f: ReturnType<typeof simularFetch>) {
  return JSON.parse(String(f.mock.calls[0][1]?.body));
}

describe('authHttp', () => {
  it('solicitarCodigo: POST /api/auth/codigo', async () => {
    const f = simularFetch(async () => respuesta(200, { venceEn: 5, reenvioDisponibleEn: 3 }));
    expect(await crearAuthHttp().solicitarCodigo(p)).toEqual({ venceEn: 5, reenvioDisponibleEn: 3 });
    expect(f.mock.calls[0][0]).toBe('/api/auth/codigo');
    expect(f.mock.calls[0][1]?.method).toBe('POST');
    expect(cuerpoDe(f)).toEqual(p);
  });

  it('solicitarCodigo: 429 REENVIO_PRONTO y BLOQUEADO con desbloqueoEn', async () => {
    simularFetch(async () => respuesta(429, { error: 'x', codigo: 'REENVIO_PRONTO' }));
    await expect(crearAuthHttp().solicitarCodigo(p)).rejects.toMatchObject({ codigo: 'REENVIO_PRONTO' });
    simularFetch(async () => respuesta(429, { error: 'x', codigo: 'BLOQUEADO', desbloqueoEn: 99 }));
    await expect(crearAuthHttp().solicitarCodigo(p)).rejects.toMatchObject({ codigo: 'BLOQUEADO', desbloqueoEn: 99 });
  });

  it('verificarCodigo: POST /api/auth/verificar devuelve la sesión', async () => {
    const f = simularFetch(async () => respuesta(200, sesion));
    expect(await crearAuthHttp().verificarCodigo({ ...p, codigo: '123456' })).toEqual(sesion);
    expect(f.mock.calls[0][0]).toBe('/api/auth/verificar');
    expect(cuerpoDe(f)).toEqual({ ...p, codigo: '123456' });
  });

  it('verificarCodigo: 400 con intentosRestantes, 410 y 429', async () => {
    simularFetch(async () => respuesta(400, { error: 'x', codigo: 'CODIGO_INCORRECTO', intentosRestantes: 3 }));
    await expect(crearAuthHttp().verificarCodigo({ ...p, codigo: '1' })).rejects.toMatchObject({
      codigo: 'CODIGO_INCORRECTO',
      intentosRestantes: 3,
    });
    simularFetch(async () => respuesta(410, { error: 'x', codigo: 'CODIGO_VENCIDO' }));
    await expect(crearAuthHttp().verificarCodigo({ ...p, codigo: '1' })).rejects.toMatchObject({
      codigo: 'CODIGO_VENCIDO',
    });
    simularFetch(async () => respuesta(429, { error: 'x', codigo: 'BLOQUEADO', desbloqueoEn: 42 }));
    await expect(crearAuthHttp().verificarCodigo({ ...p, codigo: '1' })).rejects.toMatchObject({
      codigo: 'BLOQUEADO',
      desbloqueoEn: 42,
    });
  });

  it('fetch que rechaza → RED', async () => {
    simularFetch(async () => {
      throw new TypeError('red');
    });
    await expect(crearAuthHttp().solicitarCodigo(p)).rejects.toMatchObject({ codigo: 'RED' });
  });

  it('sesion: GET /api/auth/sesion; null ante 401', async () => {
    const f = simularFetch(async () => respuesta(200, sesion));
    expect(await crearAuthHttp().sesion()).toEqual(sesion);
    expect(f.mock.calls[0][0]).toBe('/api/auth/sesion');
    simularFetch(async () => respuesta(401, { error: 'x', codigo: 'SESION_INACTIVA' }));
    expect(await crearAuthHttp().sesion()).toBeNull();
  });

  it('sesion: error de red → RED; JSON inesperado → RED', async () => {
    simularFetch(async () => {
      throw new TypeError('red');
    });
    await expect(crearAuthHttp().sesion()).rejects.toMatchObject({ codigo: 'RED' });
    simularFetch(async () => respuesta(200, { hola: 1 }));
    await expect(crearAuthHttp().sesion()).rejects.toMatchObject({ codigo: 'RED' });
  });

  it('cambiarConjunto: POST /api/auth/conjunto', async () => {
    const f = simularFetch(async () => respuesta(200, sesion));
    expect(await crearAuthHttp().cambiarConjunto('1')).toEqual(sesion);
    expect(f.mock.calls[0][0]).toBe('/api/auth/conjunto');
    expect(cuerpoDe(f)).toEqual({ conjuntoId: '1' });
  });

  it('cambiarConjunto: 403 SIN_MEMBRESIA; 401 y 422 → RED', async () => {
    simularFetch(async () => respuesta(403, { error: 'x', codigo: 'SIN_MEMBRESIA' }));
    await expect(crearAuthHttp().cambiarConjunto('9')).rejects.toMatchObject({ codigo: 'SIN_MEMBRESIA' });
    simularFetch(async () => respuesta(401, { error: 'x', codigo: 'NO_AUTENTICADO' }));
    await expect(crearAuthHttp().cambiarConjunto('9')).rejects.toMatchObject({ codigo: 'RED' });
    simularFetch(async () => respuesta(422, { error: 'x' }));
    await expect(crearAuthHttp().cambiarConjunto('9')).rejects.toMatchObject({ codigo: 'RED' });
  });

  it('salir: POST /api/auth/salir y nunca lanza', async () => {
    const f = simularFetch(async () => respuesta(200, { ok: true }));
    await expect(crearAuthHttp().salir()).resolves.toBeUndefined();
    expect(f.mock.calls[0][0]).toBe('/api/auth/salir');
    expect(f.mock.calls[0][1]?.method).toBe('POST');
    simularFetch(async () => {
      throw new TypeError('red');
    });
    await expect(crearAuthHttp().salir()).resolves.toBeUndefined();
    simularFetch(async () => respuesta(500, { error: 'x' }));
    await expect(crearAuthHttp().salir()).resolves.toBeUndefined();
  });
});
