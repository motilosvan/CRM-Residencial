import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conjunto, Sesion } from '@/types/conjunto';
import { PALETA_MAILFLOW } from '@/tema/paletas';

const listar = vi.fn();
vi.mock('@/services', () => ({ conjuntosService: { listar: (s?: AbortSignal) => listar(s) } }));
const aplicarTema = vi.fn();
vi.mock('@/tema/aplicarTema', () => ({ aplicarTema: (...a: unknown[]) => aplicarTema(...a) }));

import { rutas } from '@/router';
import { useSesion } from '@/store/sesion';

const propio: Conjunto = { id: 'a', slug: 'propio', nombre: 'Propio Uno', paleta: PALETA_MAILFLOW };
const otro: Conjunto = { id: 'b', slug: 'otro', nombre: 'Otro Dos' };
const ajeno: Conjunto = { id: 'c', slug: 'ajeno', nombre: 'Ajeno Tres' };

function sesionDe(activo: Conjunto, conjuntos: Conjunto[]): Sesion {
  return {
    usuario: { id: 'u', nombre: 'Ana', correo: 'ana@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: activo,
    conjuntos,
    ultimaActividad: Date.now(),
  };
}

function montar(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  listar.mockReset();
  aplicarTema.mockReset();
  listar.mockResolvedValue([propio, otro, ajeno]);
  useSesion.setState({ sesion: null, motivoCierre: null });
});

describe('GuardaConjunto', () => {
  it('sin sesión redirige a /login', async () => {
    const r = montar('/app/propio/inicio');
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(r.state.location.search).toBe('');
  });

  it('sin sesión por inactividad redirige a /login?motivo=inactividad', async () => {
    useSesion.setState({ sesion: null, motivoCierre: 'inactividad' });
    const r = montar('/app/propio/inicio');
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(r.state.location.search).toBe('?motivo=inactividad');
  });

  it('slug inexistente muestra 404 en sitio', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    const r = montar('/app/fantasma/inicio');
    expect(await screen.findByRole('heading', { name: /no encontrada/i })).toBeInTheDocument();
    expect(r.state.location.pathname).toBe('/app/fantasma/inicio');
  });

  it('slug ajeno muestra 403 en sitio', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    const r = montar('/app/ajeno/inicio');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();
    expect(r.state.location.pathname).toBe('/app/ajeno/inicio');
  });

  it('slug propio distinto del activo cambia el conjunto activo', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    montar('/app/otro/inicio');
    await waitFor(() => expect(useSesion.getState().sesion?.conjuntoActivo.slug).toBe('otro'));
  });

  it('mientras carga muestra skeleton y no un 404', () => {
    listar.mockReturnValue(new Promise(() => {}));
    useSesion.setState({ sesion: sesionDe(propio, [propio]) });
    montar('/app/fantasma/inicio');
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /no encontrada/i })).not.toBeInTheDocument();
  });

  it('error de carga muestra Reintentar y reintenta', async () => {
    listar.mockRejectedValueOnce(new Error('x'));
    useSesion.setState({ sesion: sesionDe(propio, [propio]) });
    montar('/app/propio/inicio');
    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await userEvent.click(boton);
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('aplica la paleta del conjunto activo y vuelve a MailFlow al salir', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio]) });
    const r = montar('/app/propio/inicio');
    await screen.findByRole('heading', { name: 'Inicio' });
    expect(aplicarTema).toHaveBeenCalledWith(propio.paleta);
    aplicarTema.mockClear();
    await r.navigate('/');
    await waitFor(() => expect(aplicarTema).toHaveBeenCalledWith());
  });
});
