import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { useSesion } from '@/store/sesion';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60_000 } },
});

export function Proveedores({ children }: { children: ReactNode }) {
  // La sesión real está en una cookie httpOnly: se pregunta al servidor una vez al arrancar.
  useEffect(() => {
    void useSesion.getState().rehidratar();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster theme="light" containerAriaLabel="Notificaciones" />
    </QueryClientProvider>
  );
}
