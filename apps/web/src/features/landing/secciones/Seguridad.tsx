import { Revelar } from '@/components/movimiento/Revelar';
import { BotonAcceso } from './BotonAcceso';

const GARANTIAS = [
  'Los datos personales se enmascaran antes de cualquier análisis automático.',
  'Se accede con un código de un solo uso, sin contraseñas que recordar o filtrar.',
  'La sesión se cierra sola tras un tiempo sin actividad.',
  'La inteligencia artificial nunca modifica una solicitud ni envía respuestas.',
];

function Sello() {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className="size-24 shrink-0 text-acento">
      <circle cx="48" cy="48" r="45" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" strokeDasharray="2 5" />
      <path
        d="M48 16 L74 26 V46 C74 62 63 73 48 80 C33 73 22 62 22 46 V26 Z"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        className="mf-trazo-vista"
      />
      <path
        d="M37 48 L45 56 L60 39"
        pathLength={1}
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mf-trazo-vista"
        style={{ '--d': '800ms' } as React.CSSProperties}
      />
    </svg>
  );
}

export function Seguridad() {
  return (
    <section
      id="seguridad"
      aria-labelledby="titulo-seguridad"
      className="relative isolate scroll-mt-16 overflow-hidden bg-primary text-primary-foreground"
    >
      <div aria-hidden="true" className="mf-reticula pointer-events-none absolute inset-0 -z-10 opacity-60" />
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-14 px-4 py-24 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:py-36">
        <Revelar>
          <h2
            id="titulo-seguridad"
            className="max-w-[16ch] text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-5xl"
          >
            Seguridad y cuidado de los datos
          </h2>
          <p className="mt-6 max-w-[48ch] text-lg leading-relaxed text-primary-foreground/85">
            Los correos de los residentes son datos personales. MailFlow los trata con el cuidado que
            exige la Ley 1581 de 2012, y por eso cada decisión se toma pensando en proteger esa
            información.
          </p>
          <div className="mt-10">
            <BotonAcceso
              variant="secondary"
              brillo="bg-primary/15"
              className="focus-visible:border-primary-foreground focus-visible:outline-primary-foreground focus-visible:ring-primary-foreground"
            />
          </div>
        </Revelar>
        <Revelar
          data-trazo
          retraso={150}
          className="rounded-3xl border border-primary-foreground/15 bg-primary-foreground/5 p-7 sm:p-9"
        >
          <Sello />
          <ul className="mt-7 space-y-5">
            {GARANTIAS.map((g, i) => (
              <li key={g} className="flex gap-3">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-acento">
                  <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
                  <path
                    d="M7.5 12.5 L10.5 15.5 L16.5 9"
                    pathLength={1}
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mf-trazo-vista"
                    style={{ '--d': `${1400 + i * 350}ms` } as React.CSSProperties}
                  />
                </svg>
                <span className="leading-relaxed text-primary-foreground/90">{g}</span>
              </li>
            ))}
          </ul>
        </Revelar>
      </div>
    </section>
  );
}
