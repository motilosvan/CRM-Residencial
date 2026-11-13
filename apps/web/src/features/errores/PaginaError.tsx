import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { useSesion } from '@/store/sesion';

interface Props {
  icono: LucideIcon;
  titulo: string;
  descripcion: ReactNode;
}

export function PaginaError({ icono, titulo, descripcion }: Props) {
  const slug = useSesion((s) => s.sesion?.conjuntoActivo.slug);
  const destino = slug ? `/app/${slug}/inicio` : '/';
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <EmptyState
        nivel={1}
        icono={icono}
        titulo={titulo}
        descripcion={String(descripcion)}
        accion={
          <Button asChild>
            <Link to={destino}>{slug ? 'Volver al inicio del panel' : 'Volver al inicio'}</Link>
          </Button>
        }
      />
    </main>
  );
}
