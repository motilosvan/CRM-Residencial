import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sesion } from '@/types/conjunto';
import { LIMITE_INACTIVIDAD_MS, useSesion } from '@/store/sesion';
import { usePreferencias } from '@/store/preferencias';
import { TOPE_ESCRITURA_MS, useInactividad } from './useInactividad';

const AHORA = new Date('2026-01-10T12:00:00Z').getTime();
const MIN = 60_000;

function crearSesion(): Sesion {
  const a = { id: 'c1', slug: 'alamos', nombre: 'Álamos' };
  return {
    usuario: { id: 'u1', nombre: 'Ana', correo: 'ana@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: a,
    conjuntos: [a],
    ultimaActividad: AHORA,
  };
}

function avanzar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function disparar(tipo: string, objetivo: EventTarget = window) {
  act(() => {
    objetivo.dispatchEvent(new Event(tipo));
  });
}

/** Simula que otra pestaña escribió `ultimaActividad` en localStorage y avisó con `storage`. */
function escribirDesdeOtraPestana(sesion: Sesion | null) {
  const valor = JSON.stringify({ state: { sesion, motivoCierre: sesion ? null : 'manual' }, version: 0 });
  localStorage.setItem('mailflow.sesion', valor);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'mailflow.sesion', newValue: valor }));
  });
}

describe('useInactividad', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    localStorage.clear();
    useSesion.setState({ sesion: null, motivoCierre: null });
    usePreferencias.setState({ ultimoConjuntoSlug: null });
    useSesion.getState().iniciar(crearSesion());
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    useSesion.setState({ sesion: null, motivoCierre: null });
  });

  it('sin aviso mientras hay actividad reciente', () => {
    const { result } = renderHook(() => useInactividad());
    avanzar(10 * MIN);
    expect(result.current.avisoVisible).toBe(false);
    expect(useSesion.getState().sesion).not.toBeNull();
  });

  it('a los 29 min muestra el aviso con 60 s restantes', () => {
    const { result } = renderHook(() => useInactividad());
    avanzar(29 * MIN);
    expect(result.current.avisoVisible).toBe(true);
    expect(result.current.segundosRestantes).toBe(60);
    avanzar(2000);
    expect(result.current.segundosRestantes).toBe(58);
  });

  it('seguir() oculta el aviso y reinicia el contador', () => {
    const { result } = renderHook(() => useInactividad());
    avanzar(29 * MIN);
    act(() => result.current.seguir());
    expect(result.current.avisoVisible).toBe(false);
    avanzar(29 * MIN);
    expect(useSesion.getState().sesion).not.toBeNull();
    expect(result.current.avisoVisible).toBe(true);
  });

  it('a los 30 min cierra la sesión por inactividad', () => {
    const { result } = renderHook(() => useInactividad());
    avanzar(LIMITE_INACTIVIDAD_MS);
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().motivoCierre).toBe('inactividad');
    expect(result.current.avisoVisible).toBe(false);
  });

  it('con el aviso visible, la actividad pasiva no reinicia el contador', () => {
    const { result } = renderHook(() => useInactividad());
    avanzar(29 * MIN);
    disparar('pointermove');
    disparar('keydown');
    expect(result.current.avisoVisible).toBe(true);
    avanzar(MIN);
    expect(useSesion.getState().sesion).toBeNull();
  });

  it('la actividad pasiva reinicia el contador, escribiendo como mucho cada 15 s', () => {
    renderHook(() => useInactividad());
    avanzar(20_000);
    disparar('pointermove');
    expect(useSesion.getState().sesion?.ultimaActividad).toBe(AHORA + 20_000);
    avanzar(5_000);
    disparar('keydown');
    expect(useSesion.getState().sesion?.ultimaActividad).toBe(AHORA + 20_000);
    avanzar(TOPE_ESCRITURA_MS);
    disparar('scroll');
    expect(useSesion.getState().sesion?.ultimaActividad).toBe(AHORA + 40_000);
  });

  it('un evento storage con actividad reciente de otra pestaña evita el cierre', () => {
    const { result } = renderHook(() => useInactividad());
    avanzar(29 * MIN);
    expect(result.current.avisoVisible).toBe(true);
    escribirDesdeOtraPestana({ ...crearSesion(), ultimaActividad: AHORA + 29 * MIN });
    expect(result.current.avisoVisible).toBe(false);
    avanzar(2 * MIN);
    expect(useSesion.getState().sesion).not.toBeNull();
  });

  it('el cierre en otra pestaña cierra también esta', () => {
    renderHook(() => useInactividad());
    escribirDesdeOtraPestana(null);
    expect(useSesion.getState().sesion).toBeNull();
  });

  it('al volver la pestaña visible tras una suspensión, cierra la sesión', () => {
    renderHook(() => useInactividad());
    // Reloj salta sin ejecutar el intervalo (temporizadores congelados).
    vi.setSystemTime(AHORA + 2 * 60 * MIN);
    disparar('visibilitychange', document);
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().motivoCierre).toBe('inactividad');
  });

  it('sin sesión no hace nada y limpia listeners al desmontar', () => {
    useSesion.setState({ sesion: null, motivoCierre: null });
    const quitar = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() => useInactividad());
    avanzar(40 * MIN);
    expect(result.current.avisoVisible).toBe(false);
    expect(useSesion.getState().motivoCierre).toBeNull();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    quitar.mockRestore();
  });

  it('al desmontar con sesión quita el intervalo y los listeners', () => {
    const { unmount } = renderHook(() => useInactividad());
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
