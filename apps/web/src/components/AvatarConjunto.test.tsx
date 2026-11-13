import { fireEvent, render, screen } from '@testing-library/react';
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
  it('iniciales vacías devuelven un signo neutro', () => {
    expect(iniciales('')).toBe('·');
    expect(iniciales('del de')).toBe('·');
    render(<AvatarConjunto conjunto={{ nombre: '' }} />);
    expect(screen.getByText('·')).toBeInTheDocument();
  });
  it('con logo roto muestra las iniciales', () => {
    // jsdom no carga imágenes: Radix muestra el fallback hasta que la imagen carga.
    render(<AvatarConjunto conjunto={{ nombre: 'Altos del Nogal', logoUrl: 'https://demo.mailflow.test/roto.png' }} />);
    const img = document.querySelector('img');
    if (img) fireEvent.error(img);
    expect(screen.getByText('AN')).toBeInTheDocument();
  });
});
