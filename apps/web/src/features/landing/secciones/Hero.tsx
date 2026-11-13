import { ArrowDown, Mail } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function CorreoAClasificar() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
          <Mail className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">Residente · Torre 2</p>
          <p className="text-xs text-muted-foreground">Correo recibido</p>
        </div>
      </div>
      <p className="mt-4 font-heading text-base font-semibold text-foreground">
        Fuga de agua en el parqueadero
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Buenos días, desde ayer gotea el techo del sótano y ya hay un charco junto a mi puesto.
      </p>
    </div>
  );
}

function SolicitudCreada() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-md sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">Solicitud</p>
        <Badge variant="secondary">Nueva</Badge>
      </div>
      <p className="mt-3 font-heading text-base font-semibold text-foreground">
        Fuga de agua en el parqueadero
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-muted-foreground">Categoría</dt>
        <dd>
          <Badge variant="outline">Mantenimiento</Badge>
        </dd>
        <dt className="text-muted-foreground">Prioridad</dt>
        <dd>
          <Badge className="bg-accent text-accent-foreground">Alta</Badge>
        </dd>
        <dt className="text-muted-foreground">Responsable</dt>
        <dd className="text-foreground">Por asignar</dd>
      </dl>
    </div>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="titulo-hero" className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:py-28">
        <div>
          <h1
            id="titulo-hero"
            className="max-w-[18ch] text-4xl font-extrabold leading-[1.08] tracking-tight text-primary sm:text-5xl lg:text-6xl"
          >
            Cada correo, una solicitud con dueño
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
            Tus residentes siguen escribiendo al correo de siempre. MailFlow lo convierte en una
            solicitud clasificada, priorizada y con seguimiento para que administración y soporte
            sepan qué atender primero.
          </p>
          <div className="mt-8">
            <Button asChild size="lg">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative mx-auto w-full max-w-md lg:max-w-none lg:pl-6"
        >
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700 motion-safe:fill-mode-both">
            <CorreoAClasificar />
          </div>
          <div className="flex flex-col items-center py-2 text-accent">
            <span className="h-5 w-0.5 rounded-full bg-accent" />
            <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <ArrowDown className="size-4" />
            </span>
            <span className="h-3 w-0.5 rounded-full bg-accent" />
          </div>
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:delay-500 motion-safe:duration-700 motion-safe:fill-mode-both xl:translate-x-6">
            <SolicitudCreada />
          </div>
        </div>
      </div>
    </section>
  );
}
