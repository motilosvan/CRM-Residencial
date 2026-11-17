import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const ESTADOS = ['NUEVA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA'] as const;
export type EstadoSolicitud = (typeof ESTADOS)[number];

export const PRIORIDADES = ['ALTA', 'MEDIA', 'BAJA'] as const;
export type PrioridadSolicitud = (typeof PRIORIDADES)[number];

export const CATEGORIAS = ['SEGURIDAD', 'MANTENIMIENTO', 'FACTURACION', 'ADMINISTRATIVO', 'SIN_CLASIFICAR'] as const;
export type CategoriaSolicitud = (typeof CATEGORIAS)[number];

interface DefinicionInsignia {
  etiqueta: string;
  clase: string;
}

const RESPUESTA_DESCONOCIDA = 'bg-muted text-muted-foreground';

const MAPA_ESTADOS: Record<EstadoSolicitud, DefinicionInsignia> = {
  NUEVA: { etiqueta: 'Nueva', clase: 'bg-primary-claro text-primary' },
  ASIGNADA: { etiqueta: 'Asignada', clase: 'bg-secondary text-secondary-foreground' },
  EN_PROCESO: { etiqueta: 'En proceso', clase: 'bg-aviso-claro text-aviso' },
  RESUELTA: { etiqueta: 'Resuelta', clase: 'bg-exito-claro text-exito' },
  CERRADA: { etiqueta: 'Cerrada', clase: 'bg-muted text-muted-foreground' },
};

const MAPA_PRIORIDADES: Record<PrioridadSolicitud, DefinicionInsignia> = {
  ALTA: { etiqueta: 'Alta', clase: 'bg-destructive-claro text-destructive' },
  MEDIA: { etiqueta: 'Media', clase: 'bg-aviso-claro text-aviso' },
  BAJA: { etiqueta: 'Baja', clase: 'bg-muted text-muted-foreground' },
};

const MAPA_CATEGORIAS: Record<CategoriaSolicitud, DefinicionInsignia> = {
  SEGURIDAD: { etiqueta: 'Seguridad', clase: 'bg-destructive-claro text-destructive' },
  MANTENIMIENTO: { etiqueta: 'Mantenimiento', clase: 'bg-aviso-claro text-aviso' },
  FACTURACION: { etiqueta: 'Facturación', clase: 'bg-primary-claro text-primary' },
  ADMINISTRATIVO: { etiqueta: 'Administrativo', clase: 'bg-secondary text-secondary-foreground' },
  SIN_CLASIFICAR: { etiqueta: 'Sin clasificar', clase: 'bg-muted text-muted-foreground' },
};

function Insignia({
  valor,
  mapa,
  className,
}: {
  valor: string;
  mapa: Record<string, DefinicionInsignia>;
  className?: string;
}) {
  const def = Object.hasOwn(mapa, valor)
    ? mapa[valor]
    : { etiqueta: valor, clase: RESPUESTA_DESCONOCIDA };
  return (
    <Badge variant="secondary" data-valor={valor} className={cn(def.clase, className)}>
      {def.etiqueta}
    </Badge>
  );
}

/** Insignia de estado de una solicitud, con etiqueta en español y respaldo seguro. */
export function InsigniaEstado({ estado, className }: { estado: EstadoSolicitud | (string & {}); className?: string }) {
  return <Insignia valor={estado} mapa={MAPA_ESTADOS} className={className} />;
}

/** Insignia de prioridad de una solicitud, con etiqueta en español y respaldo seguro. */
export function InsigniaPrioridad({ prioridad, className }: { prioridad: PrioridadSolicitud | (string & {}); className?: string }) {
  return <Insignia valor={prioridad} mapa={MAPA_PRIORIDADES} className={className} />;
}

/** Insignia de categoría de una solicitud, con etiqueta en español y respaldo seguro. */
export function InsigniaCategoria({ categoria, className }: { categoria: CategoriaSolicitud | (string & {}); className?: string }) {
  return <Insignia valor={categoria} mapa={MAPA_CATEGORIAS} className={className} />;
}
