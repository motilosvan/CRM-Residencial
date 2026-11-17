import type { Sesion } from '@/types/conjunto';

let sesionMockActual: Sesion | null = null;

/** Sesión mock activa en memoria para alinear mocks (p. ej. rol SOPORTE en `solicitudesMock`) sin crear ciclos con `store/sesion`. */
export function getSesionMock(): Sesion | null {
  return sesionMockActual ? structuredClone(sesionMockActual) : null;
}

export function setSesionMock(sesion: Sesion | null): void {
  sesionMockActual = sesion ? structuredClone(sesion) : null;
}
