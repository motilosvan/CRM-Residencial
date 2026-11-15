import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conjunto, Sesion } from '@/types/conjunto';
import { ErrorAuth } from '@/services/contratos';
import { PALETA_MAILFLOW, PALETA_PARQUES, type Paleta } from '@/tema/paletas';
import { CONJUNTOS_DEMO } from '@/services/mock/datos';

const listar = vi.fn();
const cambiarConjuntoSrv = vi.fn();
const salirSrv = vi.fn();
vi.mock('@/services', () => ({
  conjuntosService: { listar: (s?: AbortSignal) => listar(s) },
  authService: {
    cambiarConjunto: (id: string) => cambiarConjuntoSrv(id),
    salir: () => salirSrv(),
    sesion: () => Promise.resolve(null),
  },
}));
const aplicarTema = vi.fn();
vi.mock('@/tema/aplicarTema', () => ({ aplicarTema: (...a: unknown[]) => aplicarTema(...a) }));

import { rutas } from '@/router';
import { usePreferencias } from '@/store/preferencias';
import { useSesion } from '@/store/sesion';

const paletaPropio: Paleta = PALETA_PARQUES;
const paletaOtro: Paleta = PALETA_MAILFLOW;
const paletaAjeno: Paleta = CONJUNTOS_DEMO[2].paleta!;
const propio: Conjunto = { id: 'a', slug: 'propio', nombre: 'Propio Uno', paleta: paletaPropio };
const otro: Conjunto = { id: 'b', slug: 'otro', nombre: 'Otro Dos', paleta: paletaOtro };
const ajeno: Conjunto = { id: 'c', slug: 'ajeno', nombre: 'Ajeno Tres', paleta: paletaAjeno };

/** Argumentos de la última llamada a aplicarTema. */
function ultimaLlamada(): unknown[] | undefined {
  return aplicarTema.mock.calls.at(-1);
}

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
  return { router, qc };
}

beforeEach(() => {
  listar.mockReset();
  aplicarTema.mockReset();
  listar.mockResolvedValue([propio, otro, ajeno]);
  cambiarConjuntoSrv.mockReset();
  salirSrv.mockReset();
  salirSrv.mockResolvedValue(undefined);
  // Por defecto el servidor acepta el cambio y devuelve la sesión con ese conjunto activo.
  cambiarConjuntoSrv.mockImplementation(async (id: string) => {
    const actual = useSesion.getState().sesion!;
    const destino = actual.conjuntos.find((c) => c.id === id)!;
    return { ...actual, conjuntoActivo: destino };
  });
  useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: null, ultimaActividad: null, errorCambio: null, generacion: 0 });
  usePreferencias.setState({ ultimoConjuntoSlug: null });
});

describe('GuardaConjunto', () => {
  it('sin sesión redirige a /login', async () => {
    const { router: r } = montar('/app/propio/inicio');
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(r.state.location.search).toBe('');
  });

  it('sin sesión por inactividad redirige a /login?motivo=inactividad', async () => {
    useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: 'inactividad' });
    const { router: r } = montar('/app/propio/inicio');
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(r.state.location.search).toBe('?motivo=inactividad');
  });

  it('mientras el estado es cargando muestra el esqueleto y no redirige a /login', async () => {
    useSesion.setState({ estado: 'cargando' });
    const { router: r } = montar('/app/propio/inicio');
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    await new Promise((res) => setTimeout(res, 20));
    expect(r.state.location.pathname).toBe('/app/propio/inicio');
    // Al terminar de rehidratar sin sesión, sí redirige.
    act(() => useSesion.setState({ estado: 'lista' }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
  });

  it('al terminar de rehidratar con sesión muestra el panel', async () => {
    useSesion.setState({ estado: 'cargando' });
    montar('/app/propio/inicio');
    act(() => useSesion.setState({ sesion: sesionDe(propio, [propio]), estado: 'lista' }));
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('cambio de conjunto rechazado con SIN_MEMBRESIA muestra la página 403', async () => {
    cambiarConjuntoSrv.mockRejectedValue(new ErrorAuth('SIN_MEMBRESIA'));
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    montar('/app/otro/inicio');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();
    expect(useSesion.getState().sesion?.conjuntoActivo.slug).toBe('propio');
  });

  it('cambio de conjunto rechazado por red muestra Reintentar (no 403) y reintenta', async () => {
    cambiarConjuntoSrv.mockRejectedValueOnce(new ErrorAuth('RED'));
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    montar('/app/otro/inicio');
    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    expect(screen.queryByRole('heading', { name: /sin acceso/i })).not.toBeInTheDocument();
    await userEvent.click(boton);
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(useSesion.getState().sesion?.conjuntoActivo.slug).toBe('otro');
    expect(cambiarConjuntoSrv).toHaveBeenCalledTimes(2);
  });

  it('un error de cambio de otro slug no muestra 403 para este', async () => {
    useSesion.setState({
      sesion: sesionDe(propio, [propio, otro]),
      errorCambio: { slug: 'ajeno-previo', codigo: 'SIN_MEMBRESIA' },
    });
    cambiarConjuntoSrv.mockImplementation(() => new Promise(() => {}));
    montar('/app/otro/inicio');
    await new Promise((res) => setTimeout(res, 20));
    expect(screen.queryByRole('heading', { name: /sin acceso/i })).not.toBeInTheDocument();
  });

  it('slug inexistente muestra 404 en sitio', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    const { router: r } = montar('/app/fantasma/inicio');
    expect(await screen.findByRole('heading', { name: /no encontrada/i })).toBeInTheDocument();
    expect(r.state.location.pathname).toBe('/app/fantasma/inicio');
  });

  it('slug ajeno muestra 403 en sitio', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    const { router: r } = montar('/app/ajeno/inicio');
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

  it('con datos en caché, un refetch fallido no reemplaza el panel', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio]) });
    const { qc } = montar('/app/propio/inicio');
    await screen.findByRole('heading', { name: 'Inicio' });
    listar.mockRejectedValue(new Error('red'));
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['conjuntos'] });
      // TanStack Query notifica a los observadores en un macrotask.
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(qc.getQueryState(['conjuntos'])?.status).toBe('error');
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});

