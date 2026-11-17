import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import {
  ErrorApi,
  type DetalleSolicitud,
  type SolicitudesService,
  type UsuarioConjunto,
  type UsuariosService,
} from '@/services/contratos';
import { crearSolicitudesMock } from '@/services/mock/solicitudesMock';
import { crearUsuariosMock } from '@/services/mock/usuariosMock';
import type { Conjunto, Rol, Sesion } from '@/types/conjunto';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };

let solicitudesReal: SolicitudesService;
let usuariosReal: UsuariosService;
let actorActual: { idUsuario: number; nombre: string; rol: Rol } = {
  idUsuario: 1,
  nombre: 'Ana Admin',
  rol: 'ADMIN',
};

const listarSolicitudes = vi.fn((f?: Parameters<SolicitudesService['listar']>[0], s?: AbortSignal) =>
  solicitudesReal.listar(f, s),
);
const detalleSolicitud = vi.fn((id: number, s?: AbortSignal) => solicitudesReal.detalle(id, s));
const asignarSolicitud = vi.fn((id: number, e: Parameters<SolicitudesService['asignar']>[1]) =>
  solicitudesReal.asignar(id, e),
);
const cambiarEstadoSolicitud = vi.fn((id: number, e: Parameters<SolicitudesService['cambiarEstado']>[1]) =>
  solicitudesReal.cambiarEstado(id, e),
);
const reclasificarSolicitud = vi.fn((id: number, e: Parameters<SolicitudesService['reclasificar']>[1]) =>
  solicitudesReal.reclasificar(id, e),
);
const aceptarSugerenciaSolicitud = vi.fn((id: number, e: Parameters<SolicitudesService['aceptarSugerencia']>[1]) =>
  solicitudesReal.aceptarSugerencia(id, e),
);
const listarUsuarios = vi.fn((f?: Parameters<UsuariosService['listar']>[0], s?: AbortSignal) =>
  usuariosReal.listar(f, s),
);

vi.mock('@/services', () => ({
  conjuntosService: { listar: vi.fn().mockResolvedValue([]) },
  authService: { sesion: vi.fn().mockResolvedValue(null), salir: vi.fn().mockResolvedValue(undefined) },
  resumenService: { obtener: vi.fn().mockResolvedValue({ porEstado: [], carga: [], respuesta: [] }) },
  buzonService: { estado: vi.fn(), guardar: vi.fn(), desconectar: vi.fn(), sincronizar: vi.fn() },
  correosService: { listar: vi.fn(), detalle: vi.fn() },
  usuariosService: {
    listar: (f?: Parameters<UsuariosService['listar']>[0], s?: AbortSignal) => listarUsuarios(f, s),
    agregar: vi.fn(),
    actualizar: vi.fn(),
  },
  solicitudesService: {
    listar: (f?: Parameters<SolicitudesService['listar']>[0], s?: AbortSignal) => listarSolicitudes(f, s),
    detalle: (id: number, s?: AbortSignal) => detalleSolicitud(id, s),
    asignar: (id: number, e: Parameters<SolicitudesService['asignar']>[1]) => asignarSolicitud(id, e),
    cambiarEstado: (id: number, e: Parameters<SolicitudesService['cambiarEstado']>[1]) =>
      cambiarEstadoSolicitud(id, e),
    reclasificar: (id: number, e: Parameters<SolicitudesService['reclasificar']>[1]) => reclasificarSolicitud(id, e),
    aceptarSugerencia: (id: number, e: Parameters<SolicitudesService['aceptarSugerencia']>[1]) =>
      aceptarSugerenciaSolicitud(id, e),
  },
}));

import { clave } from '@/services/claves';
import { useSesion } from '@/store/sesion';
import SolicitudesPage from './SolicitudesPage';

const conjunto: Conjunto = { id: 'cj-1', slug: 'parques', nombre: 'Parque Central' };

