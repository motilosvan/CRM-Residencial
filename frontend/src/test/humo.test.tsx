import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('humo', () => {
  it('renderiza un botón', () => {
    render(<Button>Hola</Button>);
    expect(screen.getByRole('button', { name: 'Hola' })).toBeInTheDocument();
  });
});
