import { Check } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

const GARANTIAS = [
  'Los datos personales se enmascaran antes de cualquier análisis automático.',
  'Se accede con un código de un solo uso, sin contraseñas que recordar o filtrar.',
  'La sesión se cierra sola tras un tiempo sin actividad.',
  'La inteligencia artificial nunca modifica una solicitud ni envía respuestas.',
];

export function Seguridad() {
  return (
    <section aria-labelledby="titulo-seguridad" className="bg-primary text-primary-foreground">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
        <div>
          <h2
            id="titulo-seguridad"
            className="max-w-[20ch] text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Seguridad y cuidado de los datos
          </h2>
          <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-primary-foreground/85">
            Los correos de los residentes son datos personales. MailFlow los trata con el cuidado que
            exige la Ley 1581 de 2012, y por eso cada decisión se toma pensando en proteger esa
            información.
          </p>
          <div className="mt-8">
            <Button asChild variant="secondary" size="lg">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </div>
        </div>
        <ul className="space-y-5">
          {GARANTIAS.map((g) => (
            <li key={g} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              <span className="leading-relaxed text-primary-foreground/90">{g}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