const usuariosBase: UsuarioConjunto[] = [
  { id: 1, nombre: 'Ana Admin', correo: 'ana@demo.mailflow.test', rol: 'ADMIN', activo: true, version: 1, cuentaActiva: true },
  { id: 2, nombre: 'Soporte Demo', correo: 'soporte@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: true },
  { id: 3, nombre: 'Camila Torres', correo: 'camila@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: true },
  { id: 4, nombre: 'Mateo Rojas', correo: 'mateo@demo.mailflow.test', rol: 'SOPORTE', activo: false, version: 2, cuentaActiva: true },
  { id: 5, nombre: 'Lucía Méndez', correo: 'lucia@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: false },
];

const solicitudesBase: DetalleSolicitud[] = [
  {
    id: 22,
    codigo: 'SOL-000022',
    asunto: 'Fuga de agua en sótano 1',
    remitente: 'elena.vargas@demo.mailflow.test',
    estado: 'NUEVA',
    categoria: 'SIN_CLASIFICAR',
    prioridad: 'ALTA',
    slaHoras: 4,
    version: 1,
    fechaCreacion: '2026-11-16T15:10:00.000Z',
    primeraRespuesta: null,
    fechaCierre: null,
    responsable: null,
    idResponsable: null,
    cuerpo: 'Buenos días, hay una fuga constante junto a los parqueaderos del sótano 1.',
    messageId: '<msg-22@demo.mailflow.test>',
    historial: [
      {
        anterior: null,
        nuevo: 'NUEVA',
        usuario: null,
        comentario: 'Creada automáticamente desde correo',
        fecha: '2026-11-16T15:10:00.000Z',
      },
    ],
    asignaciones: [],
    destinos: [],
    sugerencia: {
      estado: 'LISTA',
      categoria: 'MANTENIMIENTO',
      prioridad: 'ALTA',
      resumen: 'Fuga de agua activa en sótano 1 junto a parqueaderos.',
      justificacion: 'Reporte hidráulico urgente en zona común.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-16T15:11:00.000Z',
    },
  },
  {
    id: 20,
    codigo: 'SOL-000020',
    asunto: 'Revisión de factura de administración',
    remitente: 'jorge.salazar@demo.mailflow.test',
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
    cuerpo: 'Adjunto soporte de pago del mes de noviembre que no aparece reflejado.',
    messageId: '<msg-20@demo.mailflow.test>',
    historial: [
      {
        anterior: null,
        nuevo: 'NUEVA',
        usuario: null,
        comentario: 'Creada automáticamente desde correo',
        fecha: '2026-11-15T11:20:00.000Z',
      },
      {
        anterior: 'NUEVA',
        nuevo: 'ASIGNADA',
        usuario: 'Ana Admin',
        comentario: 'Asignada a Soporte Demo',
        fecha: '2026-11-15T12:00:00.000Z',
      },
    ],
    asignaciones: [
      {
        nombre: 'Camila Torres',
        fechaAsignacion: '2026-11-15T11:40:00.000Z',
        liberadaEn: '2026-11-15T11:55:00.000Z',
      },
      {
        nombre: 'Soporte Demo',
        fechaAsignacion: '2026-11-15T12:00:00.000Z',
        liberadaEn: null,
      },
    ],
    destinos: ['EN_PROCESO', 'NUEVA'],
    sugerencia: null,
  },
  {
    id: 19,
    codigo: 'SOL-000019',
    asunto: 'Portón peatonal abierto en la noche',
    remitente: 'diana.osorio@demo.mailflow.test',
    estado: 'EN_PROCESO',
    categoria: 'SEGURIDAD',
    prioridad: 'ALTA',
    slaHoras: 4,
    version: 3,
    fechaCreacion: '2026-11-14T22:05:00.000Z',
    primeraRespuesta: '2026-11-14T23:00:00.000Z',
    fechaCierre: null,
    responsable: 'Camila Torres',
    idResponsable: 3,
    cuerpo: 'El electroimán del portón peatonal norte queda sin seguro en las noches.',
    messageId: '<msg-19@demo.mailflow.test>',
    historial: [
      {
        anterior: null,
        nuevo: 'NUEVA',
        usuario: null,
        comentario: 'Creada automáticamente desde correo',
        fecha: '2026-11-14T22:05:00.000Z',
      },
      {
        anterior: 'NUEVA',
        nuevo: 'ASIGNADA',
        usuario: 'Ana Admin',
        comentario: 'Asignada a Camila Torres',
        fecha: '2026-11-14T22:30:00.000Z',
      },
      {
        anterior: 'ASIGNADA',
        nuevo: 'EN_PROCESO',
        usuario: 'Camila Torres',
        comentario: 'Técnico en sitio revisando electroimán',
        fecha: '2026-11-14T23:00:00.000Z',
      },
    ],
    asignaciones: [
      {
        nombre: 'Camila Torres',
        fechaAsignacion: '2026-11-14T22:30:00.000Z',
        liberadaEn: null,
      },
    ],
    destinos: ['RESUELTA'],
    sugerencia: {
      estado: 'EN_REINTENTO',
      categoria: null,
      prioridad: null,
      resumen: null,
      justificacion: null,
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-14T22:06:00.000Z',
    },
  },
  {
    id: 15,
    codigo: 'SOL-000015',
    asunto: 'Certificado de paz y salvo',
    remitente: 'andres.leon@demo.mailflow.test',
    estado: 'CERRADA',
    categoria: 'FACTURACION',
    prioridad: 'BAJA',
    slaHoras: 72,
    version: 4,
    fechaCreacion: '2026-11-13T14:10:00.000Z',
    primeraRespuesta: '2026-11-13T16:00:00.000Z',
    fechaCierre: '2026-11-14T10:00:00.000Z',
    responsable: null,
    idResponsable: null,
    cuerpo: 'Necesito certificado de paz y salvo al corte de octubre.',
    messageId: '<msg-15@demo.mailflow.test>',
    historial: [
      {
        anterior: null,
        nuevo: 'NUEVA',
        usuario: null,
        comentario: 'Creada automáticamente desde correo',
        fecha: '2026-11-13T14:10:00.000Z',
      },
      {
        anterior: 'RESUELTA',
        nuevo: 'CERRADA',
        usuario: 'Ana Admin',
        comentario: 'Certificado enviado al residente',
        fecha: '2026-11-14T10:00:00.000Z',
      },
    ],
    asignaciones: [
      {
        nombre: 'Soporte Demo',
        fechaAsignacion: '2026-11-13T15:00:00.000Z',
        liberadaEn: '2026-11-14T10:00:00.000Z',
      },
    ],
    destinos: [],
    sugerencia: null,
  },
];

function ponerSesion(rol: Rol, idUsuario = rol === 'ADMIN' ? 1 : 2) {
  const nombre = rol === 'ADMIN' ? 'Ana Admin' : 'Soporte Demo';
  actorActual = { idUsuario, nombre, rol };
  const sesion: Sesion = {
    usuario: {
      id: String(idUsuario),
      nombre,
      correo: rol === 'ADMIN' ? 'ana@demo.mailflow.test' : 'soporte@demo.mailflow.test',
      rol,
    },
    conjuntoActivo: conjunto,
    conjuntos: [conjunto],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now() });
}

function montar(ruta = '/app/parques/solicitudes', qc?: QueryClient) {
  const queryClient = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/app/:conjunto/solicitudes', element: <SolicitudesPage /> }], {
    initialEntries: [ruta],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="light" containerAriaLabel="Notificaciones" />
    </QueryClientProvider>,
  );
  return { qc: queryClient, router, user: userEvent.setup() };
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
  usuariosReal = crearUsuariosMock({ ...SIN_LATENCIA, iniciales: usuariosBase });
  solicitudesReal = crearSolicitudesMock({
    ...SIN_LATENCIA,
    iniciales: solicitudesBase,
    usuarios: usuariosBase,
    actor: () => actorActual,
  });
  listarSolicitudes.mockClear();
  detalleSolicitud.mockClear();
  asignarSolicitud.mockClear();
  cambiarEstadoSolicitud.mockClear();
  reclasificarSolicitud.mockClear();
  aceptarSugerenciaSolicitud.mockClear();
  listarUsuarios.mockClear();
  ponerSesion('ADMIN', 1);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SolicitudesPage · estados de carga, error, vacío y listado', () => {
  it('muestra EsqueletoCarga mientras carga el listado', () => {
    listarSolicitudes.mockImplementationOnce(() => new Promise(() => {}));
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  });

  it('muestra EstadoError cuando falla la carga del listado y reintenta al pulsar Reintentar', async () => {
    listarSolicitudes.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar();
    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(boton);
    expect(await screen.findByText('SOL-000022')).toBeInTheDocument();
    expect(listarSolicitudes).toHaveBeenCalledTimes(2);
  });

  it('muestra EmptyState cuando no hay solicitudes y cuando los filtros no arrojan resultados', async () => {
    solicitudesReal = crearSolicitudesMock({ ...SIN_LATENCIA, iniciales: [], usuarios: usuariosBase });
    montar();
    expect(await screen.findByText(/no hay solicitudes/i)).toBeInTheDocument();

    cleanup();
    solicitudesReal = crearSolicitudesMock({ ...SIN_LATENCIA, iniciales: solicitudesBase, usuarios: usuariosBase });
    const { user } = montar('/app/parques/solicitudes?estado=RESUELTA');
    expect(await screen.findByText(/no encontramos solicitudes con esos filtros/i)).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /limpiar filtros/i })[0]);
    expect(await screen.findByText('SOL-000022')).toBeInTheDocument();
  });

  it('lista solicitudes en tabla con código, asunto, remitente, insignias, SLA, responsable («Sin asignar») y fecha', async () => {
    montar();
    const tabla = await screen.findByRole('table');
    expect(within(tabla).getByText('SOL-000022')).toBeInTheDocument();
    expect(within(tabla).getByText('Fuga de agua en sótano 1')).toBeInTheDocument();
    expect(within(tabla).getByText('elena.vargas@demo.mailflow.test')).toBeInTheDocument();
    expect(within(tabla).getAllByText('4 h').length).toBeGreaterThanOrEqual(1);
    expect(within(tabla).getAllByText('Sin asignar').length).toBeGreaterThanOrEqual(1);
    expect(within(tabla).getByText('Soporte Demo')).toBeInTheDocument();
    expect(within(tabla).getByText('16 nov 2026')).toBeInTheDocument();

    // Sin break-all agresivo en correos en escritorio
    expect(within(tabla).getByText('elena.vargas@demo.mailflow.test').className).not.toContain('break-all');
  });

  it('pagina usando limite y desplazamiento cuando hay más resultados que el tamaño de página', async () => {
    const muchas: DetalleSolicitud[] = Array.from({ length: 23 }, (_, idx) => ({
      ...solicitudesBase[0],
      id: 200 - idx,
      codigo: `SOL-000${200 - idx}`,
      asunto: `Solicitud paginada ${idx + 1}`,
      fechaCreacion: new Date(Date.UTC(2026, 10, 16, 12, 59 - idx)).toISOString(),
    }));
    solicitudesReal = crearSolicitudesMock({ ...SIN_LATENCIA, iniciales: muchas, usuarios: usuariosBase });
    const { user } = montar();

    expect(await screen.findByText('Solicitud paginada 1')).toBeInTheDocument();
    expect(screen.queryByText('Solicitud paginada 21')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(await screen.findByText('Solicitud paginada 21')).toBeInTheDocument();
    expect(listarSolicitudes).toHaveBeenLastCalledWith(
      expect.objectContaining({ desplazamiento: 20 }),
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole('button', { name: /anterior/i }));
    expect(await screen.findByText('Solicitud paginada 1')).toBeInTheDocument();
  });
});

