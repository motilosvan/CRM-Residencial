import { KeyRound, Lightbulb, Scale, Timer } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

const GARANTIAS: { texto: string; icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }[] = [
  { texto: 'Código de un solo uso', icono: KeyRound },
  { texto: 'Sesión que se cierra sola a los 30 min', icono: Timer },
  { texto: 'Tratamiento según Ley 1581', icono: Scale },
  { texto: 'La IA solo sugiere', icono: Lightbulb },
];

function Lista({ copia = false }: { copia?: boolean }) {
  return (
    <ul
      aria-hidden={copia ? true : undefined}
      className={cn(
        'flex shrink-0 items-center gap-14 pr-14 motion-reduce:w-full motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-x-10 motion-reduce:gap-y-4 motion-reduce:pr-0',
        copia && 'motion-reduce:hidden',
      )}
    >
      {GARANTIAS.map(({ texto, icono: Icono }) => (
        <li key={texto} className="flex items-center gap-3 whitespace-nowrap text-sm motion-reduce:whitespace-normal font-medium text-foreground">
          <Icono className="size-4 text-primary" aria-hidden={true} />
          {texto}
        </li>
      ))}
    </ul>
  );
}

/** Cinta de garantías: solo hechos del producto. Se detiene con hover y con movimiento reducido; no contiene nada enfocable. */
export function Garantias() {
  return (
    <section
      aria-label="Garantías del servicio"
      className="mf-cinta overflow-hidden border-b border-border bg-background py-6"
    >
      <div className="mf-cinta-pista flex motion-reduce:w-full">
        <Lista />
        <Lista copia />
      </div>
    </section>
  );
}
