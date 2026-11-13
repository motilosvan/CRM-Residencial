import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Sesion } from '@/types/conjunto';
import {
  AVISO_MS,
  LIMITE_INACTIVIDAD_MS,
  estadoInactividad,
  useSesion,
} from './sesion';
import { usePreferencias } from './preferencias';

const AHORA = new Date('2026-01-10T12:00:00Z').getTime();

function crearSesion(ultimaActividad = AHORA): Sesion {
  const a = { id: 'c1', slug: 'alamos', nombre: 'Álamos' };
  const b = { id: 'c2', slug: 'robles', nombre: 'Robles' };
  return {
    usuario: { id: 'u1', nombre: 'Ana', correo: 'ana@demo.mailflow.test', rol: 'ADMIN' },
    conjuntoActivo: a,
    conjuntos: [a, b],
    ultimaActividad,
  };
}

function reiniciar() {
  localStorage.clear();
  useSesion.setState({ sesion: null, motivoCierre: null });
  usePreferencias.setState({ ultimoConjuntoSlug: null });
}

describe('estadoInactividad', () => {
  it('no vence ni avisa con actividad reciente', () => {
    expect(estadoInactividad(AHORA, AHORA + 1000)).toEqual({
      vencida: false,
      avisar: false,
      msRestantes: LIMITE_INACTIVIDAD_MS - 1000,
    });
  });
  it('avisa desde 1 min antes del límite', () => {
    const e = estadoInactividad(AHORA, AHORA + LIMITE_INACTIVIDAD_MS - AVISO_MS);
    expect(e.avisar).toBe(true);
    expect(e.vencida).toBe(false);
    expect(e.msRestantes).toBe(AVISO_MS);
  });
  it('vence exactamente en el límite, con msRestantes en 0', () => {
    const e = estadoInactividad(AHORA, AHORA + LIMITE_INACTIVIDAD_MS);
    expect(e).toEqual({ vencida: true, avisar: false, msRestantes: 0 });
  });
});

describe('useSesion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    reiniciar();
  });
  afterEach(() => {
    vi.useRealTimers();
    reiniciar();
  });

  it('iniciar guarda la sesión con la hora actual y limpia el motivo', () => {
    useSesion.setState({ motivoCierre: 'manual' });
    useSesion.getState().iniciar(crearSesion(1));
    const { sesion, motivoCierre } = useSesion.getState();
    expect(sesion?.ultimaActividad).toBe(AHORA);
    expect(motivoCierre).toBeNull();
  });

  it('cerrar vacía la sesión, guarda el motivo y conserva el último conjunto', () => {
    usePreferencias.getState().recordarConjunto('alamos');
    useSesion.getState().iniciar(crearSesion());
    useSesion.getState().cerrar('manual');
    expect(useSesion.getState().sesion).toBeNull();
    expect(useSesion.getState().motivoCierre).toBe('manual');
    expect(usePreferencias.getState().ultimoConjuntoSlug).toBe('alamos');
  });

  it('cambiarConjunto con slug propio cambia y registra actividad', () => {
    useSesion.getState().iniciar(crearSesion());
    vi.setSystemTime(AHORA + 5000);
    expect(useSesion.getState().cambiarConjunto('robles')).toBe(true);
    const s = useSesion.getState().sesion!;
    expect(s.conjuntoActivo.slug).toBe('robles');
    expect(s.ultimaActividad).toBe(AHORA + 5000);
  });

  it('cambiarConjunto con slug ajeno devuelve false y no cambia nada', () => {
    useSesion.getState().iniciar(crearSesion());
    const antes = useSesion.getState().sesion;
    expect(useSesion.getState().cambiarConjunto('ajeno')).toBe(false);
    expect(useSesion.getState().sesion).toEqual(antes);
  });

  it('cambiarConjunto sin sesión devuelve false', () => {
    expect(useSesion.getState().cambiarConjunto('alamos')).toBe(false);
  });

  it('registrarActividad actualiza la marca; sin sesión no hace nada', () => {
    useSesion.getState().registrarActividad(123);
    expect(useSesion.getState().sesion).toBeNull();
    useSesion.getState().iniciar(crearSesion());
    useSesion.getState().registrarActividad(AHORA + 9000);
    expect(useSesion.getState().sesion?.ultimaActividad).toBe(AHORA + 9000);
  });

  it('persiste solo sesion y motivoCierre en mailflow.sesion', () => {
    useSesion.getState().iniciar(crearSesion());
    const guardado = JSON.parse(localStorage.getItem('mailflow.sesion')!);
    expect(Object.keys(guardado.state).sort()).toEqual(['motivoCierre', 'sesion']);
  });

  describe('rehidratación', () => {
    function guardar(state: unknown) {
      localStorage.setItem('mailflow.sesion', JSON.stringify({ state, version: 0 }));
    }

    it('conserva una sesión reciente', async () => {
      guardar({ sesion: crearSesion(AHORA - 29 * 60_000), motivoCierre: null });
      await useSesion.persist.rehydrate();
      expect(useSesion.getState().sesion).not.toBeNull();
    });

    it('descarta una sesión de hace 31 min con motivo inactividad', async () => {
      guardar({ sesion: crearSesion(AHORA - 31 * 60_000), motivoCierre: null });
      await useSesion.persist.rehydrate();
      expect(useSesion.getState().sesion).toBeNull();
      expect(useSesion.getState().motivoCierre).toBe('inactividad');
    });

    it('JSON inválido: sin sesión y sin lanzar', async () => {
      localStorage.setItem('mailflow.sesion', '{no es json');
      await expect(useSesion.persist.rehydrate()).resolves.not.toThrow();
      expect(useSesion.getState().sesion).toBeNull();
    });

    it('sesión sin usuario: sin sesión', async () => {
      const sinUsuario: Partial<Sesion> = crearSesion();
      delete sinUsuario.usuario;
      guardar({ sesion: sinUsuario, motivoCierre: null });
      await useSesion.persist.rehydrate();
      expect(useSesion.getState().sesion).toBeNull();
    });

    it('ultimaActividad no numérica: sin sesión', async () => {
      guardar({ sesion: { ...crearSesion(), ultimaActividad: 'ayer' }, motivoCierre: null });
      await useSesion.persist.rehydrate();
      expect(useSesion.getState().sesion).toBeNull();
    });
  });
});