describe('SolicitudesPage · filtros y parámetros de URL', () => {
  it('lee ?estado= de la URL, permite filtrar por estado/categoría/prioridad/responsable y limpiar filtros', async () => {
    const { user } = montar('/app/parques/solicitudes?estado=NUEVA');
    expect(await screen.findByText('SOL-000022')).toBeInTheDocument();
    expect(screen.queryByText('SOL-000020')).not.toBeInTheDocument();
    expect(listarSolicitudes).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'NUEVA' }),
      expect.any(AbortSignal),
    );

    // Cada selector de filtro tiene su <Label htmlFor>
    const filtros = screen.getByRole('region', { name: /filtros/i });
    const comboEstado = within(filtros).getByRole('combobox', { name: /estado/i });
    const comboCategoria = within(filtros).getByRole('combobox', { name: /categoría/i });
    const comboPrioridad = within(filtros).getByRole('combobox', { name: /prioridad/i });
    const comboResponsable = within(filtros).getByRole('combobox', { name: /responsable/i });
    for (const c of [comboEstado, comboCategoria, comboPrioridad, comboResponsable]) {
      expect(c.id).toBeTruthy();
      expect(document.querySelector(`label[for="${CSS.escape(c.id)}"]`)).toBeTruthy();
    }

    await user.click(within(filtros).getByRole('button', { name: /limpiar filtros/i }));
    expect(await screen.findByText('SOL-000020')).toBeInTheDocument();

    // Filtrar por responsable Camila Torres (id 3)
    await user.click(comboResponsable);
    await user.click(await screen.findByRole('option', { name: /camila torres/i }));
    await waitFor(() =>
      expect(listarSolicitudes).toHaveBeenLastCalledWith(
        expect.objectContaining({ idResponsable: 3 }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByText('SOL-000019')).toBeInTheDocument();
    expect(screen.queryByText('SOL-000022')).not.toBeInTheDocument();
  });

  it('lee ?id=22 de la URL, abre automáticamente el detalle con metadatos, cuerpo y línea de tiempo', async () => {
    const { user } = montar('/app/parques/solicitudes?id=20');
    const dialogo = await screen.findByRole('dialog');
    expect(detalleSolicitud).toHaveBeenCalledWith(20, expect.any(AbortSignal));

    expect(await within(dialogo).findByText('SOL-000020')).toBeInTheDocument();
    expect(within(dialogo).getByText('jorge.salazar@demo.mailflow.test')).toBeInTheDocument();
    expect(within(dialogo).getByText(/24 h/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/Adjunto soporte de pago/)).toBeInTheDocument();
    expect(within(dialogo).getAllByText(/15 nov 2026, 06:20/i).length).toBeGreaterThanOrEqual(1);

    // Línea de tiempo combina HISTORIAL_ESTADOS y ASIGNACIONES en orden cronológico
    const timeline = within(dialogo).getByRole('region', { name: /línea de tiempo/i });
    const items = within(timeline).getAllByRole('listitem');
    expect(items.length).toBe(4);
    expect(items[0]).toHaveTextContent(/Creada automáticamente desde correo/);
    expect(items[1]).toHaveTextContent(/Camila Torres/);
    expect(items[1]).toHaveTextContent(/Liberada:/i);
    expect(items[2]).toHaveTextContent(/Asignada a Soporte Demo/);
    expect(items[2]).toHaveTextContent(/Vigente/i);
    expect(items[3]).toHaveTextContent(/Nueva\s*→\s*Asignada/i);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('muestra EstadoError con Reintentar si falla la carga del detalle y permite reintentar', async () => {
    detalleSolicitud.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar('/app/parques/solicitudes?id=22');
    const dialogo = await screen.findByRole('dialog');
    const reintentar = await within(dialogo).findByRole('button', { name: 'Reintentar' });
    await user.click(reintentar);
    expect(await within(dialogo).findByText(/fuga constante junto a los parqueaderos/i)).toBeInTheDocument();
    expect(detalleSolicitud).toHaveBeenCalledTimes(2);
  });
});

describe('SolicitudesPage · acciones T2, T3, T4, T7→T4, 409 e invalidaciones', () => {
  it('T2 (asignar): solo muestra personal activo, envía versionEsperada, muestra toast e invalida consultas', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');
    const { user } = montar('/app/parques/solicitudes', qc);

    await user.click(await screen.findByRole('button', { name: /SOL-000022/i }));
    const dialogo = await screen.findByRole('dialog');

    const seccionAsignar = within(dialogo).getByRole('region', { name: /asignar responsable/i });
    const selectResp = within(seccionAsignar).getByRole('combobox', { name: /responsable/i });
    await user.click(selectResp);

    // Solo personal activo (Mateo inactivo y Lucía deshabilitada no deben aparecer)
    expect(await screen.findByRole('option', { name: /camila torres/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /mateo rojas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /lucía méndez/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /camila torres/i }));
    await user.click(within(seccionAsignar).getByRole('button', { name: 'Asignar' }));

    expect(asignarSolicitud).toHaveBeenCalledWith(22, { idResponsable: 3, versionEsperada: 1 });
    expect(await screen.findByText(/responsable asignado/i)).toBeInTheDocument();
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'solicitudes') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'solicitudes', 'detalle', 22) });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'correos') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'resumen') });

    // La solicitud ahora está ASIGNADA y habilita destinos ['EN_PROCESO', 'NUEVA']
    await waitFor(() =>
      expect(within(dialogo).getByRole('region', { name: /cambiar estado/i })).toBeInTheDocument(),
    );
  });

  it('T3 (cambiarEstado): solo ofrece destinos válidos (nunca ASIGNADA), envía comentario y versionEsperada', async () => {
    const { user } = montar('/app/parques/solicitudes?id=22');
    const dialogo = await screen.findByRole('dialog');

    // En NUEVA no hay destinos manuales (ASIGNADA no aparece)
    const seccionEstadoNueva = await within(dialogo).findByRole('region', { name: /cambiar estado/i });
    expect(within(seccionEstadoNueva).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(seccionEstadoNueva).getByText(/asigna un responsable/i)).toBeInTheDocument();

    // Cerrar y abrir SOL-000020 (ASIGNADA, destinos: ['EN_PROCESO', 'NUEVA'])
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: /SOL-000020/i }));
    const dialogo20 = await screen.findByRole('dialog');
    const seccionEstado20 = await within(dialogo20).findByRole('region', { name: /cambiar estado/i });
    const selectEstado = within(seccionEstado20).getByRole('combobox', { name: /nuevo estado/i });
    await user.click(selectEstado);

    expect(await screen.findByRole('option', { name: 'En proceso' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nueva' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /asignada/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'En proceso' }));
    await user.type(within(seccionEstado20).getByLabelText(/comentario/i), 'Revisando soporte');
    await user.click(within(seccionEstado20).getByRole('button', { name: /actualizar estado/i }));

    expect(cambiarEstadoSolicitud).toHaveBeenCalledWith(20, {
      nuevoEstado: 'EN_PROCESO',
      versionEsperada: 2,
      comentario: 'Revisando soporte',
    });
    expect(await screen.findByText(/estado actualizado/i)).toBeInTheDocument();
  });

  it('T4 (reclasificar) y T7→T4 (aceptarSugerencia): aplican cambios con versionEsperada e invalidan consultas', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');
    const { user } = montar('/app/parques/solicitudes?id=22', qc);
    const dialogo = await screen.findByRole('dialog');

    // Tarjeta Sugerencia de IA con botón Aceptar sugerencia
    const bloqueIa = await within(dialogo).findByRole('region', { name: /sugerencia de ia/i });
    expect(within(bloqueIa).getByText(/Fuga de agua activa en sótano 1/)).toBeInTheDocument();
    expect(within(bloqueIa).getByText(/openrouter · gpt-4o-mini/i)).toBeInTheDocument();

    await user.click(within(bloqueIa).getByRole('button', { name: /aceptar sugerencia/i }));
    expect(aceptarSugerenciaSolicitud).toHaveBeenCalledWith(22, { versionEsperada: 1 });
    expect(await screen.findByText(/sugerencia de ia aplicada/i)).toBeInTheDocument();
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'solicitudes', 'detalle', 22) });

    // Reclasificar manualmente ahora con versión 2
    const seccionReclas = within(dialogo).getByRole('region', { name: /reclasificar/i });
    await user.click(within(seccionReclas).getByRole('combobox', { name: /categoría/i }));
    await user.click(await screen.findByRole('option', { name: 'Seguridad' }));
    await user.type(within(seccionReclas).getByLabelText(/comentario/i), 'Escalada a seguridad');
    await user.click(within(seccionReclas).getByRole('button', { name: /guardar clasificación/i }));

    expect(reclasificarSolicitud).toHaveBeenCalledWith(22, {
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      versionEsperada: 2,
      comentario: 'Escalada a seguridad',
    });
    expect(await screen.findByText(/clasificación actualizada/i)).toBeInTheDocument();
  });

  it('solicitud CERRADA oculta acciones exclusivas de edición (asignar, reclasificar, aceptar sugerencia)', async () => {
    montar('/app/parques/solicitudes?id=15');
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText('SOL-000015');

    expect(within(dialogo).queryByRole('region', { name: /asignar responsable/i })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('region', { name: /reclasificar/i })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: /aceptar sugerencia/i })).not.toBeInTheDocument();
    expect(within(dialogo).getByText(/cerrada y no admite cambios/i)).toBeInTheDocument();
  });

  it('conflicto 409 en mutación muestra AvisoConflicto con Recargar que refresca versión y detalle', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');
    const { user } = montar('/app/parques/solicitudes?id=22', qc);
    const dialogo = await screen.findByRole('dialog');
    const bloqueIa = await within(dialogo).findByRole('region', { name: /sugerencia de ia/i });
    await within(dialogo).findByText('SOL-000022');
    await waitFor(() => expect(listarSolicitudes).toHaveBeenCalled());

    // Alguien más asignó la solicitud en paralelo: ahora está en versión 2 en el backend
    await solicitudesReal.asignar(22, { idResponsable: 2, versionEsperada: 1 });

    // El cliente todavía tiene version=1 y al intentar aceptarSugerencia recibe 409
    await user.click(within(bloqueIa).getByRole('button', { name: /aceptar sugerencia/i }));

    expect(await within(dialogo).findByText('Otra persona cambió este registro')).toBeInTheDocument();
    const callsAntes = detalleSolicitud.mock.calls.length;
    await user.click(within(dialogo).getByRole('button', { name: /recargar/i }));

    await waitFor(() => expect(detalleSolicitud.mock.calls.length).toBeGreaterThan(callsAntes));
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'solicitudes') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'solicitudes', 'detalle', 22) });
    await waitFor(() =>
      expect(within(dialogo).queryByText('Otra persona cambió este registro')).not.toBeInTheDocument(),
    );

    // Ahora al volver a pulsar Aceptar sugerencia envía la nueva versionEsperada: 2
    await user.click(within(dialogo).getByRole('button', { name: /aceptar sugerencia/i }));
    expect(aceptarSugerenciaSolicitud).toHaveBeenLastCalledWith(22, { versionEsperada: 2 });
    expect(await screen.findByText(/sugerencia de ia aplicada/i)).toBeInTheDocument();
  });

  it('errores 422 y 403 en mutaciones muestran mensajeDeError claro en alerta', async () => {
    const { user } = montar('/app/parques/solicitudes?id=22');
    const dialogo = await screen.findByRole('dialog');

    aceptarSugerenciaSolicitud.mockRejectedValueOnce(new ErrorApi(422, 'No hay una sugerencia lista para aceptar'));
    const bloqueIa = await within(dialogo).findByRole('region', { name: /sugerencia de ia/i });
    await user.click(within(bloqueIa).getByRole('button', { name: /aceptar sugerencia/i }));
    expect(await within(dialogo).findByText('No hay una sugerencia lista para aceptar')).toBeInTheDocument();

    reclasificarSolicitud.mockRejectedValueOnce(new ErrorApi(403, 'Solo un administrador puede reclasificar'));
    const seccionReclas = within(dialogo).getByRole('region', { name: /reclasificar/i });
    await user.click(within(seccionReclas).getByRole('button', { name: /guardar clasificación/i }));
    expect(await within(dialogo).findByText('No tienes permiso para realizar esta acción.')).toBeInTheDocument();
  });
});

