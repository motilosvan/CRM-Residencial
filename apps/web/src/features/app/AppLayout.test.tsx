import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conjunto, Rol, Sesion } from '@/types/conjunto';

const listar = vi.fn();
vi.mock('@/services', () => ({ conjuntosService: { listar: (s?: AbortSignal) => listar(s) } }));

const seguir = vi.fn();
const inactividad = { avisoVisible: false, segundosRestantes: 42, seguir };
vi.mock('@/hooks/useInactividad', () => ({ useInactividad: () => inactividad }));

import { rutas } from '@/router';
import { useSesion } from '@/store/sesion';
import { ENTRADAS } from './navegacion';
import PantallaPreparando from './PantallaPreparando';

const uno: Conjunto = { id: 'a', slug: 'uno', nombre: 'Torres de Uno', paleta: { primario: '#355E3B', acento: '#D6A64F' } };
const dos: Conjunto = { id: 'b', slug: 'dos', nombre: 'Altos Dos' };

function sesionDe(rol: Rol, activo: Conjunto, conjuntos: Conjunto[]): Sesion {
  return {
    usuario: { id: 'u', nombre: 'Ana Pérez', correo: 'ana@demo.mailflow.test', rol },
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
  listar.mockResolvedValue([uno, dos]);
  seguir.mockReset();
  inactividad.avisoVisible = false;
  useSesion.setState({ sesion: null, motivoCierre: null });
  // useIsMobile (shadcn) lee matchMedia; jsdom no lo trae.
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SOLO_ADMIN = ['Validación', 'Residentes', 'Usuarios', 'Catálogos', 'Identidad', 'Reportes', 'Auditoría'];

describe('navegacion', () => {
  it('las entradas solo-Administrador son las esperadas', () => {
    const etiquetas = ENTRADAS.filter((e) => e.soloAdmin).map((e) => e.etiqueta);
    expect(etiquetas.sort()).toEqual([...SOLO_ADMIN].sort());
  });
});

describe('AppLayout', () => {
  it('con rol SOPORTE no muestra las entradas solo-Administrador', async () => {
    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/inicio');
    const nav = await screen.findByRole('navigation', { name: 'Secciones del panel' });
    for (const etiqueta of SOLO_ADMIN) {
      expect(within(nav).queryByRole('link', { name: etiqueta })).not.toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Bandeja' })).toBeInTheDocument();
  });

  it('con rol ADMIN muestra todas las entradas', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    const nav = await screen.findByRole('navigation', { name: 'Secciones del panel' });
    for (const etiqueta of SOLO_ADMIN) {
      expect(within(nav).getByRole('link', { name: etiqueta })).toBeInTheDocument();
    }
  });

  it('el sidebar muestra el nombre del conjunto y «Impulsado por MailFlow»', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    await screen.findByRole('navigation', { name: 'Secciones del panel' });
    expect(screen.getAllByText('Torres de Uno').length).toBeGreaterThan(0);
    expect(screen.getByText('Impulsado por MailFlow')).toBeInTheDocument();
  });

  it('un conjunto sin logo muestra sus iniciales', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', dos, [dos]) });
    montar('/app/dos/inicio');
    await screen.findByRole('navigation', { name: 'Secciones del panel' });
    expect(screen.getAllByText('AD').length).toBeGreaterThan(0);
  });

  it('el selector de conjunto no aparece con un solo conjunto', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    await screen.findByRole('navigation', { name: 'Secciones del panel' });
    expect(screen.queryByRole('button', { name: /cambiar de conjunto/i })).not.toBeInTheDocument();
  });

  it('con 2+ conjuntos el selector aparece y al elegir otro navega a su inicio', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno, dos]) });
    const router = montar('/app/uno/inicio');
    await userEvent.click(await screen.findByRole('button', { name: /cambiar de conjunto/i }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /Altos Dos/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/app/dos/inicio'));
  });

  it('«Cerrar sesión» lleva a /login', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    const router = montar('/app/uno/inicio');
    await userEvent.click(await screen.findByRole('button', { name: /menú de usuario/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });

  it('el diálogo de inactividad aparece con avisoVisible y «Seguir conectado» llama seguir()', async () => {
    inactividad.avisoVisible = true;
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/42/)).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Seguir conectado' }));
    expect(seguir).toHaveBeenCalledTimes(1);
  });

  it('sin aviso no hay diálogo de inactividad', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    await screen.findByRole('navigation', { name: 'Secciones del panel' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('muestra la pantalla de preparación al entrar y luego el panel', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    expect(await screen.findByText('Preparando tu espacio de Torres de Uno…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });

  it('las secciones próximas muestran el estado vacío con su título', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/residentes');
    expect(await screen.findByRole('heading', { name: 'Residentes' })).toBeInTheDocument();
    expect(screen.getByText(/próximamente/i)).toBeInTheDocument();
  });
});

describe('PantallaPreparando', () => {
  it('muestra el nombre del conjunto', () => {
    render(<PantallaPreparando conjunto={uno} />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparando tu espacio de Torres de Uno…');
  });

  it('con movimiento reducido no lleva clases de animación', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { container } = render(<PantallaPreparando conjunto={uno} />);
    expect(container.querySelector('[class*="mf-halo"], .animate-pulse')).toBeNull();
  });

  it('con movimiento permitido anima el halo', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { container } = render(<PantallaPreparando conjunto={uno} />);
    expect(container.querySelector('[class*="mf-halo"]')).not.toBeNull();
  });
});
