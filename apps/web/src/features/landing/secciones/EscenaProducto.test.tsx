import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURACIONES_FASES, EscenaProducto, FASE_FINAL } from './EscenaProducto';

function fase(contenedor: HTMLElement): number {
  const nodo = contenedor.querySelector('[data-fase]');
  return Number(nodo?.getAttribute('data-fase'));
}

class ObservadorFalso {
  static instancias: ObservadorFalso[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(public callback: IntersectionObserverCallback) {
    ObservadorFalso.instancias.push(this);
  }
  intersectar(visible: boolean) {
    this.callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

describe('EscenaProducto', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('avanza por las fases en orden y reinicia', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { container } = render(<EscenaProducto />);
    expect(fase(container)).toBe(0);
    const vistas = [0];
    for (let i = 0; i < DURACIONES_FASES.length; i++) {
      act(() => {
        vi.advanceTimersByTime(DURACIONES_FASES[i]);
      });
      vistas.push(fase(container));
    }
    expect(vistas).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(FASE_FINAL).toBe(5);
  });

  it('con movimiento reducido muestra el estado final y no programa temporizadores', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { container } = render(<EscenaProducto />);
    expect(fase(container)).toBe(FASE_FINAL);
    expect(vi.getTimerCount()).toBe(0);
    expect(container.textContent).toContain('En curso');
  });

  it('no deja temporizadores al desmontar', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { unmount } = render(<EscenaProducto />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('es decorativa', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { container } = render(<EscenaProducto />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('no avanza fuera de pantalla y reanuda al volver a verse', () => {
    ObservadorFalso.instancias = [];
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.stubGlobal('IntersectionObserver', ObservadorFalso);
    const { container } = render(<EscenaProducto />);
    const observador = ObservadorFalso.instancias[0];
    // Aún no se ha visto: no hay temporizadores ni avance.
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(fase(container)).toBe(0);
    act(() => observador.intersectar(true));
    act(() => {
      vi.advanceTimersByTime(DURACIONES_FASES[0]);
    });
    expect(fase(container)).toBe(1);
    act(() => observador.intersectar(false));
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(fase(container)).toBe(1);
    act(() => observador.intersectar(true));
    act(() => {
      vi.advanceTimersByTime(DURACIONES_FASES[1]);
    });
    expect(fase(container)).toBe(2);
  });

  it('se pausa con la pestaña oculta y reanuda al mostrarse', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const { container } = render(<EscenaProducto />);
    const ocultar = (oculta: boolean) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculta });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    try {
      ocultar(true);
      expect(vi.getTimerCount()).toBe(0);
      act(() => {
        vi.advanceTimersByTime(20000);
      });
      expect(fase(container)).toBe(0);
      ocultar(false);
      act(() => {
        vi.advanceTimersByTime(DURACIONES_FASES[0]);
      });
      expect(fase(container)).toBe(1);
    } finally {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    }
  });
});
