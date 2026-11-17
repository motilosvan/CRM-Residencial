import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, type ReporteSolicitudes } from '@/services/contratos';
import { useSesion } from '@/store/sesion';
import type { Conjunto, Sesion } from '@/types/conjunto';

const obtenerMock = vi.fn();
const descargarCsvMock = vi.fn();

vi.mock('@/services', () => ({
  reportesService: {
    obtener: (...a: unknown[]) => obtenerMock(...a),
    descargarCsv: (...a: unknown[]) => descargarCsvMock(...a),
  },
}));

import ReportesPage from './ReportesPage';

const conjunto: Conjunto = { id: 'cj-1', slug: 'uno', nombre: 'Torres de Uno' };

function ponerSesion() {
  const sesion: Sesion = {
    usuario: { id: 'u1', nombre: 'Admin Demo', correo: 'admin@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: conjunto,
    conjuntos: [conjunto],
    ultimaActividad: Date.now(),
  };
  useSesion.setState({ sesion, estado: 'lista', motivoCierre: null, ultimaActividad: Date.now() });
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReportesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const REPORTE_MUESTRA: ReporteSolicitudes = {
  periodo: { desde: null, hasta: null },
  totales: { total: 10, abiertas: 4, resueltas: 4, cerradas: 2 },
  porEstado: [
    { estado: 'NUEVA', n: 2 },
    { estado: 'ASIGNADA', n: 1 },
    { estado: 'EN_PROCESO', n: 1 },
    { estado: 'RESUELTA', n: 4 },
    { estado: 'CERRADA', n: 2 },
  ],
  porCategoria: [
    { categoria: 'SEGURIDAD', n: 3 },
    { categoria: 'MANTENIMIENTO', n: 5 },
    { categoria: 'FACTURACION', n: 2 },
  ],
  porPrioridad: [
    { prioridad: 'ALTA', n: 3 },
    { prioridad: 'MEDIA', n: 5 },
    { prioridad: 'BAJA', n: 2 },
  ],
  respuesta: [
    { categoria: 'MANTENIMIENTO', total: 4, minutosPromedio: 90, dentroSla: 4, porcentajeSla: 100 },
    { categoria: 'SEGURIDAD', total: 2, minutosPromedio: 30, dentroSla: 1, porcentajeSla: 50 },
  ],
  global: { totalConRespuesta: 6, minutosPromedio: 70, dentroSla: 5, porcentajeSla: 83.3 },
  carga: [{ idUsuario: 2, nombre: 'Soporte Demo', abiertas: 4, resueltasEnPeriodo: 6 }],
};

beforeEach(() => {
  obtenerMock.mockReset();
  descargarCsvMock.mockReset();
  toast.dismiss();
  ponerSesion();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReportesPage', () => {
  it('muestra esqueleto de carga y luego KPIs, distribuciones y tablas', async () => {
    let resolver!: (v: ReporteSolicitudes) => void;
    obtenerMock.mockReturnValueOnce(new Promise<ReporteSolicitudes>((r) => { resolver = r; }));

    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

    resolver(REPORTE_MUESTRA);

    expect(await screen.findByText('83.3%')).toBeInTheDocument();
    expect(screen.getByText('1 h 10 min')).toBeInTheDocument();
    expect(screen.getByText('Soporte Demo')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('muestra EstadoError y permite reintentar', async () => {
    obtenerMock.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const user = userEvent.setup();

    montar();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    obtenerMock.mockResolvedValueOnce(REPORTE_MUESTRA);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByText('83.3%')).toBeInTheDocument();
  });

  it('muestra EmptyState cuando totales.total === 0', async () => {
    obtenerMock.mockResolvedValueOnce({
      ...REPORTE_MUESTRA,
      totales: { total: 0, abiertas: 0, resueltas: 0, cerradas: 0 },
      porEstado: [],
      porCategoria: [],
      porPrioridad: [],
      respuesta: [],
      global: { totalConRespuesta: 0, minutosPromedio: null, dentroSla: 0, porcentajeSla: null },
      carga: [],
    });

    montar();
    expect(await screen.findByRole('heading', { name: /sin solicitudes en el periodo/i })).toBeInTheDocument();
  });

  it('filtra por fechas y muestra aviso claro si desde > hasta', async () => {
    obtenerMock.mockResolvedValue(REPORTE_MUESTRA);
    const user = userEvent.setup();

    montar();
    await screen.findByText('83.3%');

    const desde = screen.getByLabelText('Desde');
    const hasta = screen.getByLabelText('Hasta');

    await user.type(desde, '2026-11-20');
    await user.type(hasta, '2026-11-01');
    await user.click(screen.getByRole('button', { name: /aplicar/i }));

    expect(await screen.findByText(/fecha inicial debe ser menor o igual/i)).toBeInTheDocument();
    expect(obtenerMock).toHaveBeenCalledTimes(1);

    await user.clear(desde);
    await user.type(desde, '2026-11-01');
    await user.clear(hasta);
    await user.type(hasta, '2026-11-16');
    await user.click(screen.getByRole('button', { name: /aplicar/i }));

    await waitFor(() => {
      expect(obtenerMock).toHaveBeenCalledWith(
        { desde: '2026-11-01', hasta: '2026-11-16' },
        expect.any(AbortSignal),
      );
    });

    await user.click(screen.getByRole('button', { name: /limpiar/i }));
    await waitFor(() => {
      expect(obtenerMock).toHaveBeenLastCalledWith({}, expect.any(AbortSignal));
    });
  });

  it('descarga CSV creando Blob UTF-8 y disparando enlace', async () => {
    obtenerMock.mockResolvedValueOnce(REPORTE_MUESTRA);
    descargarCsvMock.mockResolvedValueOnce('seccion,concepto,cantidad,minutos_promedio,dentro_sla,porcentaje_sla\r\n');

    const createObjectURL = vi.fn(() => 'blob:mock-csv');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const user = userEvent.setup();
    montar();
    await screen.findByText('83.3%');

    await user.click(screen.getByRole('button', { name: /descargar csv/i }));

    await waitFor(() => expect(descargarCsvMock).toHaveBeenCalledWith({}));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-csv');

    vi.unstubAllGlobals();
  });
});
