import { Logo } from '@/components/marca/Logo';

export function Pie() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="max-w-[48ch] text-sm text-muted-foreground">
            Los correos de tus residentes, convertidos en solicitudes con seguimiento.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} MailFlow</p>
      </div>
    </footer>
  );
}
