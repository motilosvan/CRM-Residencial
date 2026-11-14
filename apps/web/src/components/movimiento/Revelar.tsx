import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { useEnVista } from './useEnVista';

interface Props extends ComponentProps<'div'> {
  /** Milisegundos de espera antes de la entrada (para escalonar). */
  retraso?: number;
}

/** Entrada con desplazamiento y fundido al aparecer en pantalla. El contenido siempre está en el DOM. */
export function Revelar({ retraso = 0, className, style, children, ...resto }: Props) {
  const [ref, enVista] = useEnVista<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-revelado={enVista}
      style={{ transitionDelay: retraso ? `${retraso}ms` : undefined, ...style }}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-out',
        enVista ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0',
        className,
      )}
      {...resto}
    >
      {children}
    </div>
  );
}
