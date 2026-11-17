import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ErrorApi, type CatalogosDominio, type CatalogosService } from '@/services/contratos';
import { crearCatalogosMock } from '@/services/mock/catalogosMock';
import type { Conjunto, Sesion } from '@/types/conjunto';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };

let catalogosReal: CatalogosService;
const obtenerCatalogos = vi.fn((s?: AbortSignal) => catalogosReal.obtener(s));

vi.mock('@/services', () => ({
  conjuntosService: { listar: vi.fn().mockResolvedValue([]) },
  authService: { sesion: vi.fn().mockResolvedValue(null), salir: vi.fn().mockResolvedValue(undefined) },
  resumenService: { obtener: vi.fn().mockResolvedValue({ porEstado: [], carga: [], respuesta: [] }) },
  buzonService: { estado: vi.fn(), guardar: vi.fn(), desconectar: vi.fn(), sincronizar: vi.fn() },
  correosService: { listar: vi.fn(), detalle: vi.fn() },
  usuariosService: { listar: vi.fn().mockResolvedValue([]), agregar: vi.fn(), actualizar: vi.fn() },
  solicitudesService: {
    listar: vi.fn().mockResolvedValue([]),
    detalle: vi.fn(),
    asignar: vi.fn(),
    cambiarEstado: vi.fn(),
    reclasificar: vi.fn(),
    aceptarSugerencia: vi.fn(),
  },
  residentesService: { listar: vi.fn().mockResolvedValue([]), crear: vi.fn(), actualizar: vi.fn(), vincularCorreo: vi.fn() },
  validacionService: { obtener: vi.fn() },
  identidadService: { obtener: vi.fn(), actualizar: vi.fn() },
  catalogosService: { obtener: (s?: AbortSignal) => obtenerCatalogos(s) },
}));

import { useSesion } from '@/store/sesion';
import CatalogosPage from './CatalogosPage';

const conjunto: Conjunto = { id: 'cj-parques', slug: 'parque-central-occidente', nombre: 'Parque Central' };

function ponerSesionAdmin() {
  const sesion: Sesion = {
    usuario: { id: 'us-admin', nombre: 'Ana Admin', correo: 'admin@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: conjunto,
    conjuntos: [conjunto],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now() });
}

