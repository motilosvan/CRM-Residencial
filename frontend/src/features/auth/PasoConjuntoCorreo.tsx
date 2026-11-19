import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { EmptyState } from '@/components/EmptyState';
import { EstadoError } from '@/components/EstadoError';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useConjuntos } from '@/hooks/useConjuntos';
import { authService } from '@/services';
import { ErrorAuth, type CodigoEnviado } from '@/services/contratos';
import { usePreferencias } from '@/store/preferencias';
import type { Conjunto } from '@/types/conjunto';
import { esquemaPaso1, type ValoresPaso1 } from './esquemas';
import { SelectorConjunto } from './SelectorConjunto';

export interface ResultadoPaso1 {
  conjunto: Conjunto;
  correo: string;
  envio: CodigoEnviado;
  /** Si el correo ya estaba bloqueado, hasta cuándo (epoch ms). */
  desbloqueoEn?: number;
}

interface Props {
  borrador: Partial<ValoresPaso1>;
  alContinuar: (r: ResultadoPaso1) => void;
}

const VIGENCIA_MS = 10 * 60_000;
const REENVIO_MS = 60_000;

export function PasoConjuntoCorreo({ borrador, alContinuar }: Props) {
  const consulta = useConjuntos();
  const ultimoSlug = usePreferencias((s) => s.ultimoConjuntoSlug);
  const [errorEnvio, setErrorEnvio] = useState(false);
  const enVuelo = useRef(false);
  const selectorRef = useRef<HTMLButtonElement>(null);

  const form = useForm<ValoresPaso1>({
    resolver: zodResolver(esquemaPaso1),
    defaultValues: { conjuntoId: borrador.conjuntoId ?? '', correo: borrador.correo ?? '' },
  });

  const conjuntos = consulta.data;
  const listo = conjuntos !== undefined;
  const sinConjuntos = listo && conjuntos.length === 0;

  // Preselecciona el último conjunto usado, una vez cargada la lista y solo si aún no se eligió ninguno.
  useEffect(() => {
    if (!conjuntos || form.getValues('conjuntoId')) return;
    const recordado = conjuntos.find((c) => c.slug === ultimoSlug);
    if (recordado) form.setValue('conjuntoId', recordado.id);
  }, [conjuntos, ultimoSlug, form]);

  // Foco al primer campo en cuanto el selector está disponible.
  useEffect(() => {
    if (listo && !sinConjuntos) selectorRef.current?.focus();
  }, [listo, sinConjuntos]);

  async function enviar(v: ValoresPaso1) {
    if (enVuelo.current || !conjuntos) return;
    const conjunto = conjuntos.find((c) => c.id === v.conjuntoId);
    if (!conjunto) return;
    enVuelo.current = true;
    setErrorEnvio(false);
    const correo = v.correo.trim();
    try {
      const envio = await authService.solicitarCodigo({ conjuntoId: conjunto.id, correo });
      alContinuar({ conjunto, correo, envio });
    } catch (e) {
      const t = Date.now();
      if (e instanceof ErrorAuth && e.codigo === 'REENVIO_PRONTO') {
        // Ya hay un código vigente (volvió con "Cambiar correo"): se sigue igual, sin revelar nada.
        alContinuar({ conjunto, correo, envio: { venceEn: t + VIGENCIA_MS, reenvioDisponibleEn: t + REENVIO_MS } });
      } else if (e instanceof ErrorAuth && e.codigo === 'BLOQUEADO') {
        alContinuar({ conjunto, correo, envio: { venceEn: t, reenvioDisponibleEn: t }, desbloqueoEn: e.desbloqueoEn });
      } else {
        setErrorEnvio(true);
      }
    } finally {
      enVuelo.current = false;
    }
  }

  const enviando = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={(e) => void form.handleSubmit(enviar)(e)} noValidate className="grid gap-5">
        <FormField
          control={form.control}
          name="conjuntoId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conjunto</FormLabel>
              {consulta.isPending ? (
                <Skeleton className="h-11 w-full" aria-label="Cargando conjuntos" role="status" />
              ) : consulta.isError && consulta.data === undefined ? (
                <EstadoError mensaje="No pudimos cargar los conjuntos. Revisa tu conexión e inténtalo de nuevo." alReintentar={() => void consulta.refetch()} />
              ) : (
                <>
                  <FormControl>
                    <SelectorConjunto
                      ref={selectorRef}
                      conjuntos={conjuntos ?? []}
                      valor={field.value}
                      alCambiar={field.onChange}
                      disabled={sinConjuntos}
                      marcador={sinConjuntos ? 'Sin conjuntos disponibles' : 'Elige tu conjunto'}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  {sinConjuntos && (
                    <EmptyState
                      nivel={3}
                      icono={Building2}
                      titulo="Aún no hay conjuntos habilitados"
                      descripcion="Cuando tu administración habilite uno, podrás ingresar desde aquí."
                    />
                  )}
                </>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="correo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Correo electrónico</FormLabel>
              <FormControl>
                <Input type="email" inputMode="email" autoComplete="email" placeholder="nombre@ejemplo.com" className="h-11" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {errorEnvio && (
          <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
            No pudimos enviar el código. Revisa tu conexión e inténtalo de nuevo.
          </p>
        )}

        <Button type="submit" size="lg" disabled={enviando || !listo || sinConjuntos} className="group h-11">
          {enviando ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin" />
              Enviando código…
            </>
          ) : (
            <>
              Enviar código
              <Send aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </>
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          ¿No encuentras tu conjunto? Comunícate con tu administración
        </p>
      </form>
    </Form>
  );
}
