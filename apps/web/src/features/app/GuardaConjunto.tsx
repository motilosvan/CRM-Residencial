import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { EstadoError } from '@/components/EstadoError';
import { Skeleton } from '@/components/ui/skeleton';
import Pagina403 from '@/features/errores/Pagina403';
import Pagina404 from '@/features/errores/Pagina404';
import { useConjuntos } from '@/hooks/useConjuntos';
import { useSesion } from '@/store/sesion';
import { aplicarTema } from '@/tema/aplicarTema';
import AppLayout from './AppLayout';

export default function GuardaConjunto() {
  const { conjunto: slug = '' } = useParams();
  const sesion = useSesion((s) => s.sesion);
  const motivoCierre = useSesion((s) => s.motivoCierre);
  const cambiarConjunto = useSesion((s) => s.cambiarConjunto);
  const conjuntos = useConjuntos();

  const esPropio = !!sesion?.conjuntos.some((c) => c.slug === slug);
  const existe = !!conjuntos.data?.some((c) => c.slug === slug);
  const activoSlug = sesion?.conjuntoActivo.slug;
  const debeCambiar = !!sesion && existe && esPropio && slug !== activoSlug;

  useEffect(() => {
    if (debeCambiar) cambiarConjunto(slug);
  }, [debeCambiar, slug, cambiarConjunto]);

  const paleta = sesion?.conjuntoActivo.paleta;
  const hayActivo = !!sesion;
  useEffect(() => {
    if (hayActivo) aplicarTema(paleta);
  }, [hayActivo, activoSlug, paleta]);

  useEffect(() => () => void aplicarTema(), []);

  if (!sesion) {
    return <Navigate replace to={motivoCierre === 'inactividad' ? '/login?motivo=inactividad' : '/login'} />;
  }
  if (conjuntos.isPending) {
    return (
      <div role="status" aria-label="Cargando" className="flex min-h-screen flex-col gap-4 p-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (conjuntos.isError && conjuntos.data === undefined) {
    return (
      <div className="p-6">
        <EstadoError alReintentar={() => void conjuntos.refetch()} />
      </div>
    );
  }
  if (!existe) return <Pagina404 />;
  if (!esPropio) return <Pagina403 />;
  if (debeCambiar) return null;

  return <AppLayout />;
}
