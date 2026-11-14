import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Pagina403 from './Pagina403';
import Pagina404 from './Pagina404';

function montar(el: React.ReactElement) {
  return render(<MemoryRouter>{el}</MemoryRouter>);
}

describe('Páginas 403 y 404', () => {
  it.each([
    ['403', <Pagina403 key="a" />, /sin acceso/i],
    ['404', <Pagina404 key="b" />, /no encontrada/i],
  ])('C4: la %s muestra el código tipográfico, titular, texto y una acción', (codigo, el, titular) => {
    const { container } = montar(el);
    expect(screen.getByText(codigo)).toHaveClass('font-heading');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: titular })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /volver al inicio/i })).toHaveAttribute('href', '/');
    expect(container.querySelector('[data-slot="empty"]')).toBeNull();
    expect(container.querySelector('.mf-reticula')).not.toBeNull();
    expect(container.querySelector('[data-revelado]')).not.toBeNull();
  });

  it('C4: 403 y 404 comparten el mismo botón de acción', () => {
    const a = montar(<Pagina403 />);
    const clase403 = screen.getByRole('link', { name: /volver al inicio/i }).className;
    a.unmount();
    montar(<Pagina404 />);
    expect(screen.getByRole('link', { name: /volver al inicio/i }).className).toBe(clase403);
  });
});
