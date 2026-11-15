import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authService } from '@/services';
import { ErrorAuth, type CodigoErrorAuth } from '@/services/contratos';
import type { Sesion } from '@/types/conjunto';

export const LIMITE_INACTIVIDAD_MS = 30 * 60_000;
export const AVISO_MS = 60_000;
export const CLAVE_SESION = 'mailflow.sesion';

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

export type EstadoSesion = 'cargando' | 'lista';

interface SesionState {
  /** La sesión vive en una cookie httpOnly del servidor; aquí solo hay una copia en memoria. */
  sesion: Sesion | null;
  /** 'cargando' hasta que `rehidratar()` termina (con o sin sesión). */
  estado: EstadoSesion;
  /** Única marca persistida (con `motivoCierre`): ningún dato personal llega a localStorage. */
  ultimaActividad: number | null;
  motivoCierre: MotivoCierre | null;
  /** Último rechazo de `cambiarConjunto`; la guarda decide entre 403 y reintento. */
  errorCambio: { slug: string; codigo: CodigoErrorAuth } | null;
  /** Avanza con cada inicio, cierre, rehidratación y cambio: invalida respuestas tardías. */
  generacion: number;
  iniciar(s: Sesion): void;
  rehidratar(): Promise<void>;
  /** Limpia el store (sin avisar al servidor). */
  cerrar(m: MotivoCierre): void;
  /** Limpia el store al instante y avisa al servidor sin bloquear ni mostrar errores. */
  salir(m: MotivoCierre): void;
  cambiarConjunto(slug: string): Promise<boolean>;
  registrarActividad(ahora?: number): void;
  /** Reconcilia con lo que escribió otra pestaña en localStorage. */
  sincronizar(): void;
}

interface Persistido {
  ultimaActividad: number | null;
  motivoCierre: MotivoCierre | null;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function esMotivo(v: unknown): v is MotivoCierre {
  return v === 'manual' || v === 'inactividad';
}

function validar(v: unknown): Persistido {
  const p = esObjeto(v) ? v : {};
  return {
    ultimaActividad:
      typeof p.ultimaActividad === 'number' && Number.isFinite(p.ultimaActividad) ? p.ultimaActividad : null,
    motivoCierre: esMotivo(p.motivoCierre) ? p.motivoCierre : null,
  };
}

/** Lee lo persistido tal cual está ahora en localStorage; cualquier fallo equivale a "vacío". */
function leerPersistido(): Persistido {
  try {
    const crudo = localStorage.getItem(CLAVE_SESION);
    const json: unknown = crudo ? JSON.parse(crudo) : null;
    return validar(esObjeto(json) ? json.state : null);
  } catch {
    return validar(null);
  }
}

export const useSesion = create<SesionState>()(
  persist(
    (set, get) => ({
      sesion: null,
      estado: 'cargando',
      ultimaActividad: null,
      motivoCierre: null,
      errorCambio: null,
      generacion: 0,
      iniciar: (s) => {
        const ahora = Date.now();
        set({
          sesion: { ...s, ultimaActividad: ahora },
          ultimaActividad: ahora,
          motivoCierre: null,
          estado: 'lista',
          errorCambio: null,
          generacion: get().generacion + 1,
        });
      },
      rehidratar: async () => {
        const previa = get().ultimaActividad;
        const generacion = get().generacion + 1;
        set({ generacion });
        let remota: Sesion | null = null;
        try {
          remota = await authService.sesion();
        } catch {
          remota = null;
        }
        if (get().generacion !== generacion) {
          // Algo cambió la sesión mientras esperaba: esta respuesta ya no manda.
          set({ estado: 'lista' });
          return;
        }
        const ahora = Date.now();
        if (remota) {
          set({ sesion: { ...remota, ultimaActividad: ahora }, ultimaActividad: ahora, motivoCierre: null, estado: 'lista' });
          return;
        }
        const vencida = previa !== null && estadoInactividad(previa, ahora).vencida;
        set({
          sesion: null,
          ultimaActividad: null,
          motivoCierre: vencida ? 'inactividad' : get().motivoCierre,
          estado: 'lista',
        });
      },
      cerrar: (m) =>
        set({ sesion: null, ultimaActividad: null, motivoCierre: m, errorCambio: null, generacion: get().generacion + 1 }),
      salir: (m) => {
        get().cerrar(m);
        // Sin esperar y sin error visible: el panel ya quedó cerrado en este navegador.
        try {
          void authService.salir().catch(() => undefined);
        } catch {
          // Un fallo síncrono del servicio tampoco debe romper el cierre.
        }
      },
      cambiarConjunto: async (slug) => {
        const { sesion } = get();
        const destino = sesion?.conjuntos.find((c) => c.slug === slug);
        if (!sesion || !destino) return false;
        const generacion = get().generacion + 1;
        set({ errorCambio: null, generacion });
        try {
          const nueva = await authService.cambiarConjunto(destino.id);
          if (get().generacion !== generacion) return false;
          const ahora = Date.now();
          set({ sesion: { ...nueva, ultimaActividad: ahora }, ultimaActividad: ahora });
          return true;
        } catch (e) {
          if (get().generacion !== generacion) return false;
          set({ errorCambio: { slug, codigo: e instanceof ErrorAuth ? e.codigo : 'RED' } });
          return false;
        }
      },
      registrarActividad: (ahora = Date.now()) => {
        const { sesion } = get();
        if (!sesion) return;
        set({ sesion: { ...sesion, ultimaActividad: ahora }, ultimaActividad: ahora });
      },
      sincronizar: () => {
        const p = leerPersistido();
        const { sesion } = get();
        if (!sesion) {
          set({ ultimaActividad: p.ultimaActividad, motivoCierre: p.motivoCierre });
          return;
        }
        if (p.ultimaActividad === null) {
          // Otra pestaña cerró la sesión: esta cierra localmente con el mismo motivo.
          set({ sesion: null, ultimaActividad: null, motivoCierre: p.motivoCierre ?? 'manual', generacion: get().generacion + 1 });
        } else if (p.ultimaActividad > sesion.ultimaActividad) {
          set({ sesion: { ...sesion, ultimaActividad: p.ultimaActividad }, ultimaActividad: p.ultimaActividad });
        }
      },
    }),
    {
      name: CLAVE_SESION,
      partialize: (s): Persistido => ({ ultimaActividad: s.ultimaActividad, motivoCierre: s.motivoCierre }),
      merge: (persistido, actual) => ({ ...actual, ...validar(persistido) }),
    },
  ),
);
