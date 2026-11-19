import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { Toaster } from '@/components/ui/sonner';
import {
  ErrorApi,
  type BuzonService,
  type CorreosService,
  type DetalleCorreoBuzon,
  type EstadoGateway,
} from '@/services/contratos';
import { crearBuzonMock } from '@/services/mock/buzonMock';
import { crearCorreosMock } from '@/services/mock/correosMock';
import type { Conjunto, Rol, Sesion } from '@/types/conjunto';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };

let buzonReal: BuzonService;
let correosReal: CorreosService;

const estadoBuzon = vi.fn((s?: AbortSignal) => buzonReal.estado(s));
const guardarBuzon = vi.fn((e: Parameters<BuzonService['guardar']>[0]) => buzonReal.guardar(e));
const desconectarBuzon = vi.fn((v?: number) => buzonReal.desconectar(v));
const sincronizarBuzon = vi.fn(() => buzonReal.sincronizar());
const listarCorreos = vi.fn((f?: Parameters<CorreosService['listar']>[0], s?: AbortSignal) => correosReal.listar(f, s));
const detalleCorreo = vi.fn((id: number, s?: AbortSignal) => correosReal.detalle(id, s));

vi.mock('@/services', () => ({
  conjuntosService: { listar: vi.fn().mockResolvedValue([]) },
  authService: { sesion: vi.fn().mockResolvedValue(null), salir: vi.fn().mockResolvedValue(undefined) },
  resumenService: { obtener: vi.fn().mockResolvedValue({ porEstado: [], carga: [], respuesta: [] }) },
  usuariosService: { listar: vi.fn().mockResolvedValue([]), agregar: vi.fn(), actualizar: vi.fn() },
  buzonService: {
    estado: (s?: AbortSignal) => estadoBuzon(s),
    guardar: (e: Parameters<BuzonService['guardar']>[0]) => guardarBuzon(e),
    desconectar: (v?: number) => desconectarBuzon(v),
    sincronizar: () => sincronizarBuzon(),
  },
  correosService: {
    listar: (f?: Parameters<CorreosService['listar']>[0], s?: AbortSignal) => listarCorreos(f, s),
    detalle: (id: number, s?: AbortSignal) => detalleCorreo(id, s),
  },
}));

import { clave } from '@/services/claves';
import { useSesion } from '@/store/sesion';
import BandejaPage from './BandejaPage';

const conjunto: Conjunto = { id: 'cj-1', slug: 'parques', nombre: 'Parque Central' };

const gatewayDesconectado: EstadoGateway = {
  cuentas: [],
  totalCorreos: 0,
  ultimoCorreo: null,
  conectado: false,
  buzon: null,
};

const gatewayConectado = (ultimoError: string | null = null): EstadoGateway => ({
  cuentas: [],
  totalCorreos: 4,
  ultimoCorreo: '2026-11-16T14:00:00.000Z',
  conectado: true,
  buzon: {
    correo: 'mesa.ayuda@demo.mailflow.test',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    buzon: 'INBOX',
    diasIniciales: 7,
    marcarLeido: false,
    activo: true,
    ultimaSincronizacion: '2026-11-16T15:30:00.000Z',
    ultimoError,
    version: 1,
  },
});

