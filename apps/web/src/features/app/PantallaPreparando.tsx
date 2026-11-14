import { AvatarConjunto } from '@/components/AvatarConjunto';
import { useMovimientoReducido } from '@/components/movimiento/useMovimientoReducido';
import { cn } from '@/lib/utils';
import type { Conjunto } from '@/types/conjunto';

/** Pantalla breve al entrar o cambiar de conjunto: el avatar respira dentro de un halo del color del conjunto. */
export default function PantallaPreparando({ conjunto }: { conjunto: Pick<Conjunto, 'nombre' | 'logoUrl'> }) {
  const reducido = useMovimientoReducido();
  return (
    <div
      role="status"
      className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-background p-6 text-center"
    >
      <div className="relative flex size-28 items-center justify-center">
        <span
          aria-hidden="true"
          className={cn('mf-resplandor-a absolute inset-0 rounded-full', !reducido && 'mf-halo')}
        />
        <span aria-hidden="true" className="absolute inset-3 rounded-full bg-card shadow-sm ring-1 ring-border" />
        <span className="relative">
          <AvatarConjunto conjunto={conjunto} tamano="lg" />
        </span>
      </div>
      <p className="relative font-heading text-lg font-semibold text-foreground">
        Preparando tu espacio de {conjunto.nombre}…
      </p>
    </div>
  );
}