describe('SolicitudesPage · rol SOPORTE y vista móvil 375px', () => {
  it('rol SOPORTE no llama usuariosService.listar, no ve filtro responsable ni acciones de ADMIN, pero sí T3', async () => {
    ponerSesion('SOPORTE', 2);
    const { user } = montar();

    // Solo ve su solicitud asignada (SOL-000020)
    expect(await screen.findByText('SOL-000020')).toBeInTheDocument();
    expect(screen.queryByText('SOL-000022')).not.toBeInTheDocument();
    expect(listarUsuarios).not.toHaveBeenCalled();

    const filtros = screen.getByRole('region', { name: /filtros/i });
    expect(within(filtros).queryByRole('combobox', { name: /responsable/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /SOL-000020/i }));
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText(/Adjunto soporte de pago/);

    expect(within(dialogo).queryByRole('region', { name: /asignar responsable/i })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('region', { name: /reclasificar/i })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('button', { name: /aceptar sugerencia/i })).not.toBeInTheDocument();

    // Puede cambiar estado de su solicitud asignada
    const seccionEstado = within(dialogo).getByRole('region', { name: /cambiar estado/i });
    await user.click(within(seccionEstado).getByRole('combobox', { name: /nuevo estado/i }));
    await user.click(await screen.findByRole('option', { name: 'En proceso' }));
    await user.click(within(seccionEstado).getByRole('button', { name: /actualizar estado/i }));
    expect(cambiarEstadoSolicitud).toHaveBeenCalledWith(20, {
      nuevoEstado: 'EN_PROCESO',
      versionEsperada: 2,
      comentario: undefined,
    });
    expect(await screen.findByText(/estado actualizado/i)).toBeInTheDocument();
  });

  it('rol SOPORTE abriendo ?id=22 (no asignada) muestra error de permisos claro (403)', async () => {
    ponerSesion('SOPORTE', 2);
    montar('/app/parques/solicitudes?id=22');
    const dialogo = await screen.findByRole('dialog');
    expect(await within(dialogo).findByText(/no tienes permiso/i)).toBeInTheDocument();
    expect(listarUsuarios).not.toHaveBeenCalled();
  });

  it('en móvil (375px) renderiza tarjetas apiladas sin tabla, controles con max-sm:h-10 y abre Sheet accesible', async () => {
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

    const { user } = montar();
    expect(await screen.findByText('SOL-000022')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const filtros = screen.getByRole('region', { name: /filtros/i });
    expect(within(filtros).getByRole('combobox', { name: /estado/i }).className).toContain('max-sm:h-10');
    expect(within(filtros).getByRole('button', { name: /limpiar filtros/i }).className).toContain('max-sm:h-10');

    await user.click(screen.getByRole('button', { name: /SOL-000022/i }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/fuga constante junto a los parqueaderos/i)).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Asignar' }).className).toContain('max-sm:h-10');
  });
});
