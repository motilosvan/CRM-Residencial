import { Revelar } from '@/components/movimiento/Revelar';
import { BotonAcceso } from './BotonAcceso';

export function Cierre() {
  return (
    <section aria-labelledby="titulo-cierre" className="bg-secondary">
      <Revelar className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-24 sm:px-6 sm:py-28 lg:flex-row lg:items-end lg:justify-between lg:gap-16 lg:px-8 lg:py-32">
        <div>
          <h2
            id="titulo-cierre"
            className="max-w-[16ch] text-5xl font-extrabold leading-[1.02] tracking-[-0.04em] text-primary sm:text-6xl lg:text-7xl"
          >
            Que ningún correo se quede sin responsable
          </h2>
          <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted-foreground">
            Entra al panel de tu conjunto con tu código de un solo uso.
          </p>
        </div>
        <div className="shrink-0">
          <BotonAcceso className="h-14 px-9 text-base" brillo="bg-primary-foreground/30" />
        </div>
      </Revelar>
    </section>
  );
}
