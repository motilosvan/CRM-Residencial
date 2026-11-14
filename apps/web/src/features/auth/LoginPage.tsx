import { ArrowLeft, Clock, KeyRound, ShieldCheck, Timer } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { Logo } from '@/components/marca/Logo';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useSesion } from '@/store/sesion';
import type { Conjunto } from '@/types/conjunto';
import type { CodigoEnviado } from '@/services/contratos';
import type { ValoresPaso1 } from './esquemas';
import { PasoCodigo } from './PasoCodigo';
import { PasoConjuntoCorreo, type ResultadoPaso1 } from './PasoConjuntoCorreo';

const GARANTIAS = [
  { icono: KeyRound, texto: 'Código de un solo uso: no hay contraseñas que recordar ni filtrar.' },
  { icono: Timer, texto: 'Tu sesión se cierra sola tras 30 minutos sin actividad.' },
  { icono: ShieldCheck, texto: 'Datos personales tratados conforme a la Ley 1581.' },
];

function PanelMarca() {
  return (
    <aside className="relative isolate overflow-hidden bg-primary px-5 py-4 text-primary-foreground sm:px-8 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:px-14 lg:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="mf-reticula absolute inset-0" />
        <div className="mf-resplandor-a mf-deriva-a absolute -right-40 -top-40 size-[34rem] rounded-full opacity-70" />
        <div className="mf-resplandor-b mf-deriva-b absolute -bottom-52 -left-32 size-[34rem] rounded-full" />
      </div>

      <Link
        to="/"
        aria-label="MailFlow, ir a la página principal"
        className="inline-flex w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-foreground"
      >
        <Logo className="text-primary-foreground" />
      </Link>

      <div className="hidden max-w-md lg:block">
        <p className="mf-aparece font-heading text-4xl font-extrabold leading-[1.08] tracking-[-0.03em] xl:text-5xl" style={{ '--d': '100ms' } as CSSProperties}>
          Cada correo de tu conjunto, con un responsable.
        </p>
        <ul className="mt-10 grid gap-5">
          {GARANTIAS.map(({ icono: Icono, texto }, i) => (
            <li key={texto} className="mf-aparece flex items-start gap-3.5 text-primary-foreground/85" style={{ '--d': `${300 + i * 130}ms` } as CSSProperties}>
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-primary-foreground/25 text-acento">
                <Icono aria-hidden="true" className="size-4" />
              </span>
              <span className="leading-relaxed">{texto}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="hidden text-sm text-primary-foreground/70 lg:block">MailFlow · Gestión de solicitudes para conjuntos residenciales</p>
    </aside>
  );
}

function IndicadorPasos({ paso }: { paso: 1 | 2 }) {
  return (
    <div className="flex items-center gap-3">
      <div aria-hidden="true" className="flex flex-1 gap-1.5">
        {[1, 2].map((n) => (
          <span key={n} className="relative h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${n <= paso ? 1 : 0})` }}
            />
          </span>
        ))}
      </div>
      <span className="text-sm font-medium text-muted-foreground">Paso {paso} de 2</span>
    </div>
  );
}

interface DatosPaso2 {
  conjunto: Conjunto;
  correo: string;
  envio: CodigoEnviado;
  desbloqueoEn?: number;
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const porInactividad = params.get('motivo') === 'inactividad';
  const [borrador, setBorrador] = useState<Partial<ValoresPaso1>>({});
  const [paso2, setPaso2] = useState<DatosPaso2 | null>(null);
  const [sentido, setSentido] = useState<'sig' | 'ant'>('sig');
  const sesion = useSesion((s) => s.sesion);

  function continuar(r: ResultadoPaso1) {
    setBorrador({ conjuntoId: r.conjunto.id, correo: r.correo });
    setSentido('sig');
    setPaso2(r);
  }

  function volver() {
    setSentido('ant');
    setPaso2(null);
  }

  const paso = paso2 ? 2 : 1;

  if (sesion) return <Navigate replace to={`/app/${sesion.conjuntoActivo.slug}`} />;

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-background lg:grid-cols-[5fr_6fr] lg:grid-rows-1">
      <PanelMarca />
      <main className="flex flex-col px-4 py-8 sm:px-8 lg:px-14 lg:py-12">
        <Link
          to="/"
          className="group inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
          Volver al inicio
        </Link>

        <div className="flex flex-1 items-center justify-center py-8">
          <Card className="mf-aparece w-full max-w-md gap-6 py-7 shadow-sm">
            <CardHeader className="gap-5">
              <IndicadorPasos paso={paso} />
              <div key={paso} className={sentido === 'sig' ? 'mf-paso-sig' : 'mf-paso-ant'}>
                <h1 className="text-2xl font-bold tracking-tight">{paso === 1 ? 'Inicia sesión' : 'Revisa tu correo'}</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {paso === 1 ? 'Elige tu conjunto y te enviamos un código de un solo uso.' : 'Escribe el código que te enviamos para entrar.'}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {porInactividad && paso === 1 && (
                <Alert role="status" className="mb-5">
                  <Clock aria-hidden="true" />
                  <AlertDescription>Tu sesión se cerró por inactividad</AlertDescription>
                </Alert>
              )}
              <div key={paso} className={sentido === 'sig' ? 'mf-paso-sig' : 'mf-paso-ant'}>
                {paso2 ? (
                  <PasoCodigo
                    conjunto={paso2.conjunto}
                    correo={paso2.correo}
                    envio={paso2.envio}
                    desbloqueoEn={paso2.desbloqueoEn}
                    alCambiarCorreo={volver}
                  />
                ) : (
                  <PasoConjuntoCorreo borrador={borrador} alContinuar={continuar} />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