const correosBase: DetalleCorreoBuzon[] = [
  {
    id: 101,
    remitente: 'elena.vargas@demo.mailflow.test',
    asunto: 'Fuga de agua en el sótano',
    fechaRecepcion: '2026-11-16T14:20:00.000Z',
    idResidente: 10,
    residente: 'Elena Vargas',
    unidad: 'T2-401',
    idSolicitud: 14,
    codigo: 'SOL-000014',
    estado: 'NUEVA',
    categoria: 'MANTENIMIENTO',
    prioridad: 'ALTA',
    sugerenciaEstado: 'LISTA',
    sugerenciaCategoria: 'MANTENIMIENTO',
    cuerpo: 'Buenos días, soy Elena Vargas de T2-401. Hay una fuga grave en el sótano. Tel 3001234567.',
    cuerpoEnmascarado: 'Buenos días, soy [NOMBRE_PROTEGIDO] de [UNIDAD_PROTEGIDA]. Hay una fuga grave en el sótano. Tel [TEL_PROTEGIDO].',
    sugerencia: {
      estado: 'LISTA',
      categoria: 'MANTENIMIENTO',
      prioridad: 'ALTA',
      resumen: 'Fuga de agua en zona común del sótano.',
      justificacion: 'Reporta fuga activa en zona hidráulica.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-16T14:21:00.000Z',
    },
  },
  {
    id: 102,
    remitente: 'visitante@demo.mailflow.test',
    asunto: 'Consulta sobre salón social',
    fechaRecepcion: '2026-11-16T12:00:00.000Z',
    idResidente: null,
    residente: null,
    unidad: null,
    idSolicitud: 15,
    codigo: 'SOL-000015',
    estado: 'EN_PROCESO',
    categoria: 'ADMINISTRATIVO',
    prioridad: 'MEDIA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo: 'Quisiera saber el costo del alquiler del salón social para diciembre.',
    cuerpoEnmascarado: 'Quisiera saber el costo del alquiler del salón social para diciembre.',
    sugerencia: null,
  },
];

function ponerSesion(rol: Rol) {
  const sesion: Sesion = {
    usuario: { id: '1', nombre: 'Ana Pérez', correo: 'ana@demo.mailflow.test', rol },
    conjuntoActivo: conjunto,
    conjuntos: [conjunto],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now() });
}

function montar(qc?: QueryClient) {
  const queryClient = qc ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/app/:conjunto/bandeja', element: <BandejaPage /> }], {
    initialEntries: ['/app/parques/bandeja'],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="light" containerAriaLabel="Notificaciones" />
    </QueryClientProvider>,
  );
  return { qc: queryClient, user: userEvent.setup() };
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
  buzonReal = crearBuzonMock({ ...SIN_LATENCIA, estadoInicial: gatewayConectado() });
  correosReal = crearCorreosMock({ ...SIN_LATENCIA, iniciales: correosBase });
  estadoBuzon.mockClear();
  guardarBuzon.mockClear();
  desconectarBuzon.mockClear();
  sincronizarBuzon.mockClear();
  listarCorreos.mockClear();
  detalleCorreo.mockClear();
  ponerSesion('ADMIN');
});

afterEach(() => {
  cleanup();
});

describe('BandejaPage · estados de carga, error y vacío', () => {
  it('muestra EsqueletoCarga mientras carga', () => {
    estadoBuzon.mockImplementationOnce(() => new Promise(() => {}));
    listarCorreos.mockImplementationOnce(() => new Promise(() => {}));
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  });

  it('muestra EstadoError cuando falla la carga de correos y reintenta al pulsar Reintentar', async () => {
    listarCorreos.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar();
    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(boton);
    expect(await screen.findByText('Fuga de agua en el sótano')).toBeInTheDocument();
    expect(listarCorreos).toHaveBeenCalledTimes(2);
  });

  it('muestra EstadoError cuando falla estado del buzón y reintenta al pulsar Reintentar', async () => {
    estadoBuzon.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar();
    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(boton);
    expect(await screen.findByText('mesa.ayuda@demo.mailflow.test')).toBeInTheDocument();
    expect(estadoBuzon).toHaveBeenCalledTimes(2);
  });

  it('muestra EstadoError cuando falla la carga del detalle y reintenta al pulsar Reintentar', async () => {
    detalleCorreo.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const { user } = montar();
    await user.click(await screen.findByRole('button', { name: /fuga de agua en el sótano/i }));

    const panelDetalle = await screen.findByRole('region', { name: /detalle del correo/i });
    const boton = await within(panelDetalle).findByRole('button', { name: 'Reintentar' });
    await user.click(boton);

    expect(await within(panelDetalle).findByText(/Buenos días, soy Elena Vargas de T2-401/)).toBeInTheDocument();
    expect(detalleCorreo).toHaveBeenCalledTimes(2);
  });

  it('muestra EmptyState cuando la bandeja no tiene correos y cuando una búsqueda no da resultados', async () => {
    correosReal = crearCorreosMock({ ...SIN_LATENCIA, iniciales: [] });
    const { user } = montar();
    expect(await screen.findByText(/la bandeja está vacía/i)).toBeInTheDocument();

    correosReal = crearCorreosMock({ ...SIN_LATENCIA, iniciales: correosBase });
    cleanup();
    const { user: user2 } = montar();
    await screen.findByText('Fuga de agua en el sótano');
    const buscador = screen.getByRole('searchbox', { name: /buscar correos/i });
    await user2.type(buscador, 'inexistente{Enter}');
    expect(await screen.findByText(/no encontramos correos/i)).toBeInTheDocument();
    await user2.click(screen.getByRole('button', { name: /limpiar búsqueda/i }));
    expect(await screen.findByText('Fuga de agua en el sótano')).toBeInTheDocument();
    expect(user).toBeTruthy();
  });
});

