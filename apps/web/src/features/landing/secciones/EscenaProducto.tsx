import { Flag, Mail, Tag, UserRound } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Isotipo } from '@/components/marca/Isotipo';
import { useEnVista } from '@/components/movimiento/useEnVista';
import { useMovimientoReducido } from '@/components/movimiento/useMovimientoReducido';
import { cn } from '@/lib/utils';

/**
 * Fases del bucle: 0 llega el correo · 1 clasifica · 2 categoría · 3 prioridad ·
 * 4 responsable · 5 "En curso" (pausa antes de reiniciar).
 */
export const DURACIONES_FASES = [1300, 1800, 1000, 1000, 1200, 2800] as const;
export const FASE_FINAL = DURACIONES_FASES.length - 1;

function Fila({ icono, etiqueta, visible, children }: { icono: ReactNode; etiqueta: string; visible: boolean; children: ReactNode }) {
  return (
    <div className="flex h-9 items-center gap-3 border-t border-border first:border-t-0">
      <span className="flex w-28 shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {icono}
        {etiqueta}
      </span>
      <div
        className={cn(
          'flex items-center gap-2 transition-[opacity,transform] duration-500 ease-out',
          visible ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Escena de producto en bucle. Decorativa: datos ficticios, sin nombres ni correos reales. */
export function EscenaProducto({ className }: { className?: string }) {
  const reducido = useMovimientoReducido();
  const [ref, enVista] = useEnVista<HTMLDivElement>({ umbral: 0.2, repetir: true });
  const [paso, setPaso] = useState(reducido ? FASE_FINAL : 0);
  const [pestanaOculta, setPestanaOculta] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    if (reducido) return;
    const alCambiar = () => setPestanaOculta(document.hidden);
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, [reducido]);

  const activa = enVista && !pestanaOculta;
  const fase = reducido ? FASE_FINAL : paso % DURACIONES_FASES.length;
  const ciclo = Math.floor(paso / DURACIONES_FASES.length);

  useEffect(() => {
    if (reducido || !activa) return;
    const id = setTimeout(() => setPaso((p) => p + 1), DURACIONES_FASES[fase]);
    return () => clearTimeout(id);
  }, [reducido, activa, fase, paso]);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-fase={fase}
      className={cn(
        'select-none rounded-2xl border border-primary-foreground/15 bg-card text-card-foreground',
        'shadow-[0_50px_90px_-30px_color-mix(in_oklch,var(--foreground)_75%,transparent)]',
        'lg:[transform:perspective(1800px)_rotateY(-9deg)_rotateX(3deg)]',
        className,
      )}
    >
      {/* Barra de progreso del recorrido */}
      <div className="h-1 overflow-hidden rounded-t-2xl bg-secondary">
        <div
          className="h-full origin-left bg-acento transition-transform duration-700 ease-out"
          style={{ transform: `scaleX(${(fase + 1) / DURACIONES_FASES.length})` }}
        />
      </div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 font-heading text-sm font-semibold text-primary">
          <Isotipo className="size-5" />
          Buzón del conjunto
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-primary">
          Solicitud n.º 0142
        </span>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {/* Correo entrante */}
        <div key={ciclo} className="mf-aparece relative overflow-hidden rounded-xl border border-border bg-background p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
              <Mail className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-sm font-medium">Residente · Torre 2</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-xs text-muted-foreground">Correo recibido</p>
                <span
                  className={cn(
                    'shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground transition-opacity duration-300',
                    fase === 1 ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  Clasificando…
                </span>
              </div>
            </div>
          </div>
          <p className="mt-3 font-heading text-sm font-semibold">Fuga de agua en el parqueadero</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Desde ayer gotea el techo del sótano y ya hay un charco junto a mi puesto.
          </p>
          {fase === 1 && (
            <span className="mf-escaneo pointer-events-none absolute inset-0 border-b-2 border-acento bg-linear-to-b from-transparent via-acento/25 to-transparent" />
          )}
        </div>

        {/* Solicitud resultante */}
        <div className="rounded-xl border border-border px-4 py-1">
          <Fila icono={<Tag className="size-3.5" />} etiqueta="Categoría" visible={fase >= 2}>
            <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium">
              Mantenimiento
            </span>
          </Fila>
          <Fila icono={<Flag className="size-3.5" />} etiqueta="Prioridad" visible={fase >= 3}>
            <span className="rounded-full bg-acento px-2.5 py-0.5 text-xs font-semibold text-acento-foreground">Alta</span>
          </Fila>
          <Fila icono={<UserRound className="size-3.5" />} etiqueta="Responsable" visible={fase >= 4}>
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              JR
            </span>
            <span className="text-xs font-medium">Jefe de mantenimiento</span>
          </Fila>
          <div className="flex h-9 items-center gap-3 border-t border-border">
            <span className="flex w-28 shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <span className="size-3.5 rounded-full border-2 border-current" />
              Estado
            </span>
            <span className="grid text-xs font-semibold">
              <span
                className={cn(
                  'col-start-1 row-start-1 w-fit rounded-full bg-secondary px-2.5 py-0.5 text-primary transition-opacity duration-500',
                  fase >= 5 ? 'opacity-0' : 'opacity-100',
                )}
              >
                Nueva
              </span>
              <span
                className={cn(
                  'col-start-1 row-start-1 w-fit rounded-full bg-primary px-2.5 py-0.5 text-primary-foreground transition-opacity duration-500',
                  fase >= 5 ? 'opacity-100' : 'opacity-0',
                )}
              >
                En curso
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
