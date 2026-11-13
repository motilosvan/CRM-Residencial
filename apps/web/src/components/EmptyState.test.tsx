import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { EstadoError } from './EstadoError';

describe('EmptyState', () => {
  it('muestra título, descripción y acción', () => {
    render(<EmptyState titulo="Nada aquí" descripcion="Prueba otra cosa" accion={<button>Crear</button>} />);
    expect(screen.getByText('Nada aquí')).toBeInTheDocument();
    expect(screen.getByText('Prueba otra cosa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });
});

describe('EstadoError', () => {
  it('tiene role alert y llama a alReintentar', async () => {
    const f = vi.fn();
    render(<EstadoError alReintentar={f} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(f).toHaveBeenCalledOnce();
  });
});