describe('BandejaPage · estado del buzón, conectar, desconectar y sincronizar', () => {
  it('cuando está desconectado: ADMIN ve botón «Conectar buzón de Gmail»; SOPORTE ve aviso informativo sin acciones admin', async () => {
    buzonReal = crearBuzonMock({ ...SIN_LATENCIA, estadoInicial: gatewayDesconectado });
    montar();
    expect(await screen.findByRole('button', { name: /conectar buzón de gmail/i })).toBeInTheDocument();

    cleanup();
    ponerSesion('SOPORTE');
    montar();
    expect(await screen.findByText(/la administración/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /conectar buzón/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sincronizar ahora/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desconectar/i })).not.toBeInTheDocument();
  });

  it.each([
    ['AUTENTICACION', /contraseña de aplicación/i],
    ['CERTIFICADO', /certificado/i],
    ['CONEXION', /conectar con el servidor/i],
    ['CLAVE', /descifrar|vuelve a conectar/i],
    ['INTERNO', /error interno/i],
  ] as const)('muestra alerta clara para ultimoError=%s con «Reconectar buzón» para ADMIN', async (codigo, patron) => {
    buzonReal = crearBuzonMock({ ...SIN_LATENCIA, estadoInicial: gatewayConectado(codigo) });
    montar();
    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText(patron)).toBeInTheDocument();
    expect(within(alerta).getByRole('button', { name: /reconectar buzón/i })).toBeInTheDocument();

    cleanup();
    ponerSesion('SOPORTE');
    montar();
    const alertaSoporte = await screen.findByRole('alert');
    expect(within(alertaSoporte).getByText(patron)).toBeInTheDocument();
    expect(within(alertaSoporte).queryByRole('button', { name: /reconectar buzón/i })).not.toBeInTheDocument();
  });

  it('cuando está conectado muestra correo, fecha de última sincronización, carpeta y acciones según rol', async () => {
    montar();
    const estadoBuzonSeccion = await screen.findByRole('region', { name: /estado del buzón/i });
    expect(await within(estadoBuzonSeccion).findByText('mesa.ayuda@demo.mailflow.test')).toBeInTheDocument();
    expect(within(estadoBuzonSeccion).getByText(/INBOX/)).toBeInTheDocument();
    expect(within(estadoBuzonSeccion).getByText(/16 nov 2026/i)).toBeInTheDocument();
    expect(within(estadoBuzonSeccion).getByRole('button', { name: /sincronizar ahora/i })).toBeInTheDocument();
    expect(within(estadoBuzonSeccion).getByRole('button', { name: /configurar \/ reconectar/i })).toBeInTheDocument();
    expect(within(estadoBuzonSeccion).getByRole('button', { name: /desconectar/i })).toBeInTheDocument();

    cleanup();
    ponerSesion('SOPORTE');
    montar();
    expect(await screen.findByRole('button', { name: /sincronizar ahora/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desconectar/i })).not.toBeInTheDocument();
  });

  it('diálogo «Conectar buzón de Gmail»: valida con Zod en español, retorna el foco al cerrar y conecta en camino feliz', async () => {
    buzonReal = crearBuzonMock({ ...SIN_LATENCIA, estadoInicial: gatewayDesconectado });
    const { user } = montar();

    const botonAbrir = await screen.findByRole('button', { name: /conectar buzón de gmail/i });
    await user.click(botonAbrir);

    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/contraseñas de aplicaciones/i)).toBeInTheDocument();

    // Validación Zod en español
    await user.click(within(dialogo).getByRole('button', { name: /guardar y conectar/i }));
    expect(await within(dialogo).findByText(/escribe el correo/i)).toBeInTheDocument();
    expect(within(dialogo).getByText(/escribe la contraseña/i)).toBeInTheDocument();

    await user.type(within(dialogo).getByLabelText(/correo de gmail/i), 'mal-correo');
    await user.type(within(dialogo).getByLabelText(/contraseña de aplicación/i), 'abcd efgh ijkl mnop');
    await user.click(within(dialogo).getByRole('button', { name: /guardar y conectar/i }));
    expect(await within(dialogo).findByText(/correo válido/i)).toBeInTheDocument();
    expect(guardarBuzon).not.toHaveBeenCalled();

    // Retorno de foco al cerrar con Escape y con Cancelar
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonAbrir).toHaveFocus();

    await user.click(botonAbrir);
    const dlgCancelar = await screen.findByRole('dialog');
    await user.click(within(dlgCancelar).getByRole('button', { name: /cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(botonAbrir).toHaveFocus();

    // Camino feliz con opciones avanzadas
    await user.click(botonAbrir);
    const dlg2 = await screen.findByRole('dialog');
    await user.type(within(dlg2).getByLabelText(/correo de gmail/i), 'nuevo@demo.mailflow.test');
    await user.type(within(dlg2).getByLabelText(/contraseña de aplicación/i), 'abcd efgh ijkl mnop');
    await user.click(within(dlg2).getByRole('button', { name: /opciones avanzadas/i }));
    const switchLeido = within(dlg2).getByRole('switch', { name: /marcar correos como leídos/i });
    expect(switchLeido.id).toBeTruthy();
    expect(dlg2.querySelector(`label[for="${CSS.escape(switchLeido.id)}"]`)).toBeTruthy();
    await user.click(switchLeido);

    await user.click(within(dlg2).getByRole('button', { name: /guardar y conectar/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(guardarBuzon).toHaveBeenCalledWith(
      expect.objectContaining({
        correo: 'nuevo@demo.mailflow.test',
        contrasena: 'abcdefghijklmnop',
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        buzon: 'INBOX',
        diasIniciales: 7,
        marcarLeido: true,
      }),
    );
    expect(await screen.findByText('nuevo@demo.mailflow.test')).toBeInTheDocument();
    expect(await screen.findByText(/buzón conectado/i)).toBeInTheDocument();
  });

  it('diálogo «Conectar buzón de Gmail»: muestra error 422 y conflicto 409 sin cerrar el diálogo, enviando versionEsperada', async () => {
    const { user } = montar();
    const botonConfig = await screen.findByRole('button', { name: /configurar \/ reconectar/i });
    await user.click(botonConfig);

    const dialogo = await screen.findByRole('dialog');
    await user.type(within(dialogo).getByLabelText(/contraseña de aplicación/i), 'invalida');
    await user.click(within(dialogo).getByRole('button', { name: /guardar y conectar/i }));

    expect(await within(dialogo).findByText(/rechazó el inicio de sesión/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    guardarBuzon.mockRejectedValueOnce(new ErrorApi(409, 'El buzón cambió (versión 2, se esperaba 1). Recárguelo.'));
    await user.clear(within(dialogo).getByLabelText(/contraseña de aplicación/i));
    await user.type(within(dialogo).getByLabelText(/contraseña de aplicación/i), 'abcd efgh ijkl mnop');
    await user.click(within(dialogo).getByRole('button', { name: /guardar y conectar/i }));

    expect(guardarBuzon).toHaveBeenLastCalledWith(expect.objectContaining({ versionEsperada: 1 }));
    expect(await within(dialogo).findByText('Otra persona cambió este registro')).toBeInTheDocument();
    await user.click(within(dialogo).getByRole('button', { name: /recargar/i }));
    await waitFor(() => expect(within(dialogo).queryByText('Otra persona cambió este registro')).not.toBeInTheDocument());
  });

  it('desconectar buzón exige confirmación AlertDialog y maneja éxito y 409', async () => {
    const { user } = montar();
    await user.click(await screen.findByRole('button', { name: /desconectar/i }));

    const alerta = await screen.findByRole('alertdialog');
    await user.click(within(alerta).getByRole('button', { name: /cancelar/i }));
    expect(desconectarBuzon).not.toHaveBeenCalled();

    desconectarBuzon.mockRejectedValueOnce(new ErrorApi(409, 'El buzón cambió. Recárguelo.'));
    await user.click(screen.getByRole('button', { name: /desconectar/i }));
    const alerta2 = await screen.findByRole('alertdialog');
    await user.click(within(alerta2).getByRole('button', { name: /confirmar/i }));
    expect(await screen.findByText('Otra persona cambió este registro')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /recargar/i }));
    await waitFor(() => expect(screen.queryByText('Otra persona cambió este registro')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /desconectar/i }));
    const alerta3 = await screen.findByRole('alertdialog');
    await user.click(within(alerta3).getByRole('button', { name: /confirmar/i }));

    expect(desconectarBuzon).toHaveBeenLastCalledWith(1);
    expect(await screen.findByRole('button', { name: /conectar buzón de gmail/i })).toBeInTheDocument();
    expect(await screen.findByText(/buzón desconectado/i)).toBeInTheDocument();
  });

  it('«Sincronizar ahora» muestra toast con nuevos/revisados, invalida consultas y maneja 409 / 422', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spyInvalidar = vi.spyOn(qc, 'invalidateQueries');
    const { user } = montar(qc);

    await user.click(await screen.findByRole('button', { name: /sincronizar ahora/i }));
    expect(sincronizarBuzon).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/1 nuevo.*3 revisados|3 revisados.*1 nuevo/i)).toBeInTheDocument();

    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'correos') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'buzon', 'estado') });
    expect(spyInvalidar).toHaveBeenCalledWith({ queryKey: clave('cj-1', 'resumen') });

    sincronizarBuzon.mockRejectedValueOnce(new ErrorApi(409, 'Ya hay una sincronización en curso para este conjunto'));
    await user.click(screen.getByRole('button', { name: /sincronizar ahora/i }));
    expect(await screen.findByText(/ya hay una sincronización en curso/i)).toBeInTheDocument();

    sincronizarBuzon.mockRejectedValueOnce(new ErrorApi(422, 'El conjunto no tiene un buzón conectado'));
    await user.click(screen.getByRole('button', { name: /sincronizar ahora/i }));
    expect(await screen.findByText(/no tiene un buzón conectado/i)).toBeInTheDocument();

    cleanup();
    ponerSesion('SOPORTE');
    montar();
    await user.click(await screen.findByRole('button', { name: /sincronizar ahora/i }));
    expect(sincronizarBuzon).toHaveBeenCalledTimes(4);
  });
});

