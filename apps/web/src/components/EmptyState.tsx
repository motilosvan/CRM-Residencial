import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

interface Props {
  icono?: LucideIcon;
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  variante?: 'sin-datos' | 'sin-resultados';
  /** Nivel del encabezado del título (por defecto 2). */
  nivel?: 1 | 2 | 3;
}

export function EmptyState({ icono: Icono, titulo, descripcion, accion, variante = 'sin-datos', nivel = 2 }: Props) {
  return (
    <Empty data-variante={variante} className="border">
      <EmptyHeader>
        {Icono && (
          <EmptyMedia variant="icon">
            <Icono aria-hidden="true" />
          </EmptyMedia>
        )}
        <EmptyTitle role="heading" aria-level={nivel} className="font-heading">{titulo}</EmptyTitle>
        {descripcion && <EmptyDescription>{descripcion}</EmptyDescription>}
      </EmptyHeader>
      {accion && <EmptyContent>{accion}</EmptyContent>}
    </Empty>
  );
}
