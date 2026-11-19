import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  mensaje?: string;
  alReintentar: () => void;
}

export function EstadoError({ mensaje = 'No pudimos cargar la información. Revisa tu conexión e inténtalo de nuevo.', alReintentar }: Props) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-lg border border-destructive p-6 text-center md:p-12">
      <TriangleAlert aria-hidden="true" className="size-6 text-destructive" />
      <p className="max-w-sm text-sm text-foreground">{mensaje}</p>
      <Button variant="outline" onClick={alReintentar}>
        Reintentar
      </Button>
    </div>
  );
}
