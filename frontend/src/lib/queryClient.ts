import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ErrorApi, ErrorAuth } from '@/services/contratos';
import { useSesion } from '@/store/sesion';

const STALE_TIME_MS = 5 * 60_000;

/** No reintenta errores 4xx; reintenta una vez errores de red, 5xx o desconocidos. */
export function debeReintentar(fallos: number, error: unknown): boolean {
  if (error instanceof ErrorApi && error.estado >= 400 && error.estado < 500) {
    return false;
  }
  if (error instanceof ErrorAuth && error.codigo !== 'RED') {
    return false;
  }
  return fallos < 1;
}

/** Crea el QueryClient del panel con reintentos acotados y cierre de sesión automático ante 401. */
export function crearQueryClient(): QueryClient {
  const ref: { cliente?: QueryClient } = {};

  const manejarError = (error: unknown) => {
    if (error instanceof ErrorApi && error.estado === 401) {
      const { sesion, cerrar } = useSesion.getState();
      if (sesion !== null) {
        cerrar('inactividad');
        ref.cliente?.clear();
      }
    }
  };

  const qc = new QueryClient({
    queryCache: new QueryCache({ onError: manejarError }),
    mutationCache: new MutationCache({ onError: manejarError }),
    defaultOptions: {
      queries: {
        retry: debeReintentar,
        staleTime: STALE_TIME_MS,
      },
    },
  });
  ref.cliente = qc;

  return qc;
}
