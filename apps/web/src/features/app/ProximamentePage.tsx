import { Hourglass } from 'lucide-react';
import { useLocation } from 'react-router';
import { Revelar } from '@/components/movimiento/Revelar';
import { Card, CardContent } from '@/components/ui/card';
import { entradaDe } from './navegacion';

export default function ProximamentePage() {
  const { pathname } = useLocation();
  const entrada = entradaDe(pathname.split('/')[3] ?? '');
  const Icono = entrada?.icono ?? Hourglass;
  return (
    <Revelar className="mx-auto max-w-xl pt-6 sm:pt-12">
      <Card>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary-claro text-foreground">
            <Icono aria-hidden="true" className="size-7" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">En preparación</p>
            <h2 className="mt-1 font-heading text-xl font-semibold">{entrada ? `${entrada.etiqueta}: próximamente` : 'Próximamente'}</h2>
            <p className="mt-1.5 text-muted-foreground">{entrada?.detalle ?? 'Estamos preparando esta sección.'}</p>
          </div>
        </CardContent>
      </Card>
    </Revelar>
  );
}
