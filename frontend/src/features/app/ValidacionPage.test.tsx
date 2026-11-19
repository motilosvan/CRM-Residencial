import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import {
  ErrorApi,
  type DetalleCorreoBuzon,
  type DetalleSolicitud,
  type ResidenteConjunto,
  type ResidentesService,
  type SolicitudesService,
  type ValidacionService,
} from '@/services/contratos';
import { crearEstadoPanelMock } from '@/services/mock/estadoCompartido';
import { crearResidentesMock } from '@/services/mock/residentesMock';
import { crearSolicitudesMock } from '@/services/mock/solicitudesMock';
import { crearValidacionMock } from '@/services/mock/validacionMock';
import type { Conjunto, Sesion } from '@/types/conjunto';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };

let validacionReal: ValidacionService;
let residentesReal: ResidentesService;
let solicitudesReal: SolicitudesService;

const obtenerValidacion = vi.fn((s?: AbortSignal) => validacionReal.obtener(s));
const listarResidentes = vi.fn((f?: Parameters<ResidentesService['listar']>[0], s?: AbortSignal) =>
  residentesReal.listar(f, s),
);
const vincularCorreo = vi.fn((id: number, e: Parameters<ResidentesService['vincularCorreo']>[1]) =>
  residentesReal.vincularCorreo(id, e),
);
const aceptarSugerencia = vi.fn((id: number, e: Parameters<SolicitudesService['aceptarSugerencia']>[1]) =>
  solicitudesReal.aceptarSugerencia(id, e),
);
const reclasificar = vi.fn((id: number, e: Parameters<SolicitudesService['reclasificar']>[1]) =>
  solicitudesReal.reclasificar(id, e),
);

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
    reclasificar: (id: number, e: Parameters<SolicitudesService['reclasificar']>[1]) => reclasificar(id, e),
    aceptarSugerencia: (id: number, e: Parameters<SolicitudesService['aceptarSugerencia']>[1]) =>
      aceptarSugerencia(id, e),
  },
  residentesService: {
    listar: (f?: Parameters<ResidentesService['listar']>[0], s?: AbortSignal) => listarResidentes(f, s),
    crear: vi.fn(),
    actualizar: vi.fn(),
    vincularCorreo: (id: number, e: Parameters<ResidentesService['vincularCorreo']>[1]) => vincularCorreo(id, e),
  },
  validacionService: {
    obtener: (s?: AbortSignal) => obtenerValidacion(s),
  },
}));

import { clave } from '@/services/claves';
import { useSesion } from '@/store/sesion';
import ValidacionPage from './ValidacionPage';

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
    totalSolicitudes: 1,
  },
  {
    id: 111,
    nombre: 'Marta Inactiva',
    unidad: 'T1-304',
    correo: 'marta@demo.mailflow.test',
    telefono: null,
    activo: false,
    version: 1,
    totalSolicitudes: 0,
  },
];

const correosBase: DetalleCorreoBuzon[] = [
  {
    id: 2,
    remitente: 'visitante.ext@demo.mailflow.test',
    asunto: 'Solicitud de información para ingreso de trasteo',
    fechaRecepcion: '2026-11-16T13:45:00.000Z',
    idResidente: null,
    residente: null,
    unidad: null,
    idSolicitud: 21,
    codigo: 'SOL-000021',
    estado: 'NUEVA',
    categoria: 'SIN_CLASIFICAR',
    prioridad: 'MEDIA',
    sugerenciaEstado: 'LISTA',
    sugerenciaCategoria: 'ADMINISTRATIVO',
    cuerpo: 'Cordial saludo, la próxima semana nos mudamos al conjunto y queremos conocer los horarios de portería.',
    cuerpoEnmascarado: 'Cordial saludo, la próxima semana nos mudamos al conjunto.',
    sugerencia: {
      estado: 'LISTA',
      categoria: 'ADMINISTRATIVO',
      prioridad: 'BAJA',
      resumen: 'Consulta sobre horarios y requisitos de portería para mudanza.',
      justificacion: 'Trámite administrativo de mudanza sin urgencia inmediata.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-16T13:46:00.000Z',
    },
  },
  {
    id: 7,
    remitente: 'nuevo.vecino@demo.mailflow.test',
    asunto: 'Autorización de ingreso técnico de internet',
    fechaRecepcion: '2026-11-14T18:40:00.000Z',
    idResidente: null,
    residente: null,
    unidad: null,
    idSolicitud: 16,
    codigo: 'SOL-000016',
    estado: 'ASIGNADA',
    categoria: 'SEGURIDAD',
    prioridad: 'MEDIA',
    sugerenciaEstado: 'EN_REINTENTO',
    sugerenciaCategoria: null,
    cuerpo: 'Buenas tardes, autorizo el ingreso del técnico de fibra óptica mañana en la mañana.',
    cuerpoEnmascarado: 'Buenas tardes, autorizo el ingreso del técnico.',
    sugerencia: null,
  },
];

