import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AvisoConflicto } from './AvisoConflicto';

describe('AvisoConflicto', () => {
  it('es un alert con el aviso de conflicto', () => {
    render(<AvisoConflicto alRecargar={() => {}} />);
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Otra persona cambió este registro');
  });
  it('el botón Recargar llama a alRecargar', async () => {
    const f = vi.fn();
    render(<AvisoConflicto alRecargar={f} />);
    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }));
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('acepta una descripción propia', () => {
    render(<AvisoConflicto alRecargar={() => {}} descripcion="Detalle específico" />);
    expect(screen.getByText('Detalle específico')).toBeInTheDocument();
  });
});
