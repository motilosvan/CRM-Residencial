import { useState } from 'react';

/** Lee la preferencia del sistema. Sin `matchMedia` (jsdom) no hay preferencia. */
export function pideMovimientoReducido(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Preferencia de movimiento reducido, leída una vez al montar. */
export function useMovimientoReducido(): boolean {
  const [reducido] = useState(pideMovimientoReducido);
  return reducido;
}
