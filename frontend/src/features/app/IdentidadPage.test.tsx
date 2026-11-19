import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  ErrorApi,
  type ConjuntoIdentidad,
  type EntradaIdentidadConjunto,
  type IdentidadService,
} from '@/services/contratos';
import { crearEstadoPanelMock } from '@/services/mock/estadoCompartido';
import { crearIdentidadMock } from '@/services/mock/identidadMock';
import { PALETA_MAILFLOW, PALETA_PARQUES } from '@/tema/paletas';
import type { Conjunto, Sesion } from '@/types/conjunto';

const SIN_LATENCIA = { latenciaMs: [0, 0] as [number, number] };

let identidadReal: IdentidadService;
const obtenerIdentidad = vi.fn((s?: AbortSignal) => identidadReal.obtener(s));
const actualizarIdentidad = vi.fn((e: EntradaIdentidadConjunto) => identidadReal.actualizar(e));
const aplicarTema = vi.fn();

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
  identidadService: {
    obtener: (s?: AbortSignal) => obtenerIdentidad(s),
    actualizar: (e: EntradaIdentidadConjunto) => actualizarIdentidad(e),
  },
  catalogosService: { obtener: vi.fn() },
}));

vi.mock('@/tema/aplicarTema', () => ({
  aplicarTema: (...args: unknown[]) => aplicarTema(...args),
}));

import { clave } from '@/services/claves';
import { useSesion } from '@/store/sesion';
import IdentidadPage from './IdentidadPage';

const conjuntoInicial: ConjuntoIdentidad = {
  id: 'cj-parques',
  slug: 'parque-central-occidente',
  nombre: 'Parque Central de Occidente',
  logoUrl: 'https://cdn.demo.mailflow.test/logo.png',
  paleta: { ...PALETA_PARQUES },
  version: 1,
};

const otroConjunto: Conjunto = {
  id: 'cj-nogal',
  slug: 'altos-del-nogal',
  nombre: 'Altos del Nogal',
};

function ponerSesionAdmin(activo: Conjunto = conjuntoInicial) {
  const sesion: Sesion = {
    usuario: { id: 'us-admin', nombre: 'Ana Admin', correo: 'admin@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: {
      id: activo.id,
      slug: activo.slug,
      nombre: activo.nombre,
      ...(activo.logoUrl ? { logoUrl: activo.logoUrl } : {}),
      ...(activo.paleta ? { paleta: { ...activo.paleta } } : {}),
    },
    conjuntos: [
      {
        id: activo.id,
        slug: activo.slug,
        nombre: activo.nombre,
        ...(activo.logoUrl ? { logoUrl: activo.logoUrl } : {}),
        ...(activo.paleta ? { paleta: { ...activo.paleta } } : {}),
      },
      otroConjunto,
    ],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now(), generacion: 1 });
}

