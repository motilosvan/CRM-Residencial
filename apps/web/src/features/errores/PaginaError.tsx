import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { Revelar } from '@/components/movimiento/Revelar';
import { Button } from '@/components/ui/button';
import { FOCO_SOBRE_OSCURO } from '@/lib/foco';
import { useSesion } from '@/store/sesion';

interface Props {
  /** Código HTTP que se muestra en grande ("403", "404"). */
  codigo: string;
  icono: LucideIcon;
  titulo: string;
  descripcion: string;
}

export function PaginaError({ codigo, icono: Icono, titulo, descripcion }: Props) {
  const slug = useSesion((s) => s.sesion?.conjuntoActivo.slug);
  const destino = slug ? `/app/${slug}/inicio` : '/';
  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-primary p-6 text-primary-foreground">
      <div aria-hidden="true" className="mf-reticula absolute inset-0 -z-10" />
      <Revelar className="mx-auto flex w-full max-w-md flex-col items-center text-center">
        <p aria-hidden="true" className="font-heading text-[clamp(6rem,28vw,10rem)] font-extrabold leading-none tracking-[-0.05em] text-acento">
          {codigo}
        </p>
        <span className="mt-6 grid size-11 place-items-center rounded-full border border-primary-foreground/25">
          <Icono aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 font-heading text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
        <p className="mt-3 max-w-sm text-pretty leading-relaxed text-primary-foreground/85">{descripcion}</p>
        <Button
          asChild
          variant="secondary"
          size="lg"
          className={`mt-8 bg-primary-foreground text-primary hover:bg-primary-foreground/90 ${FOCO_SOBRE_OSCURO}`}
        >
          <Link to={destino}>{slug ? 'Volver al inicio del panel' : 'Volver al inicio'}</Link>
        </Button>
      </Revelar>
    </main>
  );
}
