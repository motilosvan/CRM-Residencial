import { History, Inbox, ListOrdered, Palette, ShieldCheck, Smartphone } from 'lucide-react';
import type { ComponentType } from 'react';

interface Beneficio {
  titulo: string;
  texto: string;
  icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

const BENEFICIOS: Beneficio[] = [
  { titulo: 'Nada se pierde en la bandeja', texto: 'Cada correo queda registrado como una solicitud, sin depender de que alguien lo recuerde.', icono: Inbox },
  { titulo: 'Prioridades claras', texto: 'Lo urgente aparece primero, con su categoría y su estado a la vista.', icono: ListOrdered },
  { titulo: 'Historial y trazabilidad', texto: 'Quién hizo qué y cuándo queda guardado en cada solicitud.', icono: History },
  { titulo: 'Con la identidad de tu conjunto', texto: 'El panel usa los colores y el logo de cada conjunto residencial.', icono: Palette },
  { titulo: 'Acceso solo para el personal', texto: 'Administración y soporte entran con su cuenta; los residentes no necesitan una.', icono: ShieldCheck },
  { titulo: 'Sin apps nuevas para los residentes', texto: 'Siguen usando su correo. El cambio ocurre del lado del equipo.', icono: Smartphone },
];

export function Beneficios() {
  return (
    <section aria-labelledby="titulo-beneficios">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <h2
          id="titulo-beneficios"
          className="max-w-[24ch] text-3xl font-bold tracking-tight text-primary sm:text-4xl"
        >
          Beneficios para el equipo del conjunto
        </h2>
        <ul className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFICIOS.map(({ titulo, texto, icono: Icono }) => (
            <li key={titulo} className="flex gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-claro text-primary">
                <Icono className="size-5" aria-hidden={true} />
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">{titulo}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{texto}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
