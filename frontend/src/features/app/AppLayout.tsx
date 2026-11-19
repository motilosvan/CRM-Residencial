import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useInactividad } from '@/hooks/useInactividad';
import { useSesion } from '@/store/sesion';
import DialogoInactividad from './DialogoInactividad';
import MenuUsuario from './MenuUsuario';
import { entradaDe } from './navegacion';
import PantallaPreparando from './PantallaPreparando';
import SidebarApp from './SidebarApp';

const PREPARACION_MS = 400;

export default function AppLayout() {
  const sesion = useSesion((s) => s.sesion);
  const { pathname } = useLocation();
  const { avisoVisible, segundosRestantes, seguir } = useInactividad();
  const activo = sesion?.conjuntoActivo;
  const slug = activo?.slug;

  // Pantalla de preparación solo al entrar o cambiar de conjunto.
  const [listoPara, setListoPara] = useState<string | undefined>();
  useEffect(() => {
    if (!slug) return;
    const t = window.setTimeout(() => setListoPara(slug), PREPARACION_MS);
    return () => window.clearTimeout(t);
  }, [slug]);

  if (!sesion || !activo) return null;
  if (listoPara !== activo.slug) return <PantallaPreparando conjunto={activo} />;

  const entrada = entradaDe(pathname.split('/')[3] ?? 'inicio');

  return (
    <SidebarProvider>
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus-visible:ring-2 focus-visible:ring-ring"
      >
        Saltar al contenido
      </a>
      <SidebarApp activo={activo} conjuntos={sesion.conjuntos} rol={sesion.usuario.rol} />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background px-3 sm:px-4">
          <SidebarTrigger aria-label="Mostrar u ocultar el menú" />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-sm">
            <Link
              to={`/app/${activo.slug}/inicio`}
              className="hidden max-w-48 truncate rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:inline"
            >
              {activo.nombre}
            </Link>
            <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
            <h1 className="truncate font-heading text-base font-semibold">{entrada?.etiqueta ?? 'Panel'}</h1>
          </nav>
          <div className="ml-auto">
            <MenuUsuario usuario={sesion.usuario} />
          </div>
        </header>
        <div id="contenido" tabIndex={-1} className="mf-panel-entra flex-1 p-4 focus:outline-none sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>
      <DialogoInactividad abierto={avisoVisible} segundos={segundosRestantes} alSeguir={seguir} />
    </SidebarProvider>
  );
}