const solicitudesBase: DetalleSolicitud[] = [
  {
    id: 21,
    codigo: 'SOL-000021',
    asunto: 'Solicitud de información para ingreso de trasteo',
    remitente: 'visitante.ext@demo.mailflow.test',
    estado: 'NUEVA',
    categoria: 'SIN_CLASIFICAR',
    prioridad: 'MEDIA',
    slaHoras: 24,
    version: 1,
    fechaCreacion: '2026-11-16T13:45:00.000Z',
    primeraRespuesta: null,
    fechaCierre: null,
    responsable: null,
    idResponsable: null,
    cuerpo: 'Cordial saludo...',
    messageId: '<msg-21@demo.mailflow.test>',
    historial: [],
    asignaciones: [],
    destinos: [],
    sugerencia: correosBase[0].sugerencia,
  },
  {
    id: 10,
    codigo: 'SOL-000010',
    asunto: 'Copia de manual de parqueaderos',
    remitente: 'laura.gomez@demo.mailflow.test',
    estado: 'NUEVA',
    categoria: 'SIN_CLASIFICAR',
    prioridad: 'ALTA',
    slaHoras: 4,
    version: 2,
    fechaCreacion: '2026-11-15T10:00:00.000Z',
    primeraRespuesta: null,
    fechaCierre: null,
    responsable: null,
    idResponsable: null,
    cuerpo: 'Buen día...',
    messageId: '<msg-10@demo.mailflow.test>',
    historial: [],
    asignaciones: [],
    destinos: [],
    sugerencia: {
      estado: 'LISTA',
      categoria: 'MANTENIMIENTO',
      prioridad: 'BAJA',
      resumen: 'Solicitud de documento de parqueaderos.',
      justificacion: 'No requiere atención urgente.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-15T10:05:00.000Z',
    },
  },
];

function configurarEstadoMock(opts?: {
  correos?: DetalleCorreoBuzon[];
  solicitudes?: DetalleSolicitud[];
  residentes?: ResidenteConjunto[];
}) {
  const estado = crearEstadoPanelMock({
    correos: opts?.correos ?? correosBase,
    solicitudes: opts?.solicitudes ?? solicitudesBase,
    residentes: opts?.residentes ?? residentesBase,
  });
  validacionReal = crearValidacionMock({ ...SIN_LATENCIA, estado });
  residentesReal = crearResidentesMock({ ...SIN_LATENCIA, estado });
  solicitudesReal = crearSolicitudesMock({
    ...SIN_LATENCIA,
    estado,
    actor: { idUsuario: 1, nombre: 'Ana Admin', rol: 'ADMIN' },
  });
}

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
      { path: '/app/:conjunto/validacion', element: <ValidacionPage /> },
      { path: '/app/:conjunto/solicitudes', element: <div>Vista Solicitudes</div> },
    ],
    { initialEntries: ['/app/parques/validacion'] },
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster theme="light" containerAriaLabel="Notificaciones" />
    </QueryClientProvider>,
  );
  return { qc, router, user: userEvent.setup() };
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  configurarEstadoMock();
  obtenerValidacion.mockClear();
  listarResidentes.mockClear();
  vincularCorreo.mockClear();
  aceptarSugerencia.mockClear();
  reclasificar.mockClear();
  ponerSesionAdmin();
});

