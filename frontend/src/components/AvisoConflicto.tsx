import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface AvisoConflictoProps {
  alRecargar: () => void;
  descripcion?: string;
  className?: string;
}

const DESCRIPCION_DEFECTO = 'Recarga para ver la versión más reciente antes de volver a guardar.';

/** Aviso accesible para conflictos de concurrencia (HTTP 409) con acción directa de recarga. */
export function AvisoConflicto({ alRecargar, descripcion = DESCRIPCION_DEFECTO, className }: AvisoConflictoProps) {
  return (
    <Alert className={cn('border-aviso bg-aviso-claro text-foreground', className)}>
      <TriangleAlert aria-hidden="true" className="text-aviso" />
      <AlertTitle>Otra persona cambió este registro</AlertTitle>
      <AlertDescription className="text-foreground">
        {descripcion && <p>{descripcion}</p>}
        <Button type="button" variant="outline" size="sm" onClick={alRecargar} className="mt-2">
          <RefreshCw aria-hidden="true" />
          Recargar
        </Button>
      </AlertDescription>
    </Alert>
  );
}