function montar() {
  const router = createMemoryRouter([{ path: '/app/:conjunto/catalogos', element: <CatalogosPage /> }], {
    initialEntries: ['/app/parque-central-occidente/catalogos'],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { qc };
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(() => {
  catalogosReal = crearCatalogosMock(SIN_LATENCIA);
  obtenerCatalogos.mockReset();
  obtenerCatalogos.mockImplementation((s?: AbortSignal) => catalogosReal.obtener(s));
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  ponerSesionAdmin();
});

afterEach(() => {
  cleanup();
});

describe('CatalogosPage', () => {
  it('muestra EsqueletoCarga mientras carga y EstadoError con Reintentar cuando falla', async () => {
    obtenerCatalogos.mockImplementationOnce(() => new Promise(() => {}));
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

    cleanup();
    obtenerCatalogos.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const user = userEvent.setup();
    montar();

    const alerta = await screen.findByRole('alert');
    await user.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByRole('heading', { name: /catálogos del dominio/i })).toBeInTheDocument();
    expect(obtenerCatalogos).toHaveBeenCalledTimes(3);
  });

  it('muestra las 5 categorías oficiales con prioridad base y palabras clave reales del motor de reglas', async () => {
    montar();

    const seccionCat = await screen.findByRole('region', { name: /categorías oficiales/i });
    expect(within(seccionCat).getByText('Seguridad')).toBeInTheDocument();
    expect(within(seccionCat).getByText('Mantenimiento')).toBeInTheDocument();
    expect(within(seccionCat).getByText('Facturación')).toBeInTheDocument();
    expect(within(seccionCat).getByText('Administrativo')).toBeInTheDocument();
    expect(within(seccionCat).getByText('Sin clasificar')).toBeInTheDocument();

    expect(within(seccionCat).getByText('robo')).toBeInTheDocument();
    expect(within(seccionCat).getByText('gotera')).toBeInTheDocument();
    expect(within(seccionCat).getByText('paz y salvo')).toBeInTheDocument();
    expect(within(seccionCat).getByText('asamblea')).toBeInTheDocument();
    expect(within(seccionCat).getByText(/0 palabras clave/i)).toBeInTheDocument();
  });

  it('filtra categorías y palabras clave con el buscador local y muestra EmptyState si no hay coincidencias', async () => {
    const user = userEvent.setup();
    montar();

    const buscador = await screen.findByLabelText(/buscar categorías o palabras clave/i);
    await user.type(buscador, 'gotera');

    const seccionCat = screen.getByRole('region', { name: /categorías oficiales/i });
    expect(within(seccionCat).getByText('Mantenimiento')).toBeInTheDocument();
    expect(within(seccionCat).getByText('gotera')).toBeInTheDocument();
    expect(within(seccionCat).queryByText('Facturación')).not.toBeInTheDocument();
    expect(within(seccionCat).queryByText('Seguridad')).not.toBeInTheDocument();

    // Búsqueda sin coincidencias -> EmptyState con botón limpiar
    await user.clear(buscador);
    await user.type(buscador, 'palabrainexistente123');
    expect(await within(seccionCat).findByText(/no encontramos coincidencias/i)).toBeInTheDocument();

    await user.click(within(seccionCat).getByRole('button', { name: /limpiar búsqueda/i }));
    expect(within(seccionCat).getByText('Seguridad')).toBeInTheDocument();
    expect(within(seccionCat).getByText('Facturación')).toBeInTheDocument();
  });

  it('muestra prioridades con SLA/peso, señales de urgencia y reglas reales sin umbral de confianza ficticio', async () => {
    montar();

    const seccionPrio = await screen.findByRole('region', { name: /prioridades.*sla/i });
    const tabla = within(seccionPrio).getByRole('table');
    expect(within(tabla).getByText('Alta')).toBeInTheDocument();
    expect(within(tabla).getByText('4 h')).toBeInTheDocument();
    expect(within(tabla).getByText('3')).toBeInTheDocument();
    expect(within(tabla).getByText('Media')).toBeInTheDocument();
    expect(within(tabla).getByText('24 h')).toBeInTheDocument();
    expect(within(tabla).getByText('2')).toBeInTheDocument();
    expect(within(tabla).getByText('Baja')).toBeInTheDocument();
    expect(within(tabla).getByText('72 h')).toBeInTheDocument();
    expect(within(tabla).getByText('1')).toBeInTheDocument();

    expect(within(seccionPrio).getByText('fuga de gas')).toBeInTheDocument();
    expect(within(seccionPrio).getByText('urgente')).toBeInTheDocument();
    expect(within(seccionPrio).getByText(/elevan.*alta/i)).toBeInTheDocument();
    expect(within(seccionPrio).getByText(/seguridad.*nunca.*baja/i)).toBeInTheDocument();

    // Garantiza ausencia de umbral de confianza ficticio
    expect(document.body.textContent).not.toMatch(/umbral de confianza/i);
  });

  it('muestra ciclo de vida (CERRADA final) y las 6 transiciones aclarando NUEVA → ASIGNADA (T2)', async () => {
    montar();

    const seccionCiclo = await screen.findByRole('region', { name: /ciclo de vida/i });
    const listaEstados = within(seccionCiclo).getByRole('list', { name: /estados del ciclo de vida/i });
    expect(within(listaEstados).getByText('Nueva')).toBeInTheDocument();
    expect(within(listaEstados).getByText('Asignada')).toBeInTheDocument();
    expect(within(listaEstados).getByText('En proceso')).toBeInTheDocument();
    expect(within(listaEstados).getByText('Resuelta')).toBeInTheDocument();
    expect(within(listaEstados).getByText('Cerrada')).toBeInTheDocument();
    expect(within(listaEstados).getByText(/estado final/i)).toBeInTheDocument();

    // 6 transiciones
    const listaTransiciones = within(seccionCiclo).getByRole('list', { name: /transiciones permitidas/i });
    expect(within(listaTransiciones).getAllByRole('listitem')).toHaveLength(6);
    expect(within(listaTransiciones).getByText(/únicamente al asignar un responsable/i)).toBeInTheDocument();
  });

  it('muestra EmptyState cuando los catálogos llegan vacíos', async () => {
    const vacio: CatalogosDominio = {
      categorias: [],
      prioridades: [],
      palabrasClaveUrgencia: [],
      estados: [],
      transiciones: [],
    };
    obtenerCatalogos.mockResolvedValueOnce(vacio);
    montar();

    expect(await screen.findByText(/no hay catálogos disponibles/i)).toBeInTheDocument();
  });

  it('en móvil 375px renderiza prioridades como tarjetas apiladas y controles con max-sm:h-10', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const anchoOriginal = window.innerWidth;
    window.innerWidth = 375;
    onTestFinished(() => {
      window.innerWidth = anchoOriginal;
    });

    montar();

    const buscador = await screen.findByLabelText(/buscar categorías o palabras clave/i);
    expect(buscador).toHaveClass('max-sm:h-10');

    const seccionPrio = screen.getByRole('region', { name: /prioridades.*sla/i });
    expect(within(seccionPrio).queryByRole('table')).not.toBeInTheDocument();
    expect(within(seccionPrio).getByText('4 h')).toBeInTheDocument();
    expect(within(seccionPrio).getByText('24 h')).toBeInTheDocument();
    expect(within(seccionPrio).getByText('72 h')).toBeInTheDocument();
  });
});
