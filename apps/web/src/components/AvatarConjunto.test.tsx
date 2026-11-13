import { render, screen } from '@testing-library/react';
import { AvatarConjunto, iniciales } from './AvatarConjunto';

describe('AvatarConjunto', () => {
  it('calcula iniciales de palabras significativas', () => {
    expect(iniciales('Parques del Occidente')).toBe('PO');
    expect(iniciales('Altos del Nogal')).toBe('AN');
    expect(iniciales('Torres')).toBe('T');
    expect(iniciales('Conjunto Residencial Los Pinos Norte')).toBe('CR');
  });
  it('sin logo muestra las iniciales', () => {
    render(<AvatarConjunto conjunto={{ nombre: 'Parques del Occidente' }} />);
    expect(screen.getByText('PO')).toBeInTheDocument();
  });
});
