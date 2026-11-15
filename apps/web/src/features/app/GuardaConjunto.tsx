import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { EstadoError } from '@/components/EstadoError';
import { Skeleton } from '@/components/ui/skeleton';
import Pagina403 from '@/features/errores/Pagina403';
import Pagina404 from '@/features/errores/Pagina404';
import { useConjuntos } from '@/hooks/useConjuntos';
import { usePreferencias } from '@/store/preferencias';
import { useSesion } from '@/store/sesion';
import { aplicarTema } from '@/tema/aplicarTema';
import AppLayout from './AppLayout';

function EsqueletoCarga() {
  return (
    <div role="status" aria-label="Cargando" className="flex min-h-screen flex-col gap-4 p-6">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function GuardaConjunto() {
  const { conjunto: slug = '' } = useParams();
  const sesion = useSesion((s) => s.sesion);
  const estado = useSesion((s) => s.estado);
  const motivoCierre = useSesion((s) => s.motivoCierre);
  const errorCambio = useSesion((s) => s.errorCambio);
  const cambiarConjunto = useSesion((s) => s.cambiarConjunto);
  const recordarConjunto = usePreferencias((s) => s.recordarConjunto);
  const conjuntos = useConjuntos();

  const esPropio = !!sesion?.conjuntos.some((c) => c.slug === slug);
  const existe = !!conjuntos.data?.some((c) => c.slug === slug);
  const activoSlug = sesion?.conjuntoActivo.slug;
  const debeCambiar = !!sesion && existe && esPropio && slug !== activoSlug;

  useEffect(() => {
    if (debeCambiar) void cambiarConjunto(slug);
  }, [debeCambiar, slug, cambiarConjunto]);

  // El último conjunto activo (no solo el de la entrada) es el que el login preselecciona.
  useEffect(() => {
    if (activoSlug) recordarConjunto(activoSlug);
  }, [activoSlug, recordarConjunto]);

  const paleta = sesion?.conjuntoActivo.paleta;
  const hayActivo = !!sesion;
  useEffect(() => {
    if (hayActivo) aplicarTema(paleta);
  }, [hayActivo, activoSlug, paleta]);

  useEffect(() => () => void aplicarTema(), []);

  if (estado === 'cargando') {
    return <EsqueletoCarga />;
  }
  if (!sesion) {
    return <Navigate replace to={motivoCierre === 'inactividad' ? '/login?motivo=inactividad' : '/login'} />;
  }
  if (conjuntos.isPending) {
    return <EsqueletoCarga />;
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
  if (debeCambiar && errorCambio === 'SIN_MEMBRESIA') return <Pagina403 />;
  if (debeCambiar && errorCambio) {
    return (
      <div className="p-6">
        <EstadoError alReintentar={() => void cambiarConjunto(slug)} />
      </div>
    );
  }
  if (debeCambiar) return null;

  return <AppLayout />;
}
