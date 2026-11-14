import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Revelar } from './Revelar';

class ObservadorFalso {
  static instancias: ObservadorFalso[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: IntersectionObserverCallback) {
    ObservadorFalso.instancias.push(this);
  }
  intersectar(esVisible: boolean) {
    this.callback(
      [{ isIntersecting: esVisible } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  ObservadorFalso.instancias = [];
});

describe('Revelar', () => {
  it('sin IntersectionObserver el contenido queda visible', () => {
    render(<Revelar>Contenido</Revelar>);
    expect(screen.getByText('Contenido')).toHaveAttribute('data-revelado', 'true');
  });

  it('con movimiento reducido queda visible desde el inicio', () => {
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    render(<Revelar>Contenido</Revelar>);
    expect(screen.getByText('Contenido')).toHaveAttribute('data-revelado', 'true');
  });

  it('pasa de oculto a visible al intersectar', () => {
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    render(<Revelar retraso={120}>Contenido</Revelar>);
    const nodo = screen.getByText('Contenido');
    expect(nodo).toHaveAttribute('data-revelado', 'false');
    expect(nodo.style.transitionDelay).toBe('120ms');
    act(() => ObservadorFalso.instancias[0].intersectar(true));
    expect(nodo).toHaveAttribute('data-revelado', 'true');
  });

  it('desconecta el observador al desmontar', () => {
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { unmount } = render(<Revelar>Contenido</Revelar>);
    const observador = ObservadorFalso.instancias[0];
    expect(observador.observe).toHaveBeenCalled();
    unmount();
    expect(observador.disconnect).toHaveBeenCalled();
  });
});
