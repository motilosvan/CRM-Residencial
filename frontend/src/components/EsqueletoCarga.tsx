import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
}

export function EsqueletoCarga({ className }: Props) {
  return (
    <div role="status" aria-label="Cargando" className={cn('flex min-h-screen flex-col gap-4 p-6', className)}>
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