describe('GuardaConjunto: preselección del conjunto', () => {
  it('entrar por A, cambiar a B y cerrar sesión: el login preselecciona B', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    const { router: r } = montar('/app/propio/inicio');
    await screen.findByRole('heading', { name: 'Inicio' });
    expect(usePreferencias.getState().ultimoConjuntoSlug).toBe('propio');
    await act(async () => {
      await r.navigate('/app/otro/inicio');
    });
    await waitFor(() => expect(useSesion.getState().sesion?.conjuntoActivo.slug).toBe('otro'));
    await waitFor(() => expect(usePreferencias.getState().ultimoConjuntoSlug).toBe('otro'));
    act(() => useSesion.getState().cerrar('manual'));
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('combobox', { name: /conjunto/i })).toHaveTextContent('Otro Dos');
  });
});

describe('GuardaConjunto: tema', () => {
  it('al entrar a un conjunto propio aplica su paleta', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    montar('/app/propio/inicio');
    await screen.findByRole('heading', { name: 'Inicio' });
    expect(ultimaLlamada()).toEqual([paletaPropio]);
  });

  it('al cambiar de conjunto por URL aplica la paleta del nuevo', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    montar('/app/otro/inicio');
    await waitFor(() => expect(ultimaLlamada()).toEqual([paletaOtro]));
  });

  it('en el 403 nunca aplica la paleta del conjunto ajeno', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio, otro]) });
    montar('/app/ajeno/inicio');
    await screen.findByRole('heading', { name: /sin acceso/i });
    expect(aplicarTema.mock.calls.some((a) => a[0] === paletaAjeno)).toBe(false);
  });

  it('al salir de /app la última llamada es sin paleta', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio]) });
    const { router: r } = montar('/app/propio/inicio');
    await screen.findByRole('heading', { name: 'Inicio' });
    await r.navigate('/');
    await waitFor(() => expect(ultimaLlamada()).toEqual([]));
  });

  it('el cierre por inactividad dentro de /app lleva a /login?motivo=inactividad y a MailFlow', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio]) });
    const { router: r } = montar('/app/propio/inicio');
    await screen.findByRole('heading', { name: 'Inicio' });
    act(() => useSesion.getState().cerrar('inactividad'));
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(r.state.location.search).toBe('?motivo=inactividad');
    expect(ultimaLlamada()).toEqual([]);
  });

  it('el cierre manual dentro de /app lleva a /login sin query', async () => {
    useSesion.setState({ sesion: sesionDe(propio, [propio]) });
    const { router: r } = montar('/app/propio/inicio');
    await screen.findByRole('heading', { name: 'Inicio' });
    act(() => useSesion.getState().cerrar('manual'));
    await waitFor(() => expect(r.state.location.pathname).toBe('/login'));
    expect(r.state.location.search).toBe('');
    expect(ultimaLlamada()).toEqual([]);
  });
});
