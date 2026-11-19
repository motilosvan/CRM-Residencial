import { useEffect, useState } from 'react';

/** Segundos que faltan para `hasta` (epoch ms). Se actualiza cada segundo y se detiene en 0. */
export function useCuentaRegresiva(hasta: number): number {
  const [ahora, setAhora] = useState(Date.now);
  const restan = Math.max(0, Math.ceil((hasta - ahora) / 1000));

  useEffect(() => {
    const refrescar = () => {
      const t = Date.now();
      setAhora(t);
      if (t >= hasta) clearInterval(id);
    };
    const id = setInterval(refrescar, 1000);
    // Al cambiar `hasta` (reenvío) se refresca de inmediato, fuera del cuerpo del efecto.
    const inicial = setTimeout(refrescar, 0);
    return () => {
      clearInterval(id);
      clearTimeout(inicial);
    };
  }, [hasta]);

  return restan;
}
