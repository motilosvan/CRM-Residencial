import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import {
  ErrorApi,
  type FilaSolicitud,
  type ResidenteConjunto,
  type ResidentesService,
  type SolicitudesService,
} from '@/services/contratos';
import { crearResidentesMock } from '@/services/mock/residentesMock';
import type { Conjunto, Sesion } from '@/types/conjunto';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };

let residentesReal: ResidentesService;

const listarResidentes = vi.fn((f?: Parameters<ResidentesService['listar']>[0], s?: AbortSignal) =>
  residentesReal.listar(f, s),
);
const crearResidente = vi.fn((e: Parameters<ResidentesService['crear']>[0]) => residentesReal.crear(e));
const actualizarResidente = vi.fn((id: number, c: Parameters<ResidentesService['actualizar']>[1]) =>
  residentesReal.actualizar(id, c),
);
const listarSolicitudes = vi.fn<SolicitudesService['listar']>();

vi.mock('@/services', () => ({
  conjuntosService: { listar: vi.fn().mockResolvedValue([]) },
  authService: { sesion: vi.fn().mockResolvedValue(null), salir: vi.fn().mockResolvedValue(undefined) },
  resumenService: { obtener: vi.fn().mockResolvedValue({ porEstado: [], carga: [], respuesta: [] }) },
  buzonService: { estado: vi.fn(), guardar: vi.fn(), desconectar: vi.fn(), sincronizar: vi.fn() },
  correosService: { listar: vi.fn(), detalle: vi.fn() },
  usuariosService: { listar: vi.fn().mockResolvedValue([]), agregar: vi.fn(), actualizar: vi.fn() },
  solicitudesService: {
    listar: (f?: Parameters<SolicitudesService['listar']>[0], s?: AbortSignal) => listarSolicitudes(f, s),
    detalle: vi.fn(),
    asignar: vi.fn(),
    cambiarEstado: vi.fn(),
    reclasificar: vi.fn(),
    aceptarSugerencia: vi.fn(),
  },
  residentesService: {
    listar: (f?: Parameters<ResidentesService['listar']>[0], s?: AbortSignal) => listarResidentes(f, s),
    crear: (e: Parameters<ResidentesService['crear']>[0]) => crearResidente(e),
    actualizar: (id: number, c: Parameters<ResidentesService['actualizar']>[1]) => actualizarResidente(id, c),
    vincularCorreo: vi.fn(),
  },
  validacionService: { obtener: vi.fn() },
}));

import { clave } from '@/services/claves';
import { useSesion } from '@/store/sesion';
import ResidentesPage from './ResidentesPage';

const conjunto: Conjunto = { id: 'cj-1', slug: 'parques', nombre: 'Parque Central' };

const residentesBase: ResidenteConjunto[] = [
  {
    id: 101,
    nombre: 'Elena Vargas',
    unidad: 'T2-401',
    correo: 'elena.vargas@demo.mailflow.test',
    telefono: '3004567890',
    activo: true,
    version: 1,
    totalSolicitudes: 2,
  },
  {
    id: 102,
    nombre: 'Jorge Salazar',
    unidad: 'T1-204',
    correo: null,
    telefono: null,
    activo: true,
    version: 1,
    totalSolicitudes: 0,
  },
  {
    id: 111,
    nombre: 'Marta Quintero',
    unidad: 'T1-304',
    correo: 'marta.quintero@demo.mailflow.test',
    telefono: '3159876543',
    activo: false,
    version: 2,
    totalSolicitudes: 0,
  },
];

