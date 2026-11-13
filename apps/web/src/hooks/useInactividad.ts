import { useCallback, useEffect, useRef, useState } from 'react';
import { estadoInactividad, useSesion } from '@/store/sesion';

export const TOPE_ESCRITURA_MS = 15_000;

const CLAVE_SESION = 'mailflow.sesion';
const EVENTOS_VENTANA = ['keydown', 'pointerdown', 'pointermove', 'scroll'] as const;

interface Aviso {
  visible: boolean;
  segundos: number;
}

const SIN_AVISO: Aviso = { visible: false, segundos: 0 };

/**
 * Cierra la sesión a los 30 min sin actividad y avisa 1 min antes. Se monta una sola vez, en el
 * layout del panel.
 */
export function useInactividad(): {
  avisoVisible: boolean;
  segundosRestantes: number;
  seguir(): void;
} {
  const haySesion = useSesion((s) => s.sesion !== null);
  const [aviso, setAviso] = useState<Aviso>(SIN_AVISO);
  const avisoRef = useRef(false);
  const ultimaEscrituraRef = useRef(0);

  const actualizarAviso = useCallback((siguiente: Aviso) => {
    avisoRef.current = siguiente.visible;
    setAviso((previo) =>
      previo.visible === siguiente.visible && previo.segundos === siguiente.segundos ? previo : siguiente,
    );
  }, []);

  /** Compara con el reloj; cierra si venció. Devuelve true si la sesión sigue abierta. */
  const evaluar = useCallback((): boolean => {
    const { sesion, cerrar } = useSesion.getState();
    if (!sesion) {
      actualizarAviso(SIN_AVISO);
      return false;
    }
    const e = estadoInactividad(sesion.ultimaActividad, Date.now());
    if (e.vencida) {
      cerrar('inactividad');
      actualizarAviso(SIN_AVISO);
      return false;
    }
    actualizarAviso(
      e.avisar ? { visible: true, segundos: Math.ceil(e.msRestantes / 1000) } : SIN_AVISO,
    );
    return true;
  }, [actualizarAviso]);

  const seguir = useCallback(() => {
    const ahora = Date.now();
    ultimaEscrituraRef.current = ahora;
    useSesion.getState().registrarActividad(ahora);
    evaluar();
  }, [evaluar]);

  useEffect(() => {
    if (!haySesion) return;

    const alHaberActividad = () => {
      // Antes de contar la actividad, comprueba que la sesión no haya vencido ya.
      if (!evaluar() || avisoRef.current) return;
      const ahora = Date.now();
      if (ahora - ultimaEscrituraRef.current < TOPE_ESCRITURA_MS) return;
      ultimaEscrituraRef.current = ahora;
      useSesion.getState().registrarActividad(ahora);
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') alHaberActividad();
      else evaluar();
    };

    const alCambiarAlmacenamiento = (e: StorageEvent) => {
      if (e.key !== CLAVE_SESION && e.key !== null) return;
      void useSesion.persist.rehydrate();
      evaluar();
    };

    for (const tipo of EVENTOS_VENTANA) {
      window.addEventListener(tipo, alHaberActividad, { passive: true });
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('storage', alCambiarAlmacenamiento);
    const intervalo = window.setInterval(evaluar, 1000);

    return () => {
      for (const tipo of EVENTOS_VENTANA) window.removeEventListener(tipo, alHaberActividad);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('storage', alCambiarAlmacenamiento);
      window.clearInterval(intervalo);
      actualizarAviso(SIN_AVISO);
    };
  }, [haySesion, evaluar, actualizarAviso]);

  const activo = haySesion && aviso.visible;
  return { avisoVisible: activo, segundosRestantes: activo ? aviso.segundos : 0, seguir };
}