afterEach(() => {
  cleanup();
});

describe('ValidacionPage · estados de carga, error y vacíos por pestaña', () => {
  it('muestra EsqueletoCarga mientras carga', () => {
    obtenerValidacion.mockImplementationOnce(() => new Promise(() => {}));
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  });

  it('muestra EstadoError cuando falla y reintenta al pulsar Reintentar', async () => {
    obtenerValidacion.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar();

    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(boton);

    expect(await screen.findByText('SOL-000021')).toBeInTheDocument();
    expect(obtenerValidacion).toHaveBeenCalledTimes(2);
  });

  it('muestra estados vacíos independientes en cada pestaña cuando no hay elementos', async () => {
    configurarEstadoMock({ solicitudes: [], correos: [] });
    const { user } = montar();

    expect(await screen.findByRole('tab', { name: /sugerencias de ia.*\(0\)/i })).toBeInTheDocument();
    expect(screen.getByText(/no hay sugerencias de ia pendientes/i)).toBeInTheDocument();

    const tabRemitentes = screen.getByRole('tab', { name: /remitentes sin residente.*\(0\)/i });
    await user.click(tabRemitentes);
    expect(await screen.findByText(/todos los remitentes están vinculados/i)).toBeInTheDocument();
  });

  it('en vista móvil (375px) funciona correctamente con controles de altura táctil', async () => {
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
    expect(await screen.findByText('SOL-000021')).toBeInTheDocument();
    const tablist = screen.getByRole('tablist');
    expect(tablist.className).toContain('max-sm:h-auto!');
    expect(tablist.className).toContain('max-sm:flex-col');
    for (const tab of within(tablist).getAllByRole('tab')) {
      expect(tab.className).toContain('max-sm:h-10');
      expect(tab.className).toContain('max-sm:flex-none');
    }
    const botonAprobar = screen.getAllByRole('button', { name: /aprobar sugerencia/i })[0];
    expect(botonAprobar.className).toContain('max-sm:h-10');
    expect(screen.getByText('visitante.ext@demo.mailflow.test').className).not.toContain('break-all');
  });
});