const solicitudesBase: FilaSolicitud[] = [
  {
    id: 22,
    codigo: 'SOL-000022',
    asunto: 'Fuga de agua en sótano 1',
    remitente: 'elena.vargas@demo.mailflow.test',
    estado: 'NUEVA',
    categoria: 'MANTENIMIENTO',
    prioridad: 'ALTA',
    slaHoras: 4,
    version: 1,
    fechaCreacion: '2026-11-16T15:10:00.000Z',
    primeraRespuesta: null,
    fechaCierre: null,
    responsable: null,
    idResponsable: null,
  },
  {
    id: 20,
    codigo: 'SOL-000020',
    asunto: 'Otro asunto',
    remitente: 'otro.residente@demo.mailflow.test',
    estado: 'ASIGNADA',
    categoria: 'FACTURACION',
    prioridad: 'MEDIA',
    slaHoras: 24,
    version: 2,
    fechaCreacion: '2026-11-15T11:20:00.000Z',
    primeraRespuesta: null,
    fechaCierre: null,
    responsable: 'Soporte Demo',
    idResponsable: 2,
  },
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
  const router = createMemoryRouter(
    [
      { path: '/app/:conjunto/residentes', element: <ResidentesPage /> },
      { path: '/app/:conjunto/solicitudes', element: <div>Vista Solicitudes</div> },
    ],
    { initialEntries: ['/app/parques/residentes'] },
  );
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
  residentesReal = crearResidentesMock({ ...SIN_LATENCIA, iniciales: residentesBase });
  listarResidentes.mockClear();
  crearResidente.mockClear();
  actualizarResidente.mockClear();
  listarSolicitudes.mockReset();
  listarSolicitudes.mockResolvedValue(solicitudesBase);
  ponerSesionAdmin();
});

afterEach(() => {
  cleanup();
});

describe('ResidentesPage · estados y listado', () => {
  it('muestra EsqueletoCarga mientras carga', () => {
    listarResidentes.mockImplementationOnce(() => new Promise(() => {}));
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  });

  it('muestra EstadoError cuando falla y reintenta al pulsar Reintentar', async () => {
    listarResidentes.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar();

    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(boton);

    expect(await screen.findByText('Elena Vargas')).toBeInTheDocument();
    expect(listarResidentes).toHaveBeenCalledTimes(2);
  });

  it('muestra EmptyState sin datos y sin resultados al buscar', async () => {
    residentesReal = crearResidentesMock({ ...SIN_LATENCIA, iniciales: [] });
    montar();
    expect(await screen.findByText(/no hay residentes registrados/i)).toBeInTheDocument();

    cleanup();
    residentesReal = crearResidentesMock({ ...SIN_LATENCIA, iniciales: residentesBase });
    const { user } = montar();
    await screen.findByText('Elena Vargas');
    const buscador = screen.getByRole('searchbox', { name: /buscar residentes/i });
    await user.type(buscador, 'inexistente{Enter}');
    expect(await screen.findByText(/no encontramos residentes/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }));
    expect(await screen.findByText('Elena Vargas')).toBeInTheDocument();
  });

  it('muestra tabla en escritorio (sin break-all en correos), «Sin correo», «—», búsqueda q y Switch «Solo activos» con htmlFor', async () => {
    const { user } = montar();

    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('Elena Vargas')).toBeInTheDocument();
    expect(within(tabla).getByText('T2-401')).toBeInTheDocument();
    const celdaCorreo = within(tabla).getByText('elena.vargas@demo.mailflow.test');
    expect(celdaCorreo.className).not.toContain('break-all');
    expect(within(tabla).getByText('3004567890')).toBeInTheDocument();
    expect(within(tabla).getByText('Sin correo')).toBeInTheDocument();
    expect(within(tabla).getByText('—')).toBeInTheDocument();
    expect(within(tabla).getByText('Marta Quintero')).toBeInTheDocument();

    // Switch «Solo activos» con <Label htmlFor>
    const switchSoloActivos = screen.getByRole('switch', { name: /solo activos/i });
    expect(switchSoloActivos.id).toBeTruthy();
    expect(document.querySelector(`label[for="${CSS.escape(switchSoloActivos.id)}"]`)).toHaveTextContent('Solo activos');
    await user.click(switchSoloActivos);

    await waitFor(() => expect(screen.queryByText('Marta Quintero')).not.toBeInTheDocument());
    expect(listarResidentes).toHaveBeenLastCalledWith({ soloActivos: true }, expect.any(AbortSignal));

    // Switch por fila enlazado con <Label htmlFor>
    const switchElena = screen.getByRole('switch', { name: /estado de elena vargas/i });
    expect(switchElena.id).toBeTruthy();
    expect(document.querySelector(`label[for="${CSS.escape(switchElena.id)}"]`)).toHaveTextContent('Activo');
  });

  it('en móvil (375px) usa tarjetas apiladas sin tabla y controles max-sm:h-10', async () => {
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
    expect(await screen.findByText('Elena Vargas')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrar residente/i }).className).toContain('max-sm:h-10');
    const seccionFiltros = screen.getByRole('region', { name: /filtros de residentes/i });
    expect(seccionFiltros.className).toContain('flex-col');
    expect(screen.getByRole('search').className).toContain('w-full');
    const correoMarta = screen.getByText('marta.quintero@demo.mailflow.test');
    expect(correoMarta.className).toContain('text-xs');
    expect(correoMarta.className).not.toContain('break-all');
  });
});

