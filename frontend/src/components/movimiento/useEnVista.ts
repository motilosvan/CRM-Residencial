import { useEffect, useRef, useState, type RefObject } from 'react';
import { pideMovimientoReducido } from './useMovimientoReducido';

interface Opciones {
  /** Fracción visible que cuenta como "en vista". */
  umbral?: number;
  /** Margen del observador, p. ej. "0px 0px -10% 0px". */
  margen?: string;
  /** Si es true sigue observando y vuelve a false al salir de pantalla. */
  repetir?: boolean;
}

function sinObservador(): boolean {
  return typeof IntersectionObserver === 'undefined' || pideMovimientoReducido();
}

/**
 * Devuelve [ref, enVista]. Sin IntersectionObserver o con movimiento reducido,
 * `enVista` es true desde el inicio y no se crea ningún observador.
 */
export function useEnVista<T extends Element = HTMLDivElement>(
  { umbral = 0.15, margen = '0px 0px -8% 0px', repetir = false }: Opciones = {},
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [enVista, setEnVista] = useState(sinObservador);

  useEffect(() => {
    const nodo = ref.current;
    if (sinObservador() || !nodo) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            setEnVista(true);
            if (!repetir) observador.disconnect();
          } else if (repetir) {
            setEnVista(false);
          }
        }
      },
      { threshold: umbral, rootMargin: margen },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [umbral, margen, repetir]);

  return [ref, enVista];
}