describe('BandejaPage · lista, búsqueda, paginación, detalle, Ley 1581 y móvil 375px', () => {
  it('lista correos con residente/unidad, «Sin residente vinculado», insignias y enlace; conmuta Texto original / Texto enmascarado (Ley 1581)', async () => {
    const { user } = montar();

    expect(await screen.findByText('Fuga de agua en el sótano')).toBeInTheDocument();
    expect(screen.getByText('Elena Vargas')).toBeInTheDocument();
    expect(screen.getByText('T2-401')).toBeInTheDocument();
    expect(screen.getByText('Sin residente vinculado')).toBeInTheDocument();
    expect(screen.getByText('SOL-000014')).toBeInTheDocument();
    expect(screen.getByText('Sugerencia IA')).toBeInTheDocument();

    // Seleccionar primer correo (con residente y sugerencia IA)
    await user.click(screen.getByRole('button', { name: /fuga de agua en el sótano/i }));
    expect(detalleCorreo).toHaveBeenCalledWith(101, expect.any(AbortSignal));

    const panelDetalle = await screen.findByRole('region', { name: /detalle del correo/i });
    expect(within(panelDetalle).getByText(/Buenos días, soy Elena Vargas de T2-401/)).toBeInTheDocument();
    expect(within(panelDetalle).getByText(/Fuga de agua en zona común del sótano\./)).toBeInTheDocument();
    expect(within(panelDetalle).getByText(/openrouter · gpt-4o-mini/i)).toBeInTheDocument();

    const enlaceSolicitud = within(panelDetalle).getByRole('link', { name: /SOL-000014/i });
    expect(enlaceSolicitud).toHaveAttribute('href', '/app/parques/solicitudes?id=14');

    const switchLey = within(panelDetalle).getByRole('switch', { name: /texto enmascarado \(ley 1581\)/i });
    expect(switchLey.id).toBeTruthy();
    expect(panelDetalle.querySelector(`label[for="${CSS.escape(switchLey.id)}"]`)).toBeTruthy();
    expect(switchLey).not.toBeChecked();

    await user.click(switchLey);
    expect(switchLey).toBeChecked();
    expect(within(panelDetalle).getByText(/\[NOMBRE_PROTEGIDO\]/)).toBeInTheDocument();
    expect(within(panelDetalle).queryByText(/3001234567/)).not.toBeInTheDocument();

    // Seleccionar segundo correo (sin residente vinculado, sin sugerencia IA)
    await user.click(screen.getByRole('button', { name: /consulta sobre salón social/i }));
    expect(await within(panelDetalle).findByText(/alquiler del salón social/i)).toBeInTheDocument();
    expect(within(panelDetalle).queryByRole('region', { name: /sugerencia de ia/i })).not.toBeInTheDocument();
  });

  it('busca por texto (q) y pagina usando limite/desplazamiento', async () => {
    const muchos: DetalleCorreoBuzon[] = Array.from({ length: 12 }, (_, idx) => ({
      ...correosBase[0],
      id: 200 + idx,
      asunto: `Correo paginado ${idx + 1}`,
      fechaRecepcion: new Date(Date.UTC(2026, 10, 16, 12, 59 - idx)).toISOString(),
      idSolicitud: 500 + idx,
      codigo: `SOL-000${500 + idx}`,
    }));
    correosReal = crearCorreosMock({ ...SIN_LATENCIA, iniciales: muchos });
    const { user } = montar();

    expect(await screen.findByText('Correo paginado 1')).toBeInTheDocument();
    expect(screen.queryByText('Correo paginado 11')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(await screen.findByText('Correo paginado 11')).toBeInTheDocument();
    expect(listarCorreos).toHaveBeenLastCalledWith(
      expect.objectContaining({ limite: 10, desplazamiento: 10 }),
      expect.any(AbortSignal),
    );

    await user.click(screen.getByRole('button', { name: /anterior/i }));
    expect(await screen.findByText('Correo paginado 1')).toBeInTheDocument();

    const buscador = screen.getByRole('searchbox', { name: /buscar correos/i });
    await user.type(buscador, 'paginado 12');
    expect(await screen.findByText('Correo paginado 12')).toBeInTheDocument();
    expect(listarCorreos).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'paginado 12', limite: 10, desplazamiento: 0 }),
      expect.any(AbortSignal),
    );
  });

  it('en móvil (375px) abre el detalle en Sheet y respeta altura táctil max-sm:h-10', async () => {
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
    const botonSincronizar = await screen.findByRole('button', { name: /sincronizar ahora/i });
    expect(botonSincronizar.className).toContain('max-sm:h-10');
    expect(screen.getByRole('searchbox', { name: /buscar correos/i }).className).toContain('max-sm:h-10');

    await user.click(await screen.findByRole('button', { name: /fuga de agua en el sótano/i }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Buenos días, soy Elena Vargas de T2-401/)).toBeInTheDocument();

    await user.click(within(sheet).getByRole('switch', { name: /texto enmascarado \(ley 1581\)/i }));
    expect(within(sheet).getByText(/\[NOMBRE_PROTEGIDO\]/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
