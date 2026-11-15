import { Skeleton } from '@/components/ui/skeleton';

export function EsqueletoCarga() {
  return (
    <div role="status" aria-label="Cargando" className="flex min-h-screen flex-col gap-4 p-6">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
