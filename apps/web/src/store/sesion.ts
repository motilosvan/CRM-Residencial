import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Sesion } from '@/types/conjunto';

export const LIMITE_INACTIVIDAD_MS = 30 * 60_000;
export const AVISO_MS = 60_000;

export type MotivoCierre = 'manual' | 'inactividad';

export interface EstadoInactividad {
  vencida: boolean;
  avisar: boolean;
  msRestantes: number;
}

/** Función pura: estado de inactividad dada la última actividad y la hora actual. */
export function estadoInactividad(ultimaActividad: number, ahora: number): EstadoInactividad {
  const msRestantes = Math.max(0, LIMITE_INACTIVIDAD_MS - (ahora - ultimaActividad));
  const vencida = msRestantes === 0;
  return { vencida, avisar: !vencida && msRestantes <= AVISO_MS, msRestantes };
}

interface SesionState {
  sesion: Sesion | null;
  motivoCierre: MotivoCierre | null;
  iniciar(s: Sesion): void;
  cerrar(m: MotivoCierre): void;
  cambiarConjunto(slug: string): boolean;
  registrarActividad(ahora?: number): void;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function esSesionValida(v: unknown): v is Sesion {
  return (
    esObjeto(v) &&
    esObjeto(v.usuario) &&
    esObjeto(v.conjuntoActivo) &&
    Array.isArray(v.conjuntos) &&
    typeof v.ultimaActividad === 'number' &&
    Number.isFinite(v.ultimaActividad)
  );
}

export const useSesion = create<SesionState>()(
  persist(
    (set, get) => ({
      sesion: null,
      motivoCierre: null,
      iniciar: (s) => set({ sesion: { ...s, ultimaActividad: Date.now() }, motivoCierre: null }),
      cerrar: (m) => set({ sesion: null, motivoCierre: m }),
      cambiarConjunto: (slug) => {
        const { sesion } = get();
        const destino = sesion?.conjuntos.find((c) => c.slug === slug);
        if (!sesion || !destino) return false;
        set({ sesion: { ...sesion, conjuntoActivo: destino, ultimaActividad: Date.now() } });
        return true;
      },
      registrarActividad: (ahora = Date.now()) => {
        const { sesion } = get();
        if (!sesion) return;
        set({ sesion: { ...sesion, ultimaActividad: ahora } });
      },
    }),
    {
      name: 'mailflow.sesion',
      partialize: (s) => ({ sesion: s.sesion, motivoCierre: s.motivoCierre }),
      merge: (persistido, actual) => {
        const p = esObjeto(persistido) ? persistido : {};
        if (!esSesionValida(p.sesion)) {
          return { ...actual, sesion: null, motivoCierre: null };
        }
        if (estadoInactividad(p.sesion.ultimaActividad, Date.now()).vencida) {
          return { ...actual, sesion: null, motivoCierre: 'inactividad' };
        }
        const motivo = p.motivoCierre === 'manual' || p.motivoCierre === 'inactividad' ? p.motivoCierre : null;
        return { ...actual, sesion: p.sesion, motivoCierre: motivo };
      },
    },
  ),
);
