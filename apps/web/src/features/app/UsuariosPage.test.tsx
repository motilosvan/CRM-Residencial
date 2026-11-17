import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import { ErrorApi, type UsuarioConjunto, type UsuariosService } from '@/services/contratos';
import { crearUsuariosMock } from '@/services/mock/usuariosMock';
import type { Conjunto, Sesion } from '@/types/conjunto';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };
let usuariosReal: UsuariosService;
const listar = vi.fn((f?: Parameters<UsuariosService['listar']>[0], s?: AbortSignal) => usuariosReal.listar(f, s));
const agregar = vi.fn((e: Parameters<UsuariosService['agregar']>[0]) => usuariosReal.agregar(e));
const actualizar = vi.fn((id: number, c: Parameters<UsuariosService['actualizar']>[1]) => usuariosReal.actualizar(id, c));

vi.mock('@/services', () => ({
  conjuntosService: { listar: vi.fn().mockResolvedValue([]) },
  authService: { sesion: vi.fn().mockResolvedValue(null), salir: vi.fn().mockResolvedValue(undefined) },
  resumenService: { obtener: vi.fn() },
  buzonService: { estado: vi.fn() },
  usuariosService: {
    listar: (f?: Parameters<UsuariosService['listar']>[0], s?: AbortSignal) => listar(f, s),
    agregar: (e: Parameters<UsuariosService['agregar']>[0]) => agregar(e),
    actualizar: (id: number, c: Parameters<UsuariosService['actualizar']>[1]) => actualizar(id, c),
  },
}));

import { useSesion } from '@/store/sesion';
import UsuariosPage from './UsuariosPage';

const conjunto: Conjunto = { id: 'cj-1', slug: 'parques', nombre: 'Parque Central' };

