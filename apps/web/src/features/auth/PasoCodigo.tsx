import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { authService, CODIGO_DEMO } from '@/services';
import { ErrorAuth, type CodigoEnviado } from '@/services/contratos';
import { usePreferencias } from '@/store/preferencias';
import { useSesion } from '@/store/sesion';
import type { Conjunto } from '@/types/conjunto';
import { esquemaPaso2, MENSAJE_NEUTRO, normalizarCodigo, type ValoresPaso2 } from './esquemas';
import { useCuentaRegresiva } from './useCuentaRegresiva';

const REENVIO_MS = 60_000;
const ID_ERROR = 'error-codigo';

type ErrorCodigo =
  | { tipo: 'incorrecto'; intentos: number }
  | { tipo: 'bloqueado'; hasta?: number }
  | { tipo: 'vencido' }
  | { tipo: 'red' }
  | { tipo: 'reenvio' };

interface Props {
  conjunto: Conjunto;
  correo: string;
  envio: CodigoEnviado;
  desbloqueoEn?: number;
  alCambiarCorreo: () => void;
}

/** Hora local con punto final solo si el formato no lo trae ("10:41 a. m." ya termina en punto). */
function horaConPunto(epoch: number): string {
  // Espacios de no separación: "10:41 a. m." no debe partirse entre líneas.
  const h = new Date(epoch).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '\u00a0');
  return h.endsWith('.') ? h : `${h}.`;
}

function textoError(e: ErrorCodigo): string {
  switch (e.tipo) {
    case 'incorrecto':
      return `Código incorrecto. Te quedan ${e.intentos} ${e.intentos === 1 ? 'intento' : 'intentos'}.`;
    case 'bloqueado':
      return e.hasta
        ? `Superaste los intentos permitidos. Podrás volver a intentarlo a las ${horaConPunto(e.hasta)}`
        : 'Superaste los intentos permitidos. Podrás volver a intentarlo en unos minutos.';
    case 'vencido':
      return 'El código venció. Pide uno nuevo con "Reenviar código".';
    case 'reenvio':
      return 'No pudimos enviar un código nuevo. Inténtalo de nuevo en un momento.';
    case 'red':
      return 'No pudimos verificar el código. Revisa tu conexión e inténtalo de nuevo.';
  }
}

