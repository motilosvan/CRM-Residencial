import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DURACIONES_FASES, EscenaProducto, FASE_FINAL } from './EscenaProducto';

function fase(contenedor: HTMLElement): number {
  const nodo = contenedor.querySelector('[data-fase]');
  return Number(nodo?.getAttribute('data-fase'));
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
});
