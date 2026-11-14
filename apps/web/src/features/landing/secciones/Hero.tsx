import { BotonAcceso } from './BotonAcceso';
import { ENLACE_SUBRAYADO } from './Cabecera';
import { EscenaProducto } from './EscenaProducto';

function Linea({ retraso, children }: { retraso: number; children: React.ReactNode }) {
  return (
    <span className="block overflow-hidden pb-3 -mb-3">
      <span className="mf-entra block" style={{ '--d': `${retraso}ms` } as React.CSSProperties}>
        {children}
      </span>
    </span>
  );
}

export function Hero() {
  return (
    <section aria-labelledby="titulo-hero" className="relative isolate overflow-hidden bg-primary text-primary-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="mf-reticula absolute inset-0" />
        <div className="mf-resplandor-a mf-deriva-a absolute -right-32 -top-48 size-[52rem] rounded-full opacity-70" />
        <div className="mf-resplandor-b mf-deriva-b absolute -bottom-72 -left-40 size-[46rem] rounded-full" />
      </div>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 px-4 pb-20 pt-32 sm:px-6 sm:pb-24 sm:pt-36 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:px-8 lg:pb-32 lg:pt-44">
        <div>
          <p className="mf-aparece text-xs font-semibold uppercase tracking-[0.24em] text-primary-foreground/80">
            Para conjuntos residenciales
          </p>
          <h1
            id="titulo-hero"
            className="mt-6 text-[2.75rem] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-[4.1rem] xl:text-[4.6rem]"
          >
            <Linea retraso={150}>Cada correo,</Linea>{' '}
            <Linea retraso={300}>una solicitud</Linea>{' '}
            <Linea retraso={450}>
              <span className="relative inline-block">
                con dueño
                <svg
                  aria-hidden="true"
                  viewBox="0 0 200 14"
                  preserveAspectRatio="none"
                  className="absolute -bottom-1 left-0 h-3 w-full overflow-visible text-acento"
                >
                  <path
                    d="M2 9 C 48 2, 118 13, 198 4"
                    pathLength={1}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className="mf-trazo-svg"
                    style={{ '--d': '1100ms' } as React.CSSProperties}
                  />
                </svg>
              </span>
            </Linea>
          </h1>
          <p
            className="mf-aparece mt-9 max-w-[50ch] text-lg leading-relaxed text-primary-foreground/80"
            style={{ '--d': '700ms' } as React.CSSProperties}
          >
            Tus residentes siguen escribiendo al correo de siempre. MailFlow lo convierte en una
            solicitud clasificada, priorizada y con seguimiento para que administración y soporte
            sepan qué atender primero.
          </p>
          <div
            className="mf-aparece mt-10 flex flex-wrap items-center gap-x-8 gap-y-4"
            style={{ '--d': '850ms' } as React.CSSProperties}
          >
            <BotonAcceso
              variant="secondary"
              brillo="bg-primary/15"
              className="h-12 bg-primary-foreground px-7 text-base text-primary hover:bg-primary-foreground/90 focus-visible:border-primary-foreground focus-visible:outline-primary-foreground focus-visible:ring-primary-foreground"
            />
            <a
              href="#como-funciona"
              className={`${ENLACE_SUBRAYADO} text-sm font-medium text-primary-foreground/85 hover:text-primary-foreground focus-visible:outline-primary-foreground`}
            >
              Ver cómo funciona
            </a>
          </div>
        </div>

        <div className="mf-aparece mx-auto w-full max-w-lg lg:max-w-none" style={{ '--d': '500ms' } as React.CSSProperties}>
          <EscenaProducto className="lg:ml-6" />
        </div>
      </div>
    </section>
  );
}

