import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
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
  it('con logo roto (la carga falla) muestra las iniciales y no la imagen', async () => {
    vi.stubGlobal(
      'Image',
      class {
        private oyentes: Record<string, Array<(e: unknown) => void>> = {};
        addEventListener(tipo: string, fn: (e: unknown) => void) {
          (this.oyentes[tipo] ??= []).push(fn);
        }
        removeEventListener() {}
        set src(_: string) {
          queueMicrotask(() => this.oyentes['error']?.forEach((fn) => fn({ currentTarget: this })));
        }
      },
    );
    try {
      render(<AvatarConjunto conjunto={{ nombre: 'Altos del Nogal', logoUrl: 'https://demo.mailflow.test/roto.png' }} />);
      expect(await screen.findByText('AN')).toBeInTheDocument();
      expect(screen.queryByRole('img', { name: /logo de altos del nogal/i })).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('con logo que carga muestra la imagen y no las iniciales', async () => {
    vi.stubGlobal(
      'Image',
      class {
        complete = false;
        naturalWidth = 0;
        private oyentes: Record<string, Array<(e: unknown) => void>> = {};
        addEventListener(tipo: string, fn: (e: unknown) => void) {
          (this.oyentes[tipo] ??= []).push(fn);
        }
        removeEventListener() {}
        set src(_: string) {
          queueMicrotask(() => {
            this.complete = true;
            this.naturalWidth = 64;
            this.oyentes['load']?.forEach((fn) => fn({ currentTarget: this }));
          });
        }
      },
    );
    try {
      render(<AvatarConjunto conjunto={{ nombre: 'Altos del Nogal', logoUrl: 'https://demo.mailflow.test/ok.png' }} />);
      expect(await screen.findByRole('img', { name: /logo de altos del nogal/i })).toBeInTheDocument();
      expect(screen.queryByText('AN')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