const inicialesBase: UsuarioConjunto[] = [
  { id: 1, nombre: 'Ana Admin', correo: 'ana@demo.mailflow.test', rol: 'ADMIN', activo: true, version: 1, cuentaActiva: true },
  { id: 2, nombre: 'Camila Torres', correo: 'camila@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: true },
  { id: 3, nombre: 'Mateo Rojas', correo: 'mateo@demo.mailflow.test', rol: 'SOPORTE', activo: false, version: 2, cuentaActiva: true },
  { id: 4, nombre: 'Lucía Méndez', correo: 'lucia@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: false },
];

function ponerSesionAdmin() {
  const sesion: Sesion = {
    usuario: { id: '1', nombre: 'Ana Admin', correo: 'ana@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: conjunto,
    conjuntos: [conjunto],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now() });
}

function montar() {
  const router = createMemoryRouter([{ path: '/app/:conjunto/usuarios', element: <UsuariosPage /> }], {
    initialEntries: ['/app/parques/usuarios'],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster theme="light" containerAriaLabel="Notificaciones" />
    </QueryClientProvider>,
  );
  return { qc, user: userEvent.setup() };
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  usuariosReal = crearUsuariosMock({
    ...SIN_LATENCIA,
    iniciales: inicialesBase,
    cuentasDeshabilitadas: ['lucia@demo.mailflow.test', 'bloqueada@demo.mailflow.test'],
  });
  listar.mockClear();
  agregar.mockClear();
  actualizar.mockClear();
  ponerSesionAdmin();
});

afterEach(() => {
  cleanup();
});

describe('UsuariosPage · estados y listado', () => {
  it('muestra EsqueletoCarga mientras carga', () => {
    listar.mockImplementationOnce(() => new Promise(() => {}));
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  });

  it('muestra EstadoError cuando falla y reintenta al pulsar Reintentar', async () => {
    listar.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar();
    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(boton);
    expect(await screen.findByText('Camila Torres')).toBeInTheDocument();
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it('estado vacío cuando solo estás tú en el conjunto: invita a agregar', async () => {
    usuariosReal = crearUsuariosMock({
      ...SIN_LATENCIA,
      iniciales: [inicialesBase[0]],
    });
    montar();
    expect(await screen.findByText('Tú')).toBeInTheDocument();
    expect(screen.getByText(/solo estás tú/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /agregar usuario/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('camino feliz: lista nombre, correo, rol, estado, identifica «Tú» y conmutador «Mostrar inactivos»', async () => {
    const { user } = montar();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Ana Admin')).toBeInTheDocument();
    expect(screen.getByText('ana@demo.mailflow.test')).toBeInTheDocument();
    expect(screen.getByText('Tú')).toBeInTheDocument();
    expect(screen.getByText('Camila Torres')).toBeInTheDocument();
    expect(screen.queryByText('Mateo Rojas')).not.toBeInTheDocument();
    expect(screen.queryByText('Lucía Méndez')).not.toBeInTheDocument();

    const conmutador = screen.getByRole('switch', { name: /mostrar inactivos/i });
    await user.click(conmutador);

    expect(await screen.findByText('Mateo Rojas')).toBeInTheDocument();
    expect(screen.getByText('Lucía Méndez')).toBeInTheDocument();
    expect(listar).toHaveBeenLastCalledWith({ incluirInactivos: true }, expect.any(AbortSignal));

    // La etiqueta Activo/Inactivo de cada fila está enlazada con su Switch mediante htmlFor/id
    const switchCamila = screen.getByRole('switch', { name: /estado de camila torres/i });
    expect(switchCamila.id).toBeTruthy();
    const labelCamila = document.querySelector(`label[for="${CSS.escape(switchCamila.id)}"]`);
    expect(labelCamila).toHaveTextContent('Activo');

    const switchMateo = screen.getByRole('switch', { name: /estado de mateo rojas/i });
    expect(switchMateo.id).toBeTruthy();
    const labelMateo = document.querySelector(`label[for="${CSS.escape(switchMateo.id)}"]`);
    expect(labelMateo).toHaveTextContent('Inactivo');
  });

  it('en móvil (375px) usa tarjetas apiladas sin tabla', async () => {
    const anchoOriginal = window.innerWidth;
    const matchOriginal = window.matchMedia;
    window.innerWidth = 375;
    window.matchMedia = (q: string) =>
      ({
        matches: true,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as MediaQueryList;
    onTestFinished(() => {
      window.innerWidth = anchoOriginal;
      window.matchMedia = matchOriginal;
    });

    montar();
    expect(await screen.findByText('Camila Torres')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('fila con cuentaActiva: false muestra insignia «Cuenta deshabilitada» y controles deshabilitados con explicación accesible', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');
    await user.click(screen.getByRole('switch', { name: /mostrar inactivos/i }));

    expect(await screen.findByText('Lucía Méndez')).toBeInTheDocument();
    expect(screen.getByText('Cuenta deshabilitada')).toBeInTheDocument();

    const selectLucia = screen.getByRole('combobox', { name: /rol de lucía méndez/i });
    const switchLucia = screen.getByRole('switch', { name: /estado de lucía méndez/i });
    expect(selectLucia).toBeDisabled();
    expect(switchLucia).toBeDisabled();
    expect(selectLucia).toHaveAccessibleDescription(/deshabilitada en la plataforma/i);
    expect(switchLucia).toHaveAccessibleDescription(/deshabilitada en la plataforma/i);
  });
});

describe('UsuariosPage · Agregar usuario', () => {
  it('valida nombre y correo con Zod en español', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');
    await user.click(screen.getByRole('button', { name: /agregar usuario/i }));

    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: /guardar|agregar/i }));

    expect(await within(dialogo).findByText(/escribe el nombre/i)).toBeInTheDocument();
    expect(within(dialogo).getByText(/escribe el correo/i)).toBeInTheDocument();

    await user.type(within(dialogo).getByLabelText(/nombre/i), 'Carlos');
    await user.type(within(dialogo).getByLabelText(/correo/i), 'correo-invalido');
    await user.click(within(dialogo).getByRole('button', { name: /guardar|agregar/i }));
    expect(await within(dialogo).findByText(/correo válido/i)).toBeInTheDocument();
    expect(agregar).not.toHaveBeenCalled();
  });

  it('camino feliz: agrega usuario, cierra diálogo, actualiza lista y muestra toast', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');
    await user.click(screen.getByRole('button', { name: /agregar usuario/i }));

    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText(/nombre/i), 'Sofía Ramírez');
    await user.type(within(dialogo).getByLabelText(/correo/i), 'sofia@demo.mailflow.test');
    await user.click(within(dialogo).getByRole('button', { name: /guardar|agregar/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Sofía Ramírez')).toBeInTheDocument();
    expect(await screen.findByText(/usuario agregado/i)).toBeInTheDocument();
  });

  it('muestra 409 miembro activo y 422 cuenta deshabilitada dentro del diálogo sin cerrarlo', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');
    await user.click(screen.getByRole('button', { name: /agregar usuario/i }));

    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText(/nombre/i), 'Camila');
    await user.type(within(dialogo).getByLabelText(/correo/i), 'camila@demo.mailflow.test');
    await user.click(within(dialogo).getByRole('button', { name: /guardar|agregar/i }));

    expect(await within(dialogo).findByText('Ese usuario ya pertenece al conjunto')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.clear(within(dialogo).getByLabelText(/correo/i));
    await user.type(within(dialogo).getByLabelText(/correo/i), 'bloqueada@demo.mailflow.test');
    await user.click(within(dialogo).getByRole('button', { name: /guardar|agregar/i }));

    expect(
      await within(dialogo).findByText('Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('al cerrar el diálogo con Escape o Cancelar el foco vuelve al botón «Agregar usuario»', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');

    const botonAbrir = screen.getByRole('button', { name: /agregar usuario/i });
    await user.click(botonAbrir);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonAbrir).toHaveFocus();

    await user.click(botonAbrir);
    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonAbrir).toHaveFocus();
  });
});

describe('UsuariosPage · Edición de rol y estado', () => {
  it('promover SOPORTE → ADMIN actualiza directamente enviando versionEsperada', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');

    await user.click(screen.getByRole('combobox', { name: /rol de camila torres/i }));
    await user.click(await screen.findByRole('option', { name: 'Administrador' }));

    expect(actualizar).toHaveBeenCalledWith(2, { rol: 'ADMIN', versionEsperada: 1 });
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /rol de camila torres/i })).toHaveTextContent('Administrador'),
    );
  });

  it('quitar ADMIN pide confirmación AlertDialog; cancelar no llama API; confirmar sí actualiza', async () => {
    usuariosReal = crearUsuariosMock({
      ...SIN_LATENCIA,
      iniciales: [
        inicialesBase[0],
        { ...inicialesBase[1], rol: 'ADMIN', version: 3 },
      ],
    });
    const { user } = montar();
    await screen.findByText('Camila Torres');

    await user.click(screen.getByRole('combobox', { name: /rol de camila torres/i }));
    await user.click(await screen.findByRole('option', { name: 'Soporte' }));

    const alerta = await screen.findByRole('alertdialog');
    await user.click(within(alerta).getByRole('button', { name: /cancelar/i }));
    expect(actualizar).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: /rol de camila torres/i })).toHaveTextContent('Administrador');

    await user.click(screen.getByRole('combobox', { name: /rol de camila torres/i }));
    await user.click(await screen.findByRole('option', { name: 'Soporte' }));
    const alerta2 = await screen.findByRole('alertdialog');
    await user.click(within(alerta2).getByRole('button', { name: /confirmar/i }));

    expect(actualizar).toHaveBeenCalledWith(2, { rol: 'SOPORTE', versionEsperada: 3 });
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /rol de camila torres/i })).toHaveTextContent('Soporte'),
    );
  });

  it('desactivar usuario pide confirmación AlertDialog; reactivar es directo', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');

    await user.click(screen.getByRole('switch', { name: /estado de camila torres/i }));
    const alerta = await screen.findByRole('alertdialog');
    await user.click(within(alerta).getByRole('button', { name: /cancelar/i }));
    expect(actualizar).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: /estado de camila torres/i })).toBeChecked();

    await user.click(screen.getByRole('switch', { name: /estado de camila torres/i }));
    const alerta2 = await screen.findByRole('alertdialog');
    await user.click(within(alerta2).getByRole('button', { name: /desactivar/i }));
    expect(actualizar).toHaveBeenCalledWith(2, { activo: false, versionEsperada: 1 });

    // Mostrar inactivos y reactivar a Mateo (sin AlertDialog)
    await user.click(screen.getByRole('switch', { name: /mostrar inactivos/i }));
    const switchMateo = await screen.findByRole('switch', { name: /estado de mateo rojas/i });
    expect(switchMateo).not.toBeChecked();
    await user.click(switchMateo);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(actualizar).toHaveBeenCalledWith(3, { activo: true, versionEsperada: 2 });
  });

  it('409 por versión muestra AvisoConflicto con botón Recargar que vuelve a consultar', async () => {
    const { user } = montar();
    await screen.findByText('Camila Torres');

    actualizar.mockRejectedValueOnce(new ErrorApi(409, 'La membresía cambió (versión 2, se esperaba 1). Recárguela.'));
    await user.click(screen.getByRole('combobox', { name: /rol de camila torres/i }));
    await user.click(await screen.findByRole('option', { name: 'Administrador' }));

    expect(await screen.findByText('Otra persona cambió este registro')).toBeInTheDocument();
    const recargar = screen.getByRole('button', { name: /recargar/i });
    const llamadasAntes = listar.mock.calls.length;
    await user.click(recargar);
    await waitFor(() => expect(listar.mock.calls.length).toBeGreaterThan(llamadasAntes));
    expect(screen.queryByText('Otra persona cambió este registro')).not.toBeInTheDocument();
  });

  it('422 último ADMIN muestra el mensaje de la API en aviso y el control vuelve al valor anterior', async () => {
    const { user } = montar();
    await screen.findByText('Ana Admin');

    // Quitar ADMIN al único ADMIN -> AlertDialog -> confirmar -> 422
    await user.click(screen.getByRole('combobox', { name: /rol de ana admin/i }));
    await user.click(await screen.findByRole('option', { name: 'Soporte' }));
    const alerta = await screen.findByRole('alertdialog');
    await user.click(within(alerta).getByRole('button', { name: /confirmar/i }));

    expect(await screen.findByText('El conjunto debe conservar al menos un administrador activo')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /rol de ana admin/i })).toHaveTextContent('Administrador');

    // Desactivar al único ADMIN -> AlertDialog -> confirmar -> 422
    await user.click(screen.getByRole('switch', { name: /estado de ana admin/i }));
    const alerta2 = await screen.findByRole('alertdialog');
    await user.click(within(alerta2).getByRole('button', { name: /desactivar/i }));
    expect(screen.getByRole('switch', { name: /estado de ana admin/i })).toBeChecked();
  });
});
