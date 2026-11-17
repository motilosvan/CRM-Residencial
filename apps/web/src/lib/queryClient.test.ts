import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { ErrorApi, ErrorAuth } from '@/services/contratos';
import { useSesion } from '@/store/sesion';
import type { Sesion } from '@/types/conjunto';
import { crearQueryClient, debeReintentar } from './queryClient';

const c = { id: 'a', slug: 'a', nombre: 'A' };
const sesion: Sesion = {
  usuario: { id: 'u', nombre: 'U', correo: 'u@demo.mailflow.test', rol: 'ADMIN' },
  conjuntoActivo: c,
  conjuntos: [c],
  ultimaActividad: Date.now(),
};

describe('debeReintentar', () => {
  it('no reintenta 4xx', () => {
    for (const e of [401, 403, 404, 409, 422, 429]) expect(debeReintentar(0, new ErrorApi(e, 'x'))).toBe(false);
  });
  it('reintenta una vez red, 5xx y errores desconocidos', () => {
    for (const e of [new ErrorApi(0), new ErrorApi(500), new ErrorApi(503), new Error('x'), new ErrorAuth('RED')]) {
      expect(debeReintentar(0, e)).toBe(true);
      expect(debeReintentar(1, e)).toBe(false);
    }
  });
});

describe('401 en una consulta', () => {
  beforeEach(() => {
    useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: null });
  });

  it('cierra la sesión (con motivo de vencimiento) y vacía la caché', async () => {
    const qc = crearQueryClient();
    useSesion.getState().iniciar(sesion);
    qc.setQueryData(['conjunto', 'a', 'x'], { dato: 1 });
    const consulta = qc.fetchQuery({
      queryKey: ['conjunto', 'a', 'y'],
      queryFn: () => Promise.reject(new ErrorApi(401, 'Sesión no iniciada')),
      retry: false,
    });
    await expect(consulta).rejects.toBeInstanceOf(ErrorApi);
    await vi.waitFor(() => expect(useSesion.getState().sesion).toBeNull());
    expect(useSesion.getState().motivoCierre).toBe('inactividad');
    await vi.waitFor(() => expect(qc.getQueryData(['conjunto', 'a', 'x'])).toBeUndefined());
  });

  it('también ocurre en mutaciones', async () => {
    const qc = crearQueryClient();
    useSesion.getState().iniciar(sesion);
    await expect(
      qc.getMutationCache().build(qc, { mutationFn: () => Promise.reject(new ErrorApi(401)) }).execute(undefined),
    ).rejects.toBeInstanceOf(ErrorApi);
    await vi.waitFor(() => expect(useSesion.getState().sesion).toBeNull());
  });

  it('otros errores no tocan la sesión', async () => {
    const qc = crearQueryClient();
    useSesion.getState().iniciar(sesion);
    await expect(
      qc.fetchQuery({ queryKey: ['z'], queryFn: () => Promise.reject(new ErrorApi(403)), retry: false }),
    ).rejects.toBeInstanceOf(ErrorApi);
    expect(useSesion.getState().sesion).not.toBeNull();
  });

  it('sin sesión local no hace nada (evita bucles)', async () => {
    const qc = crearQueryClient();
    const cerrar = vi.spyOn(useSesion.getState(), 'cerrar');
    await expect(
      qc.fetchQuery({ queryKey: ['w'], queryFn: () => Promise.reject(new ErrorApi(401)), retry: false }),
    ).rejects.toBeInstanceOf(ErrorApi);
    expect(cerrar).not.toHaveBeenCalled();
    cerrar.mockRestore();
  });

  it('configura staleTime y reintentos por defecto', () => {
    const qc: QueryClient = crearQueryClient();
    const d = qc.getDefaultOptions();
    expect(d.queries?.staleTime).toBe(5 * 60_000);
    expect(d.queries?.retry).toBe(debeReintentar);
  });
});
