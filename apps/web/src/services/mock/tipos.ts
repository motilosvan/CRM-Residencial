export interface OpcionesMock {
  /** [mínimo, máximo] en ms. Por defecto [300, 900]. */
  latenciaMs?: [number, number];
  /** Probabilidad (0–1) de rechazar con `ErrorAuth('RED')`. Por defecto 0. */
  tasaError?: number;
  sinConjuntos?: boolean;
  /** Reloj inyectable (epoch ms). Por defecto `Date.now`. */
  ahora?: () => number;
}
