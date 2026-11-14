import { History, Inbox, ListOrdered, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type ComponentType, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Revelar } from '@/components/movimiento/Revelar';
import { useEnVista } from '@/components/movimiento/useEnVista';
import { useMovimientoReducido } from '@/components/movimiento/useMovimientoReducido';
import { cn } from '@/lib/utils';
import { PALETA_MAILFLOW, PALETA_PARQUES } from '@/tema/paletas';
import { derivarTema } from '@/tema/derivarTema';

type Icono = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const IDENTIDADES = [
  { nombre: 'Conjunto Mirador', variables: derivarTema(PALETA_MAILFLOW) as CSSProperties },
  { nombre: 'Conjunto Parques', variables: derivarTema(PALETA_PARQUES) as CSSProperties },
];

/** Tarjeta con elevación y un foco de luz que sigue al puntero (--x/--y). */
function Tarjeta({ className, children }: { className?: string; children: ReactNode }) {
  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--x', `${e.clientX - caja.left}px`);
    e.currentTarget.style.setProperty('--y', `${e.clientY - caja.top}px`);
  };
  return (
    <div
      onPointerMove={alMover}
      className={cn(
        'group relative h-full overflow-hidden rounded-3xl border border-border bg-card p-7 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_color-mix(in_oklch,var(--primary)_55%,transparent)] sm:p-8',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mf-foco pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  );
}

function Contenido({ icono: Icono, titulo, texto }: { icono: Icono; titulo: string; texto: string }) {
  return (
    <>
      <span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
        <Icono className="size-5" aria-hidden={true} />
      </span>
      <h3 className="mt-6 text-xl font-bold tracking-tight text-foreground">{titulo}</h3>
      <p className="mt-2 max-w-[42ch] leading-relaxed text-muted-foreground">{texto}</p>
    </>
  );
}

/** Mini panel que alterna entre dos identidades. Colores solo por variables CSS derivadas del tema. */
function MiniPanel() {
  const reducido = useMovimientoReducido();
  const [ref, enVista] = useEnVista<HTMLDivElement>({ repetir: true, umbral: 0.3 });
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reducido || !enVista) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % IDENTIDADES.length), 3600);
    return () => clearInterval(id);
  }, [reducido, enVista]);

  const actual = IDENTIDADES[idx];
  const suave = 'transition-colors duration-700';
  return (
    <div ref={ref} aria-hidden="true" style={actual.variables} className="mt-8 flex-1">
      <div className="flex h-full min-h-56 overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        <div className={cn('flex w-14 shrink-0 flex-col items-center gap-3 bg-primary py-4', suave)}>
          <span className={cn('size-7 rounded-lg bg-accent', suave)} />
          <span className="h-1.5 w-6 rounded-full bg-primary-foreground/40" />
          <span className="h-1.5 w-6 rounded-full bg-primary-foreground/25" />
          <span className="h-1.5 w-6 rounded-full bg-primary-foreground/25" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <p key={actual.nombre} className="mf-aparece truncate font-heading text-sm font-bold text-primary">
              {actual.nombre}
            </p>
            <span className={cn('rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground', suave)}>
              Nueva
            </span>
          </div>
          {[true, false, false].map((destacada, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className={cn('size-6 shrink-0 rounded-full bg-secondary', suave)} />
              <span className="h-2 flex-1 rounded-full bg-muted" />
              <span className={cn('h-5 w-12 rounded-full', destacada ? 'bg-accent' : 'bg-secondary', suave)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Beneficios() {
  return (
    <section id="beneficios" aria-labelledby="titulo-beneficios" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <Revelar>
          <h2
            id="titulo-beneficios"
            className="max-w-[20ch] text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] text-primary sm:text-5xl"
          >
            Beneficios para el equipo del conjunto
          </h2>
        </Revelar>
        <ul className="mt-16 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <li className="lg:col-span-6 lg:row-span-2">
            <Revelar className="h-full">
              <Tarjeta className="bg-primary-claro">
                <h3 className="text-2xl font-bold tracking-tight text-foreground">Con la identidad de tu conjunto</h3>
                <p className="mt-2 max-w-[42ch] leading-relaxed text-muted-foreground">
                  El panel usa los colores y el logo de cada conjunto residencial.
                </p>
                <MiniPanel />
              </Tarjeta>
            </Revelar>
          </li>
          <li className="lg:col-span-6">
            <Revelar className="h-full" retraso={100}>
              <Tarjeta>
                <Contenido
                  icono={Inbox}
                  titulo="Nada se pierde en la bandeja"
                  texto="Cada correo queda registrado como una solicitud, sin depender de que alguien lo recuerde."
                />
              </Tarjeta>
            </Revelar>
          </li>
          <li className="lg:col-span-3">
            <Revelar className="h-full" retraso={200}>
              <Tarjeta>
                <Contenido
                  icono={ListOrdered}
                  titulo="Prioridades claras"
                  texto="Lo urgente aparece primero, con su categoría y su estado a la vista."
                />
              </Tarjeta>
            </Revelar>
          </li>
          <li className="lg:col-span-3">
            <Revelar className="h-full" retraso={300}>
              <Tarjeta>
                <Contenido
                  icono={History}
                  titulo="Historial y trazabilidad"
                  texto="Quién hizo qué y cuándo queda guardado en cada solicitud."
                />
              </Tarjeta>
            </Revelar>
          </li>
          <li className="lg:col-span-5">
            <Revelar className="h-full">
              <Tarjeta>
                <Contenido
                  icono={ShieldCheck}
                  titulo="Acceso solo para el personal"
                  texto="Administración y soporte entran con su cuenta; los residentes no necesitan una."
                />
              </Tarjeta>
            </Revelar>
          </li>
          <li className="lg:col-span-7">
            <Revelar className="h-full" retraso={120}>
              <Tarjeta>
                <Contenido
                  icono={Smartphone}
                  titulo="Sin apps nuevas para los residentes"
                  texto="Siguen usando su correo. El cambio ocurre del lado del equipo."
                />
              </Tarjeta>
            </Revelar>
          </li>
        </ul>
      </div>
    </section>
  );
}