describe('ResidentesPage · Registrar y Editar', () => {
  it('registrar residente: valida con Zod en español, restaura foco al cerrar, guarda y muestra errores 409/422 dentro del diálogo', async () => {
    const { qc, user } = montar();
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');

    await screen.findByText('Elena Vargas');
    const botonAbrir = screen.getByRole('button', { name: /registrar residente/i });
    await user.click(botonAbrir);

    const dialogo = await screen.findByRole('dialog');
    await user.click(within(dialogo).getByRole('button', { name: /guardar|registrar/i }));
    expect(await within(dialogo).findByText(/escribe el nombre/i)).toBeInTheDocument();
    expect(within(dialogo).getByText(/escribe la unidad/i)).toBeInTheDocument();

    // Escape restaura foco
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonAbrir).toHaveFocus();

    // Error 409 correo duplicado sin cerrar diálogo
    await user.click(botonAbrir);
    const dlg2 = await screen.findByRole('dialog');
    await user.type(within(dlg2).getByLabelText(/nombre/i), 'Carlos Nuevo');
    await user.type(within(dlg2).getByLabelText(/unidad/i), 'T3-501');
    await user.type(within(dlg2).getByLabelText(/correo/i), 'elena.vargas@demo.mailflow.test');
    await user.click(within(dlg2).getByRole('button', { name: /guardar|registrar/i }));

    expect(await within(dlg2).findByText('Ya existe un residente con ese correo en el conjunto')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Error 422 sin cerrar diálogo
    crearResidente.mockRejectedValueOnce(new ErrorApi(422, 'Teléfono demasiado largo'));
    await user.clear(within(dlg2).getByLabelText(/correo/i));
    await user.type(within(dlg2).getByLabelText(/correo/i), 'carlos.nuevo@demo.mailflow.test');
    await user.click(within(dlg2).getByRole('button', { name: /guardar|registrar/i }));
    expect(await within(dlg2).findByText('Teléfono demasiado largo')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Camino feliz
    await user.type(within(dlg2).getByLabelText(/teléfono/i), '3112223344');
    await user.click(within(dlg2).getByRole('button', { name: /guardar|registrar/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Carlos Nuevo')).toBeInTheDocument();
    expect(await screen.findByText(/residente registrado/i)).toBeInTheDocument();
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'residentes') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'validacion') });
  });

  it('editar residente: envía versionEsperada, maneja 409 versión (AvisoConflicto) y 409 correo duplicado', async () => {
    const { user } = montar();
    const tabla = await screen.findByRole('table');
    const filaElena = within(tabla).getByText('Elena Vargas').closest('tr')!;
    const botonEditar = within(filaElena).getByRole('button', { name: /editar/i });
    await user.click(botonEditar);

    const dlg = await screen.findByRole('dialog');
    await user.click(within(dlg).getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonEditar).toHaveFocus();

    // Abrir nuevamente y simular 409 correo duplicado
    await user.click(botonEditar);
    const dlg2 = await screen.findByRole('dialog');
    await user.clear(within(dlg2).getByLabelText(/correo/i));
    await user.type(within(dlg2).getByLabelText(/correo/i), 'marta.quintero@demo.mailflow.test');
    await user.click(within(dlg2).getByRole('button', { name: /guardar cambios/i }));
    expect(await within(dlg2).findByText('Ya existe un residente con ese correo en el conjunto')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Simular 409 por versión desactualizada -> AvisoConflicto con Recargar
    await user.clear(within(dlg2).getByLabelText(/correo/i));
    await user.type(within(dlg2).getByLabelText(/correo/i), 'elena.vargas@demo.mailflow.test');
    await user.clear(within(dlg2).getByLabelText(/unidad/i));
    await user.type(within(dlg2).getByLabelText(/unidad/i), 'T2-401B');

    actualizarResidente.mockRejectedValueOnce(
      new ErrorApi(409, 'El residente cambió (versión 2, se esperaba 1). Recárguelo.'),
    );
    await user.click(within(dlg2).getByRole('button', { name: /guardar cambios/i }));
    expect(await within(dlg2).findByText('Otra persona cambió este registro')).toBeInTheDocument();

    const llamadasAntes = listarResidentes.mock.calls.length;
    await user.click(within(dlg2).getByRole('button', { name: /recargar/i }));
    await waitFor(() => expect(listarResidentes.mock.calls.length).toBeGreaterThan(llamadasAntes));
    expect(within(dlg2).queryByText('Otra persona cambió este registro')).not.toBeInTheDocument();

    // Editar correctamente
    await user.clear(within(dlg2).getByLabelText(/unidad/i));
    await user.type(within(dlg2).getByLabelText(/unidad/i), 'T2-401A');
    await user.click(within(dlg2).getByRole('button', { name: /guardar cambios/i }));

    expect(actualizarResidente).toHaveBeenLastCalledWith(101, {
      nombre: 'Elena Vargas',
      unidad: 'T2-401A',
      correo: 'elena.vargas@demo.mailflow.test',
      telefono: '3004567890',
      versionEsperada: 1,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/residente actualizado/i)).toBeInTheDocument();
  });
});

describe('ResidentesPage · Estado activo/inactivo y Sheet de solicitudes', () => {
  it('desactivar abre AlertDialog, reactivar es directo y 409 muestra AvisoConflicto', async () => {
    const { user } = montar();
    await screen.findByText('Elena Vargas');

    const switchElena = screen.getByRole('switch', { name: /estado de elena vargas/i });
    await user.click(switchElena);

    const alerta = await screen.findByRole('alertdialog');
    await user.click(within(alerta).getByRole('button', { name: /cancelar/i }));
    expect(actualizarResidente).not.toHaveBeenCalled();

    await user.click(switchElena);
    const alerta2 = await screen.findByRole('alertdialog');
    await user.click(within(alerta2).getByRole('button', { name: /desactivar/i }));
    expect(actualizarResidente).toHaveBeenCalledWith(101, { activo: false, versionEsperada: 1 });
    expect(await screen.findByText(/residente desactivado/i)).toBeInTheDocument();

    // Reactivar a Marta (directo, sin AlertDialog)
    const switchMarta = screen.getByRole('switch', { name: /estado de marta quintero/i });
    actualizarResidente.mockRejectedValueOnce(new ErrorApi(409, 'El residente cambió. Recárguelo.'));
    await user.click(switchMarta);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Otra persona cambió este registro')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /recargar/i }));
    await waitFor(() => expect(screen.queryByText('Otra persona cambió este registro')).not.toBeInTheDocument());

    await user.click(screen.getByRole('switch', { name: /estado de marta quintero/i }));
    expect(actualizarResidente).toHaveBeenLastCalledWith(111, { activo: true, versionEsperada: 2 });
    expect(await screen.findByText(/residente activado/i)).toBeInTheDocument();
  });

  it('botón de solicitudes abre Sheet lateral filtrando las del residente, con estado vacío y error con reintento', async () => {
    const { user } = montar();
    const tabla = await screen.findByRole('table');

    // Error con reintento en Sheet de Elena
    listarSolicitudes.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const filaElena = within(tabla).getByText('Elena Vargas').closest('tr')!;
    await user.click(within(filaElena).getByRole('button', { name: /2 solicitudes/i }));

    const sheet = await screen.findByRole('dialog');
    const reintentar = await within(sheet).findByRole('button', { name: 'Reintentar' });
    await user.click(reintentar);

    const enlaceSol = await within(sheet).findByRole('link', { name: 'SOL-000022' });
    expect(enlaceSol).toHaveAttribute('href', '/app/parques/solicitudes?id=22');
    expect(within(sheet).queryByText('SOL-000020')).not.toBeInTheDocument();

    // Cerrar Sheet y abrir el de Jorge (sin correo) -> estado vacío claro
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    const filaJorge = within(tabla).getByText('Jorge Salazar').closest('tr')!;
    await user.click(within(filaJorge).getByRole('button', { name: /0 solicitudes/i }));
    const sheetJorge = await screen.findByRole('dialog');
    expect(await within(sheetJorge).findByText(/no tiene un correo registrado/i)).toBeInTheDocument();
  });
});