describe('ValidacionPage · Pestaña 1 (Sugerencias de IA pendientes)', () => {
  it('muestra conteos en pestañas, comparación actual vs IA, proveedor/modelo y enlace a solicitud', async () => {
    montar();

    expect(await screen.findByRole('tab', { name: /sugerencias de ia.*\(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /remitentes sin residente.*\(2\)/i })).toBeInTheDocument();

    const enlace = screen.getByRole('link', { name: 'SOL-000021' });
    expect(enlace).toHaveAttribute('href', '/app/parques/solicitudes?id=21');
    expect(screen.getByText('Solicitud de información para ingreso de trasteo')).toBeInTheDocument();
    expect(screen.getByText('visitante.ext@demo.mailflow.test')).toBeInTheDocument();
    expect(screen.getByText('Consulta sobre horarios y requisitos de portería para mudanza.')).toBeInTheDocument();
    expect(screen.getByText('Trámite administrativo de mudanza sin urgencia inmediata.')).toBeInTheDocument();
    expect(screen.getAllByText(/openrouter · gpt-4o-mini/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('visitante.ext@demo.mailflow.test').className).not.toContain('break-all');
  });

  it('«Aprobar sugerencia» llama aceptarSugerencia con versionEsperada, muestra toast e invalida consultas', async () => {
    const { qc, user } = montar();
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');

    expect(await screen.findByText('SOL-000021')).toBeInTheDocument();
    const card21 = screen.getByText('SOL-000021').closest('li')!;
    await user.click(within(card21).getByRole('button', { name: /aprobar sugerencia/i }));

    expect(aceptarSugerencia).toHaveBeenCalledWith(21, { versionEsperada: 1 });
    expect(await screen.findByText(/sugerencia de ia aplicada/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('SOL-000021')).not.toBeInTheDocument());

    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'validacion') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'solicitudes') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'correos') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'resumen') });
  });

  it('«Corregir clasificación» abre diálogo, restaura foco al cerrar y envía reclasificar con comentario', async () => {
    const { qc, user } = montar();
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');

    expect(await screen.findByText('SOL-000021')).toBeInTheDocument();
    const card21 = screen.getByText('SOL-000021').closest('li')!;
    const botonCorregir = within(card21).getByRole('button', { name: /corregir clasificación/i });
    await user.click(botonCorregir);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonCorregir).toHaveFocus();

    await user.click(botonCorregir);
    const dlg = await screen.findByRole('dialog');
    await user.click(within(dlg).getByRole('combobox', { name: /categoría/i }));
    await user.click(await screen.findByRole('option', { name: 'Seguridad' }));

    await user.click(within(dlg).getByRole('combobox', { name: /prioridad/i }));
    await user.click(await screen.findByRole('option', { name: 'Alta' }));

    await user.type(within(dlg).getByLabelText(/comentario/i), 'Ingreso de contratista');
    await user.click(within(dlg).getByRole('button', { name: /guardar clasificación/i }));

    expect(reclasificar).toHaveBeenCalledWith(21, {
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      versionEsperada: 1,
      comentario: 'Ingreso de contratista',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/clasificación actualizada/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('SOL-000021')).not.toBeInTheDocument());

    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'validacion') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'solicitudes') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'correos') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'resumen') });
  });

  it('maneja conflicto 409 en validación mostrando AvisoConflicto con Recargar', async () => {
    const { user } = montar();
    expect(await screen.findByText('SOL-000021')).toBeInTheDocument();

    aceptarSugerencia.mockRejectedValueOnce(new ErrorApi(409, 'La solicitud cambió. Recárguela.'));
    await user.click(screen.getAllByRole('button', { name: /aprobar sugerencia/i })[0]);

    expect(await screen.findByText('Otra persona cambió este registro')).toBeInTheDocument();
    const llamadasAntes = obtenerValidacion.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /recargar/i }));
    await waitFor(() => expect(obtenerValidacion.mock.calls.length).toBeGreaterThan(llamadasAntes));
    expect(screen.queryByText('Otra persona cambió este registro')).not.toBeInTheDocument();

    // También 409 dentro del diálogo Corregir clasificación
    reclasificar.mockRejectedValueOnce(new ErrorApi(409, 'La solicitud cambió. Recárguela.'));
    await user.click(screen.getAllByRole('button', { name: /corregir clasificación/i })[0]);
    const dlg = await screen.findByRole('dialog');
    await user.click(within(dlg).getByRole('button', { name: /guardar clasificación/i }));
    expect(await within(dlg).findByText('Otra persona cambió este registro')).toBeInTheDocument();
    const llamadasAntes2 = obtenerValidacion.mock.calls.length;
    await user.click(within(dlg).getByRole('button', { name: /recargar/i }));
    await waitFor(() => expect(obtenerValidacion.mock.calls.length).toBeGreaterThan(llamadasAntes2));
  });
});

