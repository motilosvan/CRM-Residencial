import { Link } from 'react-router';
import { Logo } from '@/components/marca/Logo';
import { Button } from '@/components/ui/button';

export function Cabecera() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="MailFlow, inicio" className="rounded-md">
          <Logo />
        </Link>
        <Button asChild size="sm">
          <Link to="/login">Iniciar sesión</Link>
        </Button>
      </div>
    </header>
  );
}
