import { ArrowRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = Pick<ComponentProps<typeof Button>, 'size' | 'variant'> & {
  className?: string;
  /** Clase del destello que barre al pasar el cursor (debe contrastar con el botón). */
  brillo?: string;
};

/** Único destino de acceso de la landing: flecha que se desliza y destello al pasar el cursor. */
export function BotonAcceso({ size = 'lg', variant = 'default', className, brillo = 'bg-primary-foreground/30' }: Props) {
  return (
    <Button asChild size={size} variant={variant} className={cn('group relative overflow-hidden', className)}>
      <Link to="/login">
        <span className="relative z-10">Iniciar sesión</span>
        <ArrowRight
          aria-hidden="true"
          className="relative z-10 transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1"
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full -skew-x-12 opacity-0 transition-[transform,opacity] duration-700 ease-out group-hover:translate-x-[320%] group-hover:opacity-100',
            brillo,
          )}
        />
      </Link>
    </Button>
  );
}
