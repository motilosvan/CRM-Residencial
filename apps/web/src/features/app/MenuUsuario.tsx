import { ChevronDown, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSesion } from '@/store/sesion';
import type { Usuario } from '@/types/conjunto';

const ROLES = { ADMIN: 'Administración', SOPORTE: 'Soporte' } as const;

function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '·';
}

export default function MenuUsuario({ usuario }: { usuario: Usuario }) {
  const cerrar = useSesion((s) => s.cerrar);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menú de usuario"
        className="group flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Avatar size="default">
          <AvatarFallback className="bg-secondary font-heading font-semibold text-secondary-foreground">
            {iniciales(usuario.nombre)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden text-sm font-medium sm:inline">{usuario.nombre}</span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{usuario.nombre}</p>
          <p className="truncate text-xs text-muted-foreground">{usuario.correo}</p>
          <p className="mt-1 text-xs text-muted-foreground">{ROLES[usuario.rol]}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => cerrar('manual')}>
          <LogOut aria-hidden="true" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
