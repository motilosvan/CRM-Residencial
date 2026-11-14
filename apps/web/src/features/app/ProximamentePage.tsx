import { Hourglass } from 'lucide-react';
import { useLocation } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Revelar } from '@/components/movimiento/Revelar';
import { entradaDe } from './navegacion';

export default function ProximamentePage() {
  const { pathname } = useLocation();
  const entrada = entradaDe(pathname.split('/')[3] ?? '');
  return (
    <Revelar className="mx-auto max-w-2xl pt-6 sm:pt-12">
      <EmptyState
        icono={entrada?.icono ?? Hourglass}
        titulo={entrada ? `${entrada.etiqueta}: próximamente` : 'Próximamente'}
        descripcion={entrada?.detalle ?? 'Estamos preparando esta sección.'}
      />
    </Revelar>
  );
}