export function PasoCodigo({ conjunto, correo, envio: envioInicial, desbloqueoEn, alCambiarCorreo }: Props) {
  const navigate = useNavigate();
  const iniciar = useSesion((s) => s.iniciar);
  const recordarConjunto = usePreferencias((s) => s.recordarConjunto);
  const [envio, setEnvio] = useState(envioInicial);
  const [error, setError] = useState<ErrorCodigo | null>(desbloqueoEn ? { tipo: 'bloqueado', hasta: desbloqueoEn } : null);
  const [verificando, setVerificando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [fallos, setFallos] = useState(0);
  // Al vencer el bloqueo el código anterior ya no sirve: hay que pedir uno nuevo.
  const [requiereNuevo, setRequiereNuevo] = useState(false);
  const enVuelo = useRef(false);
  const campoRef = useRef<HTMLInputElement>(null);
  const pedirFoco = useRef(false);

  const form = useForm<ValoresPaso2>({ resolver: zodResolver(esquemaPaso2), defaultValues: { codigo: '' } });
  const segundos = useCuentaRegresiva(envio.reenvioDisponibleEn);
  const bloqueado = error?.tipo === 'bloqueado';

  const hastaBloqueo = error?.tipo === 'bloqueado' ? error.hasta : undefined;
  const campoDeshabilitado = verificando || bloqueado || requiereNuevo;

  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  // El foco vuelve al campo cuando este se reactiva tras un error (no antes: deshabilitado no lo recibe).
  useEffect(() => {
    if (pedirFoco.current && !campoDeshabilitado) {
      pedirFoco.current = false;
      campoRef.current?.focus();
    }
  });

  useEffect(() => {
    if (!hastaBloqueo) return;
    const t = setTimeout(() => {
      setError(null);
      setRequiereNuevo(true);
    }, Math.max(0, hastaBloqueo - Date.now()));
    return () => clearTimeout(t);
  }, [hastaBloqueo]);

  async function verificar({ codigo }: ValoresPaso2) {
    if (enVuelo.current || bloqueado) return;
    enVuelo.current = true;
    setVerificando(true);
    setError(null);
    try {
      const sesion = await authService.verificarCodigo({ conjuntoId: conjunto.id, correo, codigo });
      iniciar(sesion);
      recordarConjunto(sesion.conjuntoActivo.slug);
      navigate(`/app/${sesion.conjuntoActivo.slug}`);
      return;
    } catch (e) {
      if (e instanceof ErrorAuth && e.codigo === 'CODIGO_INCORRECTO') {
        setError({ tipo: 'incorrecto', intentos: e.intentosRestantes ?? 0 });
        setFallos((n) => n + 1);
      } else if (e instanceof ErrorAuth && e.codigo === 'BLOQUEADO') {
        setError({ tipo: 'bloqueado', hasta: e.desbloqueoEn });
      } else if (e instanceof ErrorAuth && e.codigo === 'CODIGO_VENCIDO') {
        setError({ tipo: 'vencido' });
      } else {
        setError({ tipo: 'red' });
      }
      form.reset({ codigo: '' });
    }
    enVuelo.current = false;
    pedirFoco.current = true;
    setVerificando(false);
  }

  async function reenviar() {
    if (reenviando || segundos > 0) return;
    setReenviando(true);
    setError(null);
    try {
      setEnvio(await authService.solicitarCodigo({ conjuntoId: conjunto.id, correo }));
      setRequiereNuevo(false);
      form.reset({ codigo: '' });
      pedirFoco.current = true;
    } catch (e) {
      if (e instanceof ErrorAuth && e.codigo === 'BLOQUEADO') setError({ tipo: 'bloqueado', hasta: e.desbloqueoEn });
      else if (e instanceof ErrorAuth && e.codigo === 'REENVIO_PRONTO') {
        // El servidor aún tiene un código reciente: no es un fallo. Se rearma la espera sin avisar.
        setEnvio((a) => ({ ...a, reenvioDisponibleEn: Date.now() + REENVIO_MS }));
      } else setError({ tipo: 'reenvio' });
    } finally {
      setReenviando(false);
    }
  }

  return (
    <div className="grid gap-5">
      <p role="status" className="flex items-start gap-2 rounded-md bg-primary-claro px-3 py-2.5 text-sm text-foreground">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          {MENSAJE_NEUTRO}
          <span className="mt-0.5 block text-muted-foreground">
            Conjunto: {conjunto.nombre} · {correo}
          </span>
        </span>
      </p>

      <Form {...form}>
        <form onSubmit={(e) => void form.handleSubmit(verificar, () => setError(null))(e)} noValidate className="grid gap-5">
          <FormField
            control={form.control}
            name="codigo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código de 6 dígitos</FormLabel>
                <div key={fallos} className={fallos > 0 ? 'mf-sacude' : undefined}>
                  <FormControl {...(error ? { 'aria-describedby': ID_ERROR } : {})}>
                    <InputOTP
                      ref={campoRef}
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      disabled={campoDeshabilitado}
                      pasteTransformer={normalizarCodigo}
                      value={field.value}
                      onChange={(v) => field.onChange(normalizarCodigo(v))}
                      onBlur={field.onBlur}
                      onComplete={() => void form.handleSubmit(verificar)()}
                      containerClassName="w-full gap-1.5 sm:gap-2.5"
                    >
                      <InputOTPGroup className="w-full gap-1.5 sm:gap-2.5">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            aria-invalid={error?.tipo === 'incorrecto' || undefined}
                            className="h-14 min-w-0 flex-1 rounded-md border bg-card font-heading text-xl font-semibold first:rounded-l-md first:border-l last:rounded-r-md"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {error && (
            <p id={ID_ERROR} role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
              {textoError(error)}
            </p>
          )}

          <Button type="submit" size="lg" className="h-11" disabled={campoDeshabilitado}>
            {verificando ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" />
                Verificando…
              </>
            ) : (
              'Verificar código'
            )}
          </Button>
        </form>
      </Form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={alCambiarCorreo} disabled={verificando} className="-ml-2 group max-sm:h-10">
          <ArrowLeft aria-hidden="true" className="transition-transform duration-300 group-hover:-translate-x-0.5" />
          Cambiar correo
        </Button>
        {!bloqueado && (
          <Button type="button" variant="outline" size="sm" className="max-sm:h-10" onClick={() => void reenviar()} disabled={segundos > 0 || reenviando}>
            {reenviando && <Loader2 aria-hidden="true" className="animate-spin" />}
            {segundos > 0 ? `Reenviar código en ${segundos} s` : requiereNuevo ? 'Pedir un código nuevo' : 'Reenviar código'}
          </Button>
        )}
      </div>

      {import.meta.env.DEV && (
        <p className="rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
          Código de demostración: {CODIGO_DEMO}
        </p>
      )}
    </div>
  );
}
