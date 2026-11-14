import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import ProximamentePage from './ProximamentePage';

describe('ProximamentePage', () => {
  it('C4: es un bloque contenido (sin caja punteada) que dice qué llegará', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/app/x/bandeja']}>
        <ProximamentePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /bandeja: próximamente/i })).toBeInTheDocument();
    expect(screen.getByText(/aquí llegarán los correos/i)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="empty"]')).toBeNull();
    expect(container.querySelector('[data-slot="card"]')).not.toBeNull();
  });
});
