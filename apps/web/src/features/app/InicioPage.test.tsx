import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, type EstadoGateway, type ResumenConjunto, type UsuarioConjunto } from '@/services/contratos';
import type { Conjunto, Rol, Sesion } from '@/types/conjunto';
import { PALETA_PARQUES } from '@/tema/paletas';

const obtenerResumen = vi.fn();
const obtenerEstadoBuzon = vi.fn();
const listarUsuarios = vi.fn();

vi.mock('@/services', () => ({
  conjuntosService: { listar: vi.fn().mockResolvedValue([]) },
  authService: { sesion: vi.fn().mockResolvedValue(null), salir: vi.fn().mockResolvedValue(undefined) },
  resumenService: { obtener: (s?: AbortSignal) => obtenerResumen(s) },
  buzonService: { estado: (s?: AbortSignal) => obtenerEstadoBuzon(s) },
  usuariosService: {
    listar: (f?: unknown, s?: AbortSignal) => listarUsuarios(f, s),
    agregar: vi.fn(),
    actualizar: vi.fn(),
  },
}));

import { useSesion } from '@/store/sesion';
import InicioPage from './InicioPage';

const conjuntoSinIdentidad: Conjunto = { id: '1', slug: 'nogal', nombre: 'Altos del Nogal' };
const conjuntoConPaleta: Conjunto = { id: '2', slug: 'parques', nombre: 'Parque Central', paleta: PALETA_PARQUES };
const conjuntoConLogo: Conjunto = { id: '3', slug: 'pinos', nombre: 'Los Pinos', logoUrl: 'https://cdn.example/logo.png' };

const resumenVacio: ResumenConjunto = {
  porEstado: [
    { estado: 'NUEVA', n: 0 },
    { estado: 'ASIGNADA', n: 0 },
    { estado: 'EN_PROCESO', n: 0 },
    { estado: 'RESUELTA', n: 0 },
    { estado: 'CERRADA', n: 0 },
  ],
  carga: [],
  respuesta: [],
};

const resumenConDatos: ResumenConjunto = {
  porEstado: [
    { estado: 'NUEVA', n: 3 },
    { estado: 'ASIGNADA', n: 2 },
    { estado: 'EN_PROCESO', n: 4 },
    { estado: 'RESUELTA', n: 7 },
    { estado: 'CERRADA', n: 5 },
  ],
  carga: [{ idUsuario: 2, nombre: 'Camila Torres', abiertas: 4 }],
  respuesta: [{ categoria: 'MANTENIMIENTO', total: 6, minutosPromedio: 90, dentroSla: 5 }],
};

const gatewayDesconectado: EstadoGateway = {
  cuentas: [],
  totalCorreos: 0,
  ultimoCorreo: null,
  conectado: false,
  buzon: null,
};

const gatewayConectado = (ultimoError: string | null = null): EstadoGateway => ({
  cuentas: [],
  totalCorreos: 21,
  ultimoCorreo: '2026-11-15T14:00:00.000Z',
  conectado: true,
  buzon: {
    correo: 'mesa@demo.mailflow.test',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    buzon: 'INBOX',
    diasIniciales: 7,
    marcarLeido: false,
    activo: true,
    ultimaSincronizacion: '2026-11-15T15:00:00.000Z',
    ultimoError,
    version: 1,
  },
});

const unUsuario: UsuarioConjunto[] = [
  { id: 1, nombre: 'Ana Admin', correo: 'ana@demo.mailflow.test', rol: 'ADMIN', activo: true, version: 1, cuentaActiva: true },
];

const dosUsuarios: UsuarioConjunto[] = [
  ...unUsuario,
  { id: 2, nombre: 'Camila Torres', correo: 'camila@demo.mailflow.test', rol: 'SOPORTE', activo: true, version: 1, cuentaActiva: true },
];

function ponerSesion(rol: Rol, activo: Conjunto = conjuntoSinIdentidad) {
  const sesion: Sesion = {
    usuario: { id: '1', nombre: 'Ana Pérez', correo: 'ana@demo.mailflow.test', rol },
    conjuntoActivo: activo,
    conjuntos: [activo],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now() });
}

