import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, type ResultadoLaboratorio } from '@/services/contratos';
import { useSesion } from '@/store/sesion';
import type { Conjunto, Sesion } from '@/types/conjunto';

const probarMock = vi.fn();

vi.mock('@/services', () => ({
  laboratorioService: {
    probar: (...a: unknown[]) => probarMock(...a),
  },
}));

import LaboratorioIaPage from './LaboratorioIaPage';

const conjunto: Conjunto = { id: 'cj-1', slug: 'uno', nombre: 'Torres de Uno' };

function ponerSesion(rol: 'ADMIN' | 'SOPORTE' = 'SOPORTE') {
  const sesion: Sesion = {
    usuario: { id: 'u2', nombre: 'Soporte Demo', correo: 'soporte@demo.mailflow.test', rol },
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
        <LaboratorioIaPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const RESULTADO_SEGURIDAD: ResultadoLaboratorio = {
  asuntoEnmascarado: 'Robo en [UNIDAD_PROTEGIDA] — urgente',
  cuerpoEnmascarado: 'Soy [NOMBRE_PROTEGIDO], CC [DOC_PROTEGIDO], cel [TEL_PROTEGIDO], correo [CORREO_PROTEGIDO].',
  categoria: 'SEGURIDAD',
  prioridad: 'ALTA',
  palabrasDetectadas: ['robo', 'urgente'],
};

beforeEach(() => {
  probarMock.mockReset();
  ponerSesion('SOPORTE');
});

afterEach(() => {
  cleanup();
});

describe('LaboratorioIaPage', () => {
  it('muestra aviso de ejecución en memoria y estado inicial instructivo', () => {
    montar();
    expect(screen.getByText(/no crean correos ni solicitudes en la base de datos/i)).toBeInTheDocument();
    expect(screen.getByText(/resultado paso a paso/i)).toBeInTheDocument();
  });

  it('valida asunto y cuerpo vacíos antes de llamar al servicio', async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /probar clasificación/i }));
    expect(await screen.findByText(/escribe al menos un asunto o un cuerpo/i)).toBeInTheDocument();
    expect(probarMock).not.toHaveBeenCalled();
  });

  it('ejecuta prueba paso a paso y muestra enmascarado, categoría, prioridad y palabras', async () => {
    probarMock.mockResolvedValueOnce(RESULTADO_SEGURIDAD);
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText('Asunto'), 'Robo en apto 302 — urgente');
    await user.type(screen.getByLabelText('Cuerpo del mensaje'), 'Soy Residente Demo, cel 3101234567.');
    await user.click(screen.getByRole('button', { name: /probar clasificación/i }));

    expect(await screen.findByText(/paso 1 — enmascarado ley 1581/i)).toBeInTheDocument();
    expect(screen.getByText('Robo en [UNIDAD_PROTEGIDA] — urgente')).toBeInTheDocument();
    expect(screen.getByText('Seguridad')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByText('robo')).toBeInTheDocument();
    expect(screen.getByText('urgente')).toBeInTheDocument();
  });

  it('permite probar un ejemplo rápido con 1 clic', async () => {
    probarMock.mockResolvedValueOnce(RESULTADO_SEGURIDAD);
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('button', { name: /seguridad urgente/i }));

    await waitFor(() => {
      expect(probarMock).toHaveBeenCalledWith(
        expect.objectContaining({
          asunto: expect.stringContaining('Robo'),
          cuerpo: expect.stringContaining('@demo.mailflow.test'),
        }),
      );
    });
    expect(await screen.findByText(/paso 2 — clasificación y prioridad/i)).toBeInTheDocument();
  });

  it('muestra mensaje de error si el servicio falla', async () => {
    probarMock.mockRejectedValueOnce(new ErrorApi(500, 'Error interno'));
    const user = userEvent.setup();
    montar();

    await user.type(screen.getByLabelText('Asunto'), 'Prueba');
    await user.click(screen.getByRole('button', { name: /probar clasificación/i }));

    expect(await screen.findByText(/el servidor tuvo un problema al procesar la solicitud/i)).toBeInTheDocument();
  });
});
