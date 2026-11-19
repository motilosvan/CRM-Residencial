import { ClipboardCheck, Mail, Tags } from 'lucide-react';
import { Revelar } from '@/components/movimiento/Revelar';
import { useEnVista } from '@/components/movimiento/useEnVista';
import { cn } from '@/lib/utils';

const PASOS = [
  {
    titulo: 'El residente escribe',
    texto: 'Usa el correo del conjunto, como siempre. No instala nada ni aprende una herramienta nueva.',
    icono: Mail,
  },
  {
    titulo: 'MailFlow clasifica y prioriza',
    texto:
      'Reglas por palabras clave asignan categoría y prioridad. La inteligencia artificial solo sugiere y una persona valida.',
    icono: Tags,
  },
  {
    titulo: 'El equipo da seguimiento',
    texto: 'Se asigna un responsable, se responde y cada cambio queda en el historial de la solicitud.',
    icono: ClipboardCheck,
  },
];

export function ComoFunciona() {
  const [ref, enVista] = useEnVista<HTMLOListElement>({ umbral: 0.25 });
  return (
    <section id="como-funciona" aria-labelledby="titulo-como-funciona" className="scroll-mt-16 bg-secondary">
      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6 sm:py-28 lg:px-8 lg:py-36">
        <Revelar>
          <h2
            id="titulo-como-funciona"
            className="max-w-[18ch] text-4xl font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-5xl"
          >
            Cómo funciona
          </h2>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            Del correo del residente al seguimiento del equipo, sin pasos manuales en el medio.
          </p>
        </Revelar>
        <ol ref={ref} className="relative mt-16 grid grid-cols-1 gap-14 md:grid-cols-3 md:gap-10">
          <div
            aria-hidden="true"
            className="absolute bottom-6 left-6 top-6 w-px origin-top bg-border md:bottom-auto md:left-6 md:right-6 md:top-6 md:h-px md:w-auto md:origin-left"
          >
            <div
              className={cn(
                'size-full origin-top bg-primary transition-transform duration-[1800ms] ease-in-out md:origin-left',
                enVista ? 'scale-100' : 'scale-y-0 md:scale-x-0 md:scale-y-100',
              )}
            />
          </div>
          {PASOS.map(({ titulo, texto, icono: Icono }, i) => (
            <li key={titulo} className="md:h-full">
              <Revelar retraso={i * 450} className="relative flex h-full flex-col pl-[4.5rem] md:pl-0 md:pt-[4.5rem]">
                <span className="absolute left-0 top-0 flex size-12 items-center justify-center rounded-full border-4 border-secondary bg-primary text-primary-foreground shadow-md">
                  <Icono className="size-5" aria-hidden={true} />
                </span>
                <h3 className="text-xl font-bold tracking-tight text-foreground">{titulo}</h3>
                <p className="mt-3 max-w-[40ch] leading-relaxed text-muted-foreground">{texto}</p>
                <span
                  aria-hidden="true"
                  className="mt-auto block select-none pt-6 font-heading text-7xl font-extrabold leading-none tracking-tighter text-primary/20"
                >
                  {i + 1}
                </span>
              </Revelar>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
