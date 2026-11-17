import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conjunto, Rol, Sesion } from '@/types/conjunto';

const conjunto: Conjunto = { id: 'a', slug: 'uno', nombre: 'Torres de Uno' };

vi.mock('@/services', () => ({
  conjuntosService: { listar: () => Promise.resolve([{ id: 'a', slug: 'uno', nombre: 'Torres de Uno' }]) },
  authService: { sesion: () => Promise.resolve(null), salir: () => Promise.resolve(undefined) },
  resumenService: { obtener: () => Promise.resolve({ porEstado: [], carga: [], respuesta: [] }) },
  buzonService: {
    estado: () => Promise.resolve({ cuentas: [], totalCorreos: 0, ultimoCorreo: null, conectado: false, buzon: null }),
    guardar: vi.fn(),
    desconectar: vi.fn(),
    sincronizar: vi.fn(),
  },
  correosService: { listar: () => Promise.resolve({ total: 0, correos: [] }), detalle: vi.fn() },
  solicitudesService: {
    listar: () => Promise.resolve([]),
    detalle: vi.fn(),
    asignar: vi.fn(),
    cambiarEstado: vi.fn(),
    reclasificar: vi.fn(),
    aceptarSugerencia: vi.fn(),
  },
  usuariosService: {
    listar: () => Promise.resolve([]),
    agregar: vi.fn(),
    actualizar: vi.fn(),
  },
}));

import { rutas } from '@/router';
import { useSesion } from '@/store/sesion';
import GuardaRol from './GuardaRol';

function ponerSesion(rol: Rol) {
  const sesion: Sesion = {
    usuario: { id: '1', nombre: 'Persona', correo: 'p@demo.mailflow.test', rol },
    conjuntoActivo: conjunto,
    conjuntos: [conjunto],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now() });
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GuardaRol', () => {
  it('renderiza el contenido cuando el rol está permitido', () => {
    ponerSesion('ADMIN');
    const router = createMemoryRouter(
      [{ path: '/', element: <GuardaRol roles={['ADMIN']}><div>Solo admin</div></GuardaRol> }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Solo admin')).toBeInTheDocument();
  });

  it('muestra Pagina403 cuando el rol no está permitido', () => {
    ponerSesion('SOPORTE');
    const router = createMemoryRouter(
      [{ path: '/', element: <GuardaRol roles={['ADMIN']}><div>Solo admin</div></GuardaRol> }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.queryByText('Solo admin')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/app/uno/inicio');
  });

  it('SOPORTE entrando por URL a /app/:conjunto/usuarios ve 403 y ADMIN ve Usuarios', async () => {
    ponerSesion('SOPORTE');
    const qc1 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const r1 = createMemoryRouter(rutas, { initialEntries: ['/app/uno/usuarios'] });
    render(
      <QueryClientProvider client={qc1}>
        <RouterProvider router={r1} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();

    cleanup();

    ponerSesion('ADMIN');
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const r2 = createMemoryRouter(rutas, { initialEntries: ['/app/uno/usuarios'] });
    render(
      <QueryClientProvider client={qc2}>
        <RouterProvider router={r2} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('button', { name: /agregar usuario/i })).toBeInTheDocument();
  });
});
