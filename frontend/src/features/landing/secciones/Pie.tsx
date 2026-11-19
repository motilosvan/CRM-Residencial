import { Logo } from '@/components/marca/Logo';
import { ENLACE_SUBRAYADO } from './Cabecera';

export function Pie() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-[48ch] text-sm text-muted-foreground">
            Los correos de tus residentes, convertidos en solicitudes con seguimiento.
          </p>
        </div>
        <nav aria-label="Pie" className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <a href="#como-funciona" className={`${ENLACE_SUBRAYADO} hover:text-foreground`}>Cómo funciona</a>
          <a href="#beneficios" className={`${ENLACE_SUBRAYADO} hover:text-foreground`}>Beneficios</a>
          <a href="#seguridad" className={`${ENLACE_SUBRAYADO} hover:text-foreground`}>Seguridad</a>
        </nav>
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} MailFlow</p>
      </div>
    </footer>
  );
}