function montar() {
  const router = createMemoryRouter([{ path: '/app/:conjunto/inicio', element: <InicioPage /> }], {
    initialEntries: ['/app/nogal/inicio'],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { qc };
}

beforeEach(() => {
  obtenerResumen.mockReset();
  obtenerEstadoBuzon.mockReset();
  listarUsuarios.mockReset();
  obtenerResumen.mockResolvedValue(resumenConDatos);
  obtenerEstadoBuzon.mockResolvedValue(gatewayDesconectado);
  listarUsuarios.mockResolvedValue(unUsuario);
});

afterEach(() => {
  cleanup();
});

describe('InicioPage · Primeros pasos', () => {
  it('muestra saludo y 0 de 4 completados cuando buzón, identidad y personal están pendientes', async () => {
    ponerSesion('ADMIN', conjuntoSinIdentidad);
    montar();
    expect(screen.getByRole('heading', { name: /ana/i })).toBeInTheDocument();
    expect(await screen.findByText('0 de 4 completados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /conectar buzón/i })).toHaveAttribute('href', '/app/nogal/bandeja');
    expect(screen.getByRole('link', { name: /personalizar/i })).toHaveAttribute('href', '/app/nogal/identidad');
    expect(screen.getByRole('link', { name: /invitar usuarios/i })).toHaveAttribute('href', '/app/nogal/usuarios');
    expect(screen.getByRole('link', { name: /cargar residentes/i })).toHaveAttribute('href', '/app/nogal/residentes');
  });

  it('marca buzón, identidad (paleta o logo) y personal (>1 miembro activo) como completados con «Completado» y enlace «Ver»; residentes queda pendiente', async () => {
    obtenerEstadoBuzon.mockResolvedValue(gatewayConectado());
    listarUsuarios.mockResolvedValue(dosUsuarios);
    ponerSesion('ADMIN', conjuntoConPaleta);
    montar();

    expect(await screen.findByText('3 de 4 completados')).toBeInTheDocument();
    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '3');

    const pasos = screen.getByRole('region', { name: /primeros pasos/i });
    const listaPasos = within(pasos).getAllByRole('listitem');
    expect(listaPasos).toHaveLength(4);

    // Buzón, Identidad y Personal hechos; Residentes pendiente
    expect(within(listaPasos[0]).getByRole('img', { name: 'Completado' })).toBeInTheDocument();
    expect(within(listaPasos[0]).getByRole('link', { name: /ver/i })).toHaveAttribute('href', '/app/parques/bandeja');
    expect(within(listaPasos[1]).getByRole('img', { name: 'Completado' })).toBeInTheDocument();
    expect(within(listaPasos[1]).getByRole('link', { name: /ver/i })).toHaveAttribute('href', '/app/parques/identidad');
    expect(within(listaPasos[2]).getByRole('img', { name: 'Completado' })).toBeInTheDocument();
    expect(within(listaPasos[2]).getByRole('link', { name: /ver/i })).toHaveAttribute('href', '/app/parques/usuarios');

    expect(within(listaPasos[3]).getByRole('img', { name: 'Pendiente' })).toBeInTheDocument();
    expect(within(listaPasos[3]).getByRole('link', { name: /cargar residentes/i })).toBeInTheDocument();
  });

  it('marca identidad hecha cuando el conjunto tiene logoUrl aunque no tenga paleta', async () => {
    ponerSesion('ADMIN', conjuntoConLogo);
    montar();
    expect(await screen.findByText('1 de 4 completados')).toBeInTheDocument();
  });

  it('SOPORTE no llama a usuariosService.listar y solo ve hechos los pasos que puede conocer', async () => {
    obtenerEstadoBuzon.mockResolvedValue(gatewayConectado('AUTENTICACION'));
    ponerSesion('SOPORTE', conjuntoConPaleta);
    montar();

    expect(await screen.findByText('2 de 4 completados')).toBeInTheDocument();
    expect(listarUsuarios).not.toHaveBeenCalled();

    const pasos = screen.getByRole('region', { name: /primeros pasos/i });
    const listaPasos = within(pasos).getAllByRole('listitem');
    // Buzón e Identidad hechos, Personal y Residentes pendientes de la administración
    expect(within(listaPasos[0]).getByRole('img', { name: 'Completado' })).toBeInTheDocument();
    expect(within(listaPasos[1]).getByRole('img', { name: 'Completado' })).toBeInTheDocument();
    expect(within(listaPasos[2]).getByText('Pendiente de la administración')).toBeInTheDocument();
    expect(within(listaPasos[3]).getByText('Pendiente de la administración')).toBeInTheDocument();

    // SOPORTE no ve el aviso administrativo del buzón
    expect(screen.queryByText(/el buzón necesita atención/i)).not.toBeInTheDocument();
  });
});

describe('InicioPage · aviso de error del buzón', () => {
  it.each([
    ['AUTENTICACION', /contraseña de aplicación/i],
    ['CERTIFICADO', /certificado/i],
    ['CONEXION', /conectar con el servidor/i],
    ['CLAVE', /descifrar|contraseña guardada|volver a conectar/i],
    ['INTERNO', /error interno/i],
  ] as const)('ADMIN ve aviso para %s con enlace a bandeja', async (codigo, patron) => {
    obtenerEstadoBuzon.mockResolvedValue(gatewayConectado(codigo));
    ponerSesion('ADMIN', conjuntoConPaleta);
    montar();

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByText(/el buzón necesita atención/i)).toBeInTheDocument();
    expect(within(alerta).getByText(patron)).toBeInTheDocument();
    expect(within(alerta).getByRole('link')).toHaveAttribute('href', '/app/parques/bandeja');
  });
});

describe('InicioPage · Resumen', () => {
  it('muestra EsqueletoCarga mientras carga el resumen', () => {
    obtenerResumen.mockReturnValue(new Promise(() => {}));
    ponerSesion('ADMIN', conjuntoConPaleta);
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
  });

  it('muestra EstadoError cuando falla y reintenta al pulsar Reintentar', async () => {
    obtenerResumen.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    ponerSesion('ADMIN', conjuntoConPaleta);
    const user = userEvent.setup();
    montar();

    const boton = await screen.findByRole('button', { name: 'Reintentar' });
    await user.click(boton);

    expect(await screen.findByText('1 h 30 min')).toBeInTheDocument();
    expect(obtenerResumen).toHaveBeenCalledTimes(2);
  });

  it('muestra estado vacío invitando a conectar el buzón cuando no hay solicitudes', async () => {
    obtenerResumen.mockResolvedValue(resumenVacio);
    ponerSesion('ADMIN', conjuntoSinIdentidad);
    montar();

    const seccion = screen.getByRole('region', { name: /resumen/i });
    expect(await within(seccion).findByText(/sin solicitudes todavía/i)).toBeInTheDocument();
    expect(within(seccion).getByText(/conecta el buzón/i)).toBeInTheDocument();
    expect(within(seccion).getByRole('link', { name: /conectar buzón/i })).toHaveAttribute('href', '/app/nogal/bandeja');
  });

  it('muestra cifras por estado enlazadas a solicitudes, tiempos SLA y carga de soporte', async () => {
    ponerSesion('ADMIN', conjuntoConPaleta);
    montar();

    const seccion = screen.getByRole('region', { name: /resumen/i });
    const enlacesSolicitudes = await within(seccion).findAllByRole('link');
    expect(enlacesSolicitudes.some((a) => a.getAttribute('href')?.startsWith('/app/parques/solicitudes'))).toBe(true);

    expect(within(seccion).getByText('Nueva')).toBeInTheDocument();
    expect(within(seccion).getByText('3')).toBeInTheDocument();
    expect(within(seccion).getByText('1 h 30 min')).toBeInTheDocument();
    expect(within(seccion).getByText(/5 de 6 dentro de sla/i)).toBeInTheDocument();
    expect(within(seccion).getByText('Camila Torres')).toBeInTheDocument();
    expect(within(seccion).getByText(/4 abiertas/i)).toBeInTheDocument();
  });
});