describe('ValidacionPage · Pestaña 2 (Remitentes sin residente)', () => {
  it('lista correos con idResidente === null y permite asociar a residente existente activo', async () => {
    const { qc, user } = montar();
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');

    const tabRemitentes = await screen.findByRole('tab', { name: /remitentes sin residente/i });
    await user.click(tabRemitentes);

    expect(await screen.findByText('nuevo.vecino@demo.mailflow.test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SOL-000016' })).toHaveAttribute('href', '/app/parques/solicitudes?id=16');

    const botonesVincular = screen.getAllByRole('button', { name: /vincular residente/i });
    await user.click(botonesVincular[0]);

    const dialogo = await screen.findByRole('dialog');
    // Solo carga residentes activos
    await waitFor(() => expect(listarResidentes).toHaveBeenCalledWith({ soloActivos: true }, expect.any(AbortSignal)));

    // Foco vuelve al botón al cancelar
    await user.click(within(dialogo).getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonesVincular[0]).toHaveFocus();

    // Asociar a residente existente
    await user.click(botonesVincular[0]);
    const dlg2 = await screen.findByRole('dialog');
    await user.click(within(dlg2).getByRole('combobox', { name: /residente/i }));
    const opcionElena = await screen.findByRole('option', { name: /elena vargas/i });
    expect(screen.queryByRole('option', { name: /marta inactiva/i })).not.toBeInTheDocument();
    await user.click(opcionElena);

    await user.click(within(dlg2).getByRole('button', { name: /asociar residente/i }));

    expect(vincularCorreo).toHaveBeenCalledWith(2, { idResidente: 101 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/correo vinculado/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('visitante.ext@demo.mailflow.test')).not.toBeInTheDocument());

    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'validacion') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'residentes') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'correos') });
  });

  it('permite registrar nuevo residente con checkbox «Usar el correo del remitente» y mantiene errores 409/422 dentro del diálogo', async () => {
    const { user } = montar();

    await user.click(await screen.findByRole('tab', { name: /remitentes sin residente/i }));
    const botonVincular = (await screen.findAllByRole('button', { name: /vincular residente/i }))[0];
    await user.click(botonVincular);

    const dlg = await screen.findByRole('dialog');
    await user.click(within(dlg).getByRole('tab', { name: /registrar nuevo residente/i }));

    const checkbox = within(dlg).getByRole('checkbox', {
      name: /usar el correo del remitente \(visitante\.ext@demo\.mailflow\.test\)/i,
    });
    expect(checkbox).toBeChecked();
    expect(checkbox.id).toBeTruthy();
    expect(dlg.querySelector(`label[for="${CSS.escape(checkbox.id)}"]`)).toBeTruthy();

    // Validación Zod en español
    await user.click(within(dlg).getByRole('button', { name: /registrar y vincular/i }));
    expect(await within(dlg).findByText(/escribe el nombre/i)).toBeInTheDocument();
    expect(within(dlg).getByText(/escribe la unidad/i)).toBeInTheDocument();

    // Error 409 del servidor se muestra sin cerrar el diálogo
    vincularCorreo.mockRejectedValueOnce(new ErrorApi(409, 'Ya existe un residente con ese correo en el conjunto'));
    await user.type(within(dlg).getByLabelText(/nombre/i), 'Andrés Nuevo');
    await user.type(within(dlg).getByLabelText(/unidad/i), 'T3-502');
    await user.type(within(dlg).getByLabelText(/teléfono/i), '3119998877');
    await user.click(within(dlg).getByRole('button', { name: /registrar y vincular/i }));

    expect(await within(dlg).findByText('Ya existe un residente con ese correo en el conjunto')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Error 422 también se muestra sin cerrar el diálogo
    vincularCorreo.mockRejectedValueOnce(new ErrorApi(422, 'No se puede vincular un correo a un residente inactivo'));
    await user.click(within(dlg).getByRole('button', { name: /registrar y vincular/i }));
    expect(await within(dlg).findByText('No se puede vincular un correo a un residente inactivo')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Desmarcar checkbox y guardar con éxito
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    await user.click(within(dlg).getByRole('button', { name: /registrar y vincular/i }));

    expect(vincularCorreo).toHaveBeenLastCalledWith(2, {
      residente: {
        nombre: 'Andrés Nuevo',
        unidad: 'T3-502',
        telefono: '3119998877',
        usarCorreoRemitente: false,
      },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/correo vinculado/i)).toBeInTheDocument();
  });
});