function montar() {
  const router = createMemoryRouter([{ path: '/app/:conjunto/identidad', element: <IdentidadPage /> }], {
    initialEntries: ['/app/parque-central-occidente/identidad'],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
      <Toaster theme="light" containerAriaLabel="Notificaciones" />
    </QueryClientProvider>,
  );
  return { qc, invalidateSpy };
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(() => {
  const estado = crearEstadoPanelMock({
    conjuntos: [structuredClone(conjuntoInicial), { ...otroConjunto, version: 1 }],
  });
  identidadReal = crearIdentidadMock({ ...SIN_LATENCIA, estado, conjuntoId: 'cj-parques' });
  obtenerIdentidad.mockReset();
  obtenerIdentidad.mockImplementation((s?: AbortSignal) => identidadReal.obtener(s));
  actualizarIdentidad.mockReset();
  actualizarIdentidad.mockImplementation((e: EntradaIdentidadConjunto) => identidadReal.actualizar(e));
  aplicarTema.mockReset();
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  ponerSesionAdmin();
});

afterEach(() => {
  toast.dismiss();
  cleanup();
});

describe('IdentidadPage', () => {
  it('muestra EsqueletoCarga mientras carga y EstadoError con Reintentar si falla', async () => {
    obtenerIdentidad.mockImplementationOnce(() => new Promise(() => {}));
    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

    cleanup();
    obtenerIdentidad.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const user = userEvent.setup();
    montar();

    const alerta = await screen.findByRole('alert');
    expect(within(alerta).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    await user.click(within(alerta).getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByLabelText(/nombre del conjunto/i)).toHaveValue('Parque Central de Occidente');
    expect(obtenerIdentidad).toHaveBeenCalledTimes(3);
  });

  it('carga datos actuales, sincroniza color picker ↔ texto y maneja fallback seguro si la imagen del logo falla', async () => {
    const user = userEvent.setup();
    montar();

    const inputNombre = await screen.findByLabelText(/nombre del conjunto/i);
    expect(inputNombre).toHaveValue('Parque Central de Occidente');
    expect(screen.getByLabelText(/url del logo/i)).toHaveValue('https://cdn.demo.mailflow.test/logo.png');
    expect(screen.getByLabelText(/^color primario$/i)).toHaveValue(PALETA_PARQUES.primario);
    expect(screen.getByLabelText(/^color de acento$/i)).toHaveValue(PALETA_PARQUES.acento);
    expect(screen.getByLabelText(/^color secundario/i)).toHaveValue(PALETA_PARQUES.secundario);

    // Vista previa muestra nombre e imagen de logo; si la imagen falla muestra iniciales como respaldo
    const vistaPrevia = screen.getByRole('region', { name: /vista previa/i });
    const imgLogo = within(vistaPrevia).getByRole('img', { name: /logo de parque central de occidente/i });
    fireEvent.error(imgLogo);
    expect(await within(vistaPrevia).findByText('PC')).toBeInTheDocument();
    expect(within(vistaPrevia).getByText(/no se pudo cargar la imagen del logo/i)).toBeInTheDocument();

    // Sincronización selector visual -> texto
    const pickerPrimario = screen.getByLabelText(/selector visual de color primario/i);
    fireEvent.change(pickerPrimario, { target: { value: '#1e3a5f' } });
    expect(screen.getByLabelText(/^color primario$/i)).toHaveValue('#1E3A5F');

    // Sincronización texto -> selector visual y vista previa de nombre
    await user.clear(inputNombre);
    await user.type(inputNombre, 'Torres del Prado');
    expect(within(vistaPrevia).getByText('Torres del Prado')).toBeInTheDocument();
  });

  it('valida en cliente nombre, URL de logo insegura, formato #RRGGBB y paleta incompleta', async () => {
    const user = userEvent.setup();
    montar();

    const inputNombre = await screen.findByLabelText(/nombre del conjunto/i);
    const inputLogo = screen.getByLabelText(/url del logo/i);
    const inputPrimario = screen.getByLabelText(/^color primario$/i);
    const inputAcento = screen.getByLabelText(/^color de acento$/i);
    const guardar = screen.getByRole('button', { name: /guardar cambios/i });

    // Nombre vacío
    await user.clear(inputNombre);
    await user.click(guardar);
    expect(await screen.findByText(/escribe el nombre del conjunto/i)).toBeInTheDocument();
    expect(actualizarIdentidad).not.toHaveBeenCalled();

    await user.type(inputNombre, 'Parque Central');

    // Logo inválido
    await user.clear(inputLogo);
    await user.type(inputLogo, 'javascript:alert(1)');
    await user.click(guardar);
    expect(await screen.findByText(/http\(s\):\/\/ o una ruta relativa/i)).toBeInTheDocument();
    expect(actualizarIdentidad).not.toHaveBeenCalled();

    await user.clear(inputLogo);
    await user.type(inputLogo, '/logos/parque.svg');

    // Hex inválido (3 dígitos o texto)
    await user.clear(inputPrimario);
    await user.type(inputPrimario, '#123');
    await user.click(guardar);
    expect(await screen.findByText(/escribe un color hexadecimal válido/i)).toBeInTheDocument();
    expect(actualizarIdentidad).not.toHaveBeenCalled();

    // Paleta incompleta (primario sin acento)
    await user.clear(inputPrimario);
    await user.type(inputPrimario, '#1E3A5F');
    await user.clear(inputAcento);
    await user.click(guardar);
    expect(await screen.findByText(/indica también el color de acento/i)).toBeInTheDocument();
    expect(actualizarIdentidad).not.toHaveBeenCalled();
  });

  it('evalúa contraste WCAG AA en vivo (válido vs inválido con detalle de problemas y aviso de respaldo)', async () => {
    const user = userEvent.setup();
    montar();

    const validador = await screen.findByRole('region', { name: /contraste wcag aa/i });
    expect(within(validador).getByText(/cumple contraste wcag aa/i)).toBeInTheDocument();

    // Cambia primario a amarillo (#FFFF00): falla contraste AA
    const inputPrimario = screen.getByLabelText(/^color primario$/i);
    await user.clear(inputPrimario);
    await user.type(inputPrimario, '#FFFF00');

    expect(await within(validador).findByText(/no cumple contraste wcag aa/i)).toBeInTheDocument();
    expect(within(validador).getByText(/primario\/fondo/i)).toBeInTheDocument();
    expect(within(validador).getAllByText(/4\.5/).length).toBeGreaterThan(0);
    expect(within(validador).getByText(/respaldo de mailflow/i)).toBeInTheDocument();
  });

  it('permite restablecer paleta MailFlow (envía null), guardar actualizando useSesion + aplicarTema + caché y toast', async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = montar();

    const inputNombre = await screen.findByLabelText(/nombre del conjunto/i);
    const inputLogo = screen.getByLabelText(/url del logo/i);

    // 1) Editar identidad con paleta válida y guardar
    await user.clear(inputNombre);
    await user.type(inputNombre, 'Parque Renovado');
    await user.clear(inputLogo);
    await user.type(inputLogo, '/logos/renovado.svg');

    const inputPrimario = screen.getByLabelText(/^color primario$/i);
    const inputAcento = screen.getByLabelText(/^color de acento$/i);
    const inputSecundario = screen.getByLabelText(/^color secundario/i);
    await user.clear(inputPrimario);
    await user.type(inputPrimario, PALETA_MAILFLOW.primario.toLowerCase());
    await user.clear(inputAcento);
    await user.type(inputAcento, PALETA_MAILFLOW.acento.toLowerCase());
    await user.clear(inputSecundario);

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarIdentidad).toHaveBeenCalledTimes(1));
    expect(actualizarIdentidad).toHaveBeenCalledWith({
      nombre: 'Parque Renovado',
      logoUrl: '/logos/renovado.svg',
      colorPrimario: PALETA_MAILFLOW.primario,
      colorAcento: PALETA_MAILFLOW.acento,
      colorSecundario: null,
      versionEsperada: 1,
    });

    expect(await screen.findByText('Identidad del conjunto actualizada')).toBeInTheDocument();
    expect(aplicarTema).toHaveBeenCalledWith({ primario: PALETA_MAILFLOW.primario, acento: PALETA_MAILFLOW.acento });

    const sesionDespues = useSesion.getState().sesion!;
    expect(sesionDespues.conjuntoActivo).toEqual({
      id: 'cj-parques',
      slug: 'parque-central-occidente',
      nombre: 'Parque Renovado',
      logoUrl: '/logos/renovado.svg',
      paleta: { primario: PALETA_MAILFLOW.primario, acento: PALETA_MAILFLOW.acento },
    });
    expect(sesionDespues.conjuntos[0]).toEqual(sesionDespues.conjuntoActivo);
    expect(useSesion.getState().generacion).toBe(1);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: clave('cj-parques', 'identidad') });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['conjuntos'] });

    // 2) Pulsar «Restablecer paleta MailFlow» limpia colores sin dejar errores de validación y al guardar envía null con versionEsperada=2
    await user.click(screen.getByRole('button', { name: /restablecer paleta mailflow/i }));
    expect(screen.getByLabelText(/^color primario$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^color de acento$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^color secundario/i)).toHaveValue('');
    expect(screen.getByLabelText(/^color primario$/i)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^color de acento$/i)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/^color secundario/i)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/indica también el color/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarIdentidad).toHaveBeenCalledTimes(2));
    expect(actualizarIdentidad).toHaveBeenLastCalledWith({
      nombre: 'Parque Renovado',
      logoUrl: '/logos/renovado.svg',
      colorPrimario: null,
      colorAcento: null,
      colorSecundario: null,
      versionEsperada: 2,
    });
    expect(aplicarTema).toHaveBeenLastCalledWith(undefined);
    expect(useSesion.getState().sesion?.conjuntoActivo.paleta).toBeUndefined();
  });

  it('ante conflicto 409 muestra AvisoConflicto y al recargar refresca versión y valores', async () => {
    const user = userEvent.setup();
    montar();

    const inputNombre = await screen.findByLabelText(/nombre del conjunto/i);
    // Otro usuario actualiza en paralelo en el backend (sube a version 2)
    await identidadReal.actualizar({ nombre: 'Nombre Remoto', versionEsperada: 1 });

    await user.clear(inputNombre);
    await user.type(inputNombre, 'Mi Cambio Tardío');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    const recargarBtn = await screen.findByRole('button', { name: 'Recargar' });
    expect(screen.getByText(/otra persona cambió este registro/i)).toBeInTheDocument();

    await user.click(recargarBtn);
    await waitFor(() => expect(screen.getByLabelText(/nombre del conjunto/i)).toHaveValue('Nombre Remoto'));

    // Ahora sí puede guardar con la nueva versión (2)
    await user.clear(screen.getByLabelText(/nombre del conjunto/i));
    await user.type(screen.getByLabelText(/nombre del conjunto/i), 'Mi Cambio Válido');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarIdentidad).toHaveBeenLastCalledWith(expect.objectContaining({ versionEsperada: 2 })));
    expect(await screen.findByText('Identidad del conjunto actualizada')).toBeInTheDocument();
  });

  it('ante 422 del servidor muestra mensajeDeError sin cerrar ni perder formulario', async () => {
    actualizarIdentidad.mockRejectedValueOnce(new ErrorApi(422, 'La ruta del logo fue rechazada por el servidor'));
    const user = userEvent.setup();
    montar();

    const inputNombre = await screen.findByLabelText(/nombre del conjunto/i);
    await user.clear(inputNombre);
    await user.type(inputNombre, 'Nombre Editado');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText('La ruta del logo fue rechazada por el servidor')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre del conjunto/i)).toHaveValue('Nombre Editado');
  });

  it('en móvil 375px conserva controles táctiles (max-sm:h-10) y etiquetas accesibles', async () => {
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
    const inputNombre = await screen.findByLabelText(/nombre del conjunto/i);
    expect(inputNombre).toHaveClass('max-sm:h-10');
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toHaveClass('max-sm:h-10');
    expect(screen.getByRole('button', { name: /restablecer paleta mailflow/i })).toHaveClass('max-sm:h-10');
  });
});
