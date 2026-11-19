import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '@/components/marca/Logo';
import { FOCO_SOBRE_OSCURO } from '@/lib/foco';
import { cn } from '@/lib/utils';
import { BotonAcceso } from './BotonAcceso';

export const ENLACE_SUBRAYADO =
  'relative rounded-sm after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-300 hover:after:scale-x-100 focus-visible:after:scale-x-100';

const ENLACES = [
  { href: '#como-funciona', texto: 'Cómo funciona' },
  { href: '#beneficios', texto: 'Beneficios' },
  { href: '#seguridad', texto: 'Seguridad' },
];

export function Cabecera() {
  const [bajada, setBajada] = useState(() => typeof window !== 'undefined' && window.scrollY > 24);

  useEffect(() => {
    const alDesplazar = () => setBajada(window.scrollY > 24);
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => window.removeEventListener('scroll', alDesplazar);
  }, []);

  return (
    <header
      data-bajada={bajada}
      className={cn(
        'fixed inset-x-0 top-0 z-30 border-b transition-[background-color,border-color,backdrop-filter] duration-300',
        bajada
          ? 'border-border bg-background/80 backdrop-blur-lg'
          : 'border-transparent bg-transparent backdrop-blur-none',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          aria-label="MailFlow, inicio"
          className={cn(
            'rounded-md focus-visible:outline-offset-4',
            !bajada && 'focus-visible:outline-primary-foreground',
          )}
        >
          <Logo className={cn('transition-colors duration-300', bajada ? 'text-primary' : 'text-primary-foreground')} />
        </Link>
        <nav aria-label="Secciones" className="ml-auto hidden items-center gap-8 md:flex">
          {ENLACES.map((e) => (
            <a
              key={e.href}
              href={e.href}
              className={cn(
                'text-sm font-medium transition-colors duration-300',
                ENLACE_SUBRAYADO,
                bajada
                  ? 'text-foreground/80 hover:text-foreground'
                  : 'text-primary-foreground/85 hover:text-primary-foreground focus-visible:outline-primary-foreground',
              )}
            >
              {e.texto}
            </a>
          ))}
        </nav>
        {bajada ? (
          <BotonAcceso size="sm" brillo="bg-primary-foreground/30" />
        ) : (
          <BotonAcceso
            size="sm"
            variant="secondary"
            brillo="bg-primary/15"
            className={`bg-primary-foreground text-primary hover:bg-primary-foreground/90 ${FOCO_SOBRE_OSCURO}`}
          />
        )}
      </div>
    </header>
  );
}
