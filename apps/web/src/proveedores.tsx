import { useEffect, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { crearQueryClient } from '@/lib/queryClient';
import { useSesion } from '@/store/sesion';

const queryClient = crearQueryClient();

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
