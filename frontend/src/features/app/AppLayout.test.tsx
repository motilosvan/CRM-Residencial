import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Conjunto, Rol, Sesion } from '@/types/conjunto';

const listar = vi.fn();
const salir = vi.fn();
vi.mock('@/services', () => ({
  conjuntosService: { listar: (s?: AbortSignal) => listar(s) },
  authService: { salir: () => salir(), sesion: () => Promise.resolve(null) },
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
  usuariosService: { listar: () => Promise.resolve([]), agregar: vi.fn(), actualizar: vi.fn() },
  residentesService: { listar: () => Promise.resolve([]), crear: vi.fn(), actualizar: vi.fn(), vincularCorreo: vi.fn() },
  validacionService: { obtener: () => Promise.resolve({ sugerencias: [], remitentesSinResidente: [] }) },
  identidadService: {
    obtener: () => Promise.resolve({ id: 'a', slug: 'uno', nombre: 'Torres de Uno', version: 1 }),
    actualizar: vi.fn(),
  },
  catalogosService: {
    obtener: () =>
      Promise.resolve({
        categorias: [],
        prioridades: [],
        palabrasClaveUrgencia: [],
        estados: [],
        transiciones: [],
      }),
  },
  reportesService: {
    obtener: () =>
      Promise.resolve({
        periodo: { desde: null, hasta: null },
        totales: { total: 0, abiertas: 0, resueltas: 0, cerradas: 0 },
        porEstado: [],
        porCategoria: [],
        porPrioridad: [],
        respuesta: [],
        global: { totalConRespuesta: 0, minutosPromedio: null, dentroSla: 0, porcentajeSla: null },
        carga: [],
      }),
    descargarCsv: vi.fn(),
  },
  auditoriaService: {
    listar: () => Promise.resolve({ total: 0, eventos: [] }),
  },
  laboratorioService: {
    probar: vi.fn(),
  },
}));

const seguir = vi.fn();
const inactividad = { avisoVisible: false, segundosRestantes: 42, seguir };
vi.mock('@/hooks/useInactividad', () => ({ useInactividad: () => inactividad }));

import { rutas } from '@/router';
import { Proveedores } from '@/proveedores';
import { PALETA_PARQUES } from '@/tema/paletas';
import { useSesion } from '@/store/sesion';
import { ENTRADAS } from './navegacion';
import PantallaPreparando from './PantallaPreparando';

const uno: Conjunto = { id: 'a', slug: 'uno', nombre: 'Torres de Uno', paleta: PALETA_PARQUES };
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
  salir.mockReset();
  salir.mockResolvedValue(undefined);
  inactividad.avisoVisible = false;
  useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: null, ultimaActividad: null });
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

describe('AppLayout · accesibilidad', () => {
  it('C3: hay un solo landmark main y el salto lleva a él', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    await screen.findByRole('navigation', { name: 'Secciones del panel' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.getElementById('contenido')).not.toBeNull();
  });

  it('C1: ningún texto accesible del panel queda en inglés', async () => {
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    await screen.findByRole('navigation', { name: 'Secciones del panel' });
    expect(document.body.textContent).not.toMatch(/toggle sidebar/i);
    expect(document.querySelector('[title="Toggle Sidebar"], [aria-label="Toggle Sidebar"]')).toBeNull();
  });

  it('C1: el panel móvil se anuncia en español', async () => {
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
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/inicio');
    const boton = await screen.findByRole('button', { name: /mostrar u ocultar el menú/i });
    await userEvent.click(boton);
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveAccessibleName(/menú/i);
    expect(dialogo.textContent).not.toMatch(/displays the mobile sidebar/i);
    expect(dialogo).not.toHaveAccessibleName('Sidebar');
  });

  it('C1: el aviso de notificaciones (Toaster) está en español', () => {
    render(<Proveedores><span /></Proveedores>);
    expect(document.querySelector('[aria-label^="Notifications"]')).toBeNull();
    expect(document.querySelector('[aria-label^="Notificaciones"]')).not.toBeNull();
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
    expect(salir).toHaveBeenCalledTimes(1);
  });

  it('«Cerrar sesión» cierra y navega aunque authService.salir falle por red', async () => {
    salir.mockRejectedValue(new Error('red'));
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    const router = montar('/app/uno/inicio');
    await userEvent.click(await screen.findByRole('button', { name: /menú de usuario/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(salir).toHaveBeenCalledTimes(1);
    expect(useSesion.getState().sesion).toBeNull();
    expect(screen.queryByText(/error|no se pudo/i)).not.toBeInTheDocument();
  });

  it('«Cerrar sesión» del diálogo de inactividad llama authService.salir aunque falle', async () => {
    salir.mockRejectedValue(new Error('red'));
    inactividad.avisoVisible = true;
    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    const router = montar('/app/uno/inicio');
    const dialogo = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(salir).toHaveBeenCalledTimes(1);
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

  it('con rol SOPORTE reportes y auditoria muestran 403, con ADMIN cargan y laboratorio-ia carga para SOPORTE', async () => {
    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/reportes');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/auditoria');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/laboratorio-ia');
    expect(await screen.findByText(/ejecución en memoria sin escritura/i)).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/reportes');
    expect(await screen.findByRole('heading', { name: 'Reportes', level: 2 })).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/auditoria');
    expect(await screen.findByRole('heading', { name: /auditoría global/i })).toBeInTheDocument();
  });

  it('con rol SOPORTE identidad y catalogos muestran 403 y con ADMIN cargan sus páginas', async () => {
    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/identidad');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/identidad');
    expect(await screen.findByRole('heading', { name: /identidad del conjunto/i })).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/catalogos');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/catalogos');
    expect(await screen.findByRole('heading', { name: /catálogos del dominio/i })).toBeInTheDocument();
  });

  it('con rol SOPORTE validacion y residentes muestran 403 y con ADMIN cargan sus páginas', async () => {
    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/validacion');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/validacion');
    expect(await screen.findByRole('heading', { name: /cola de validación/i })).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/residentes');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/residentes');
    expect(await screen.findByRole('heading', { name: /directorio de residentes/i })).toBeInTheDocument();
  });

  it('con rol SOPORTE la ruta usuarios muestra 403 y con ADMIN muestra UsuariosPage', async () => {
    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/usuarios');
    expect(await screen.findByRole('heading', { name: /sin acceso/i })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/usuarios');
    expect(await screen.findByRole('heading', { name: /personal del conjunto/i })).toBeInTheDocument();
  });

  it('la ruta bandeja conecta BandejaPage para SOPORTE y ADMIN', async () => {
    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/bandeja');
    expect(await screen.findByRole('heading', { name: /bandeja de correos/i })).toBeInTheDocument();
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/bandeja');
    expect(await screen.findByRole('heading', { name: /bandeja de correos/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /conectar buzón de gmail/i })).toBeInTheDocument();
  });

  it('la ruta solicitudes conecta SolicitudesPage para SOPORTE y ADMIN', async () => {
    useSesion.setState({ sesion: sesionDe('SOPORTE', uno, [uno]) });
    montar('/app/uno/solicitudes');
    expect(await screen.findByRole('heading', { name: /solicitudes del conjunto/i })).toBeInTheDocument();
    expect(screen.queryByText(/próximamente/i)).not.toBeInTheDocument();

    cleanup();

    useSesion.setState({ sesion: sesionDe('ADMIN', uno, [uno]) });
    montar('/app/uno/solicitudes');
    expect(await screen.findByRole('heading', { name: /solicitudes del conjunto/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /responsable/i })).toBeInTheDocument();
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
