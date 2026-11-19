import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, type RespuestaAuditoria } from '@/services/contratos';
import { useSesion } from '@/store/sesion';
import type { Conjunto, Sesion } from '@/types/conjunto';

const listarMock = vi.fn();

vi.mock('@/services', () => ({
  auditoriaService: {
    listar: (...a: unknown[]) => listarMock(...a),
  },
}));

import AuditoriaPage from './AuditoriaPage';

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
        <AuditoriaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const RESPUESTA_MUESTRA: RespuestaAuditoria = {
  total: 25,
  eventos: [
    {
      tipo: 'ESTADO',
      entidad: 'SOLICITUD',
      codigo: 'SOL-000012',
      accion: 'Creada en NUEVA',
      actor: 'Sistema',
      detalle: null,
      fecha: '2026-11-16T15:20:00.000Z',
    },
    {
      tipo: 'ASIGNACION',
      entidad: 'SOLICITUD',
      codigo: 'SOL-000010',
      accion: 'Asignación',
      actor: 'Administración Demo',
      detalle: 'Responsable: Soporte Demo',
      fecha: '2026-11-16T14:45:00.000Z',
    },
    {
      tipo: 'ADMIN',
      entidad: 'RESIDENTE',
      codigo: 'RESIDENTE#1',
      accion: 'CREAR',
      actor: 'Administración Demo',
      detalle: 'unidad T1-101',
      fecha: '2026-11-15T18:30:00.000Z',
    },
  ],
};

beforeEach(() => {
  listarMock.mockReset();
  ponerSesion();
});

afterEach(() => {
  cleanup();
});

describe('AuditoriaPage', () => {
  it('muestra esqueleto de carga y luego tabla cronológica con enlaces a solicitudes', async () => {
    let resolver!: (v: RespuestaAuditoria) => void;
    listarMock.mockReturnValueOnce(new Promise<RespuestaAuditoria>((r) => { resolver = r; }));

    montar();
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

    resolver(RESPUESTA_MUESTRA);

    const enlace = await screen.findByRole('link', { name: 'SOL-000012' });
    expect(enlace).toHaveAttribute('href', '/app/uno/solicitudes?id=12');
    expect(screen.getByText('RESIDENTE#1')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/mostrando 1–3 de 25 eventos/i)).toBeInTheDocument();
  });

  it('muestra EstadoError y permite reintentar', async () => {
    listarMock.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const user = userEvent.setup();

    montar();
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    listarMock.mockResolvedValueOnce(RESPUESTA_MUESTRA);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByText('SOL-000012')).toBeInTheDocument();
  });

  it('muestra EmptyState cuando no hay eventos', async () => {
    listarMock.mockResolvedValueOnce({ total: 0, eventos: [] });
    montar();
    expect(await screen.findByRole('heading', { name: /aún no hay eventos registrados/i })).toBeInTheDocument();
  });

  it('busca por texto y pagina con Anterior / Siguiente', async () => {
    listarMock.mockResolvedValue(RESPUESTA_MUESTRA);
    const user = userEvent.setup();

    montar();
    await screen.findByText('SOL-000012');

    await user.click(screen.getByRole('button', { name: /siguiente/i }));
    await waitFor(() => {
      expect(listarMock).toHaveBeenCalledWith(
        { q: undefined, limite: 20, desplazamiento: 20 },
        expect.any(AbortSignal),
      );
    });

    await user.click(screen.getByRole('button', { name: /anterior/i }));
    await waitFor(() => {
      expect(listarMock).toHaveBeenLastCalledWith(
        { q: undefined, limite: 20, desplazamiento: 0 },
        expect.any(AbortSignal),
      );
    });

    const input = screen.getByLabelText(/buscar en la bitácora/i);
    await user.type(input, 'SOL-000012');
    await user.click(screen.getByRole('button', { name: /^buscar$/i }));

    await waitFor(() => {
      expect(listarMock).toHaveBeenLastCalledWith(
        { q: 'SOL-000012', limite: 20, desplazamiento: 0 },
        expect.any(AbortSignal),
      );
    });
  });
});
