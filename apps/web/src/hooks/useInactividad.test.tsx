import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sesion } from '@/types/conjunto';
import { LIMITE_INACTIVIDAD_MS, useSesion } from '@/store/sesion';
import { usePreferencias } from '@/store/preferencias';
import { authService } from '@/services';
import { TOPE_AVISO_SERVIDOR_MS, TOPE_ESCRITURA_MS, useInactividad } from './useInactividad';

const AHORA = new Date('2026-01-10T12:00:00Z').getTime();
const MIN = 60_000;
const TIPOS = ['keydown', 'pointerdown', 'pointermove', 'scroll', 'visibilitychange', 'storage'];

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
  const valor = JSON.stringify({
    state: { ultimaActividad: sesion?.ultimaActividad ?? null, motivoCierre: sesion ? null : 'manual' },
    version: 0,
  });
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
    useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: null, ultimaActividad: null });
    usePreferencias.setState({ ultimoConjuntoSlug: null });
    vi.spyOn(authService, 'salir').mockResolvedValue();
    vi.spyOn(authService, 'sesion').mockResolvedValue(crearSesion());
    useSesion.getState().iniciar(crearSesion());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: null, ultimaActividad: null });
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

  it('el cierre por inactividad en otra pestaña conserva el motivo aquí y en localStorage', () => {
    renderHook(() => useInactividad());
    const valor = JSON.stringify({ state: { ultimaActividad: null, motivoCierre: 'inactividad' }, version: 0 });
    localStorage.setItem('mailflow.sesion', valor);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'mailflow.sesion', newValue: valor }));
    });
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().motivoCierre).toBe('inactividad');
    expect(JSON.parse(localStorage.getItem('mailflow.sesion')!).state.motivoCierre).toBe('inactividad');
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

  it('sin sesión no hace nada: ni intervalo ni listeners', () => {
    useSesion.setState({ sesion: null, estado: 'lista', motivoCierre: null, ultimaActividad: null });
    const agregarV = vi.spyOn(window, 'addEventListener');
    const agregarD = vi.spyOn(document, 'addEventListener');
    const { result, unmount } = renderHook(() => useInactividad());
    avanzar(40 * MIN);
    expect(result.current.avisoVisible).toBe(false);
    expect(useSesion.getState().motivoCierre).toBeNull();
    expect(agregarV.mock.calls.filter(([t]) => TIPOS.includes(t))).toHaveLength(0);
    expect(agregarD.mock.calls.filter(([t]) => TIPOS.includes(t))).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it('al desmontar con sesión retira el intervalo y cada listener con el mismo tipo y función', () => {
    const agregarV = vi.spyOn(window, 'addEventListener');
    const quitarV = vi.spyOn(window, 'removeEventListener');
    const agregarD = vi.spyOn(document, 'addEventListener');
    const quitarD = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useInactividad());
    expect(vi.getTimerCount()).toBe(1);
    const propios = (calls: unknown[][]) => calls.filter(([t]) => TIPOS.includes(t as string));
    const regV = propios(agregarV.mock.calls);
    const regD = propios(agregarD.mock.calls);
    expect(regV.map(([t]) => t).sort()).toEqual(
      ['keydown', 'pointerdown', 'pointermove', 'scroll', 'storage'].sort(),
    );
    expect(regD.map(([t]) => t)).toEqual(['visibilitychange']);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    for (const [t, f] of regV) expect(quitarV).toHaveBeenCalledWith(t, f);
    for (const [t, f] of regD) expect(quitarD).toHaveBeenCalledWith(t, f);

    // Tras desmontar, los eventos y el reloj ya no tocan el store.
    const antes = useSesion.getState().sesion;
    disparar('pointermove');
    disparar('visibilitychange', document);
    avanzar(LIMITE_INACTIVIDAD_MS);
    expect(useSesion.getState().sesion).toEqual(antes);
    expect(useSesion.getState().motivoCierre).toBeNull();
  });

  describe('aviso al servidor', () => {
    it('con actividad llama a authService.sesion como mucho una vez cada 5 min', () => {
      const sesion = vi.spyOn(authService, 'sesion').mockResolvedValue(crearSesion());
      renderHook(() => useInactividad());
      avanzar(1000);
      disparar('pointermove');
      expect(sesion).not.toHaveBeenCalled();
      avanzar(TOPE_AVISO_SERVIDOR_MS);
      disparar('keydown');
      expect(sesion).toHaveBeenCalledTimes(1);
      avanzar(20_000);
      disparar('pointermove');
      avanzar(60_000);
      disparar('scroll');
      expect(sesion).toHaveBeenCalledTimes(1);
      avanzar(TOPE_AVISO_SERVIDOR_MS);
      disparar('keydown');
      expect(sesion).toHaveBeenCalledTimes(2);
    });

    it('sin actividad no llama a authService.sesion', () => {
      const sesion = vi.spyOn(authService, 'sesion').mockResolvedValue(crearSesion());
      renderHook(() => useInactividad());
      avanzar(20 * MIN);
      expect(sesion).not.toHaveBeenCalled();
    });

    it('si el servidor responde null cierra con motivo inactividad', async () => {
      vi.spyOn(authService, 'sesion').mockResolvedValue(null);
      renderHook(() => useInactividad());
      avanzar(TOPE_AVISO_SERVIDOR_MS);
      disparar('pointermove');
      await act(async () => {
        await Promise.resolve();
      });
      expect(useSesion.getState().sesion).toBeNull();
      expect(useSesion.getState().motivoCierre).toBe('inactividad');
    });

    it('si el servidor falla por red, la sesión local sigue abierta', async () => {
      vi.spyOn(authService, 'sesion').mockRejectedValue(new Error('red'));
      renderHook(() => useInactividad());
      avanzar(TOPE_AVISO_SERVIDOR_MS);
      disparar('pointermove');
      await act(async () => {
        await Promise.resolve();
      });
      expect(useSesion.getState().sesion).not.toBeNull();
    });
  });

  it('al vencer por inactividad local avisa también al servidor con salir', () => {
    renderHook(() => useInactividad());
    avanzar(LIMITE_INACTIVIDAD_MS);
    expect(authService.salir).toHaveBeenCalledTimes(1);
  });
});
