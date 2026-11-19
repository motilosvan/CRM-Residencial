import { Link, useLocation, useNavigate } from 'react-router';
import { ChevronsUpDown } from 'lucide-react';
import { AvatarConjunto } from '@/components/AvatarConjunto';
import { Isotipo } from '@/components/marca/Isotipo';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';
import type { Conjunto, Rol } from '@/types/conjunto';
import { entradasPara, GRUPOS } from './navegacion';

interface Props {
  activo: Conjunto;
  conjuntos: Conjunto[];
  rol: Rol;
}

function IdentidadConjunto({ activo }: { activo: Conjunto }) {
  return (
    <>
      <AvatarConjunto conjunto={activo} tamano="lg" />
      <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
        <span className="line-clamp-2 font-heading text-sm font-semibold text-balance">{activo.nombre}</span>
        <span className="mt-1 flex items-center gap-1 text-xs whitespace-nowrap text-sidebar-foreground/70">
          <Isotipo className="size-3.5 text-sidebar-primary" />
          Impulsado por MailFlow
        </span>
      </span>
    </>
  );
}

export default function SidebarApp({ activo, conjuntos, rol }: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { setOpenMobile } = useSidebar();
  const entradas = entradasPara(rol);
  const varios = conjuntos.length > 1;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-3">
        {varios ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Cambiar de conjunto. Conjunto actual: ${activo.nombre}`}
              className="flex w-full items-center gap-3 rounded-lg p-1.5 text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            >
              <IdentidadConjunto activo={activo} />
              <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Tus conjuntos</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={activo.slug}
                onValueChange={(slug) => {
                  setOpenMobile(false);
                  navigate(`/app/${slug}/inicio`);
                }}
              >
                {conjuntos.map((c) => (
                  <DropdownMenuRadioItem key={c.id} value={c.slug} className="gap-2">
                    <AvatarConjunto conjunto={c} tamano="sm" />
                    {c.nombre}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-3 p-1.5">
            <IdentidadConjunto activo={activo} />
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Secciones del panel">
          {GRUPOS.map((grupo) => {
            const delGrupo = entradas.filter((e) => e.grupo === grupo);
            if (delGrupo.length === 0) return null;
            return (
              <SidebarGroup key={grupo}>
                <SidebarGroupLabel className="text-xs font-medium">{grupo}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {delGrupo.map((e) => {
                      const destino = `/app/${activo.slug}/${e.ruta}`;
                      const activa = pathname === destino;
                      return (
                        <SidebarMenuItem key={e.ruta}>
                          <SidebarMenuButton
                            asChild
                            isActive={activa}
                            tooltip={e.etiqueta}
                            className="relative before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-1 before:rounded-r-full before:bg-sidebar-primary before:opacity-0 before:transition-opacity data-[active=true]:font-semibold data-[active=true]:before:opacity-100"
                          >
                            <Link to={destino} aria-current={activa ? 'page' : undefined} onClick={() => setOpenMobile(false)}>
                              <e.icono aria-hidden="true" />
                              <span>{e.etiqueta}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
