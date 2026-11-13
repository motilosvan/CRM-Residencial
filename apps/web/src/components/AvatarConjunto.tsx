import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Conjunto } from '@/types/conjunto';

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e']);

/** Hasta 2 iniciales de las palabras significativas del nombre. */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter((p) => p && !PARTICULAS.has(p.toLowerCase()))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

interface Props {
  conjunto: Pick<Conjunto, 'nombre' | 'logoUrl'>;
  tamano?: 'sm' | 'md' | 'lg';
}

const SIZE = { sm: 'sm', md: 'default', lg: 'lg' } as const;

export function AvatarConjunto({ conjunto, tamano = 'md' }: Props) {
  return (
    <Avatar size={SIZE[tamano]} title={conjunto.nombre}>
      {conjunto.logoUrl && <AvatarImage src={conjunto.logoUrl} alt={`Logo de ${conjunto.nombre}`} />}
      <AvatarFallback className="bg-primary font-heading font-semibold text-primary-foreground">
        {iniciales(conjunto.nombre)}
      </AvatarFallback>
    </Avatar>
  );
}
