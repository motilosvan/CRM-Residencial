import type { ReactNode } from 'react';
import { Outlet } from 'react-router';
import Pagina403 from '@/features/errores/Pagina403';
import { useSesion } from '@/store/sesion';
import type { Rol } from '@/types/conjunto';

interface Props {
  roles: readonly Rol[];
  children?: ReactNode;
}

/** Restringe una ruta del panel a los roles indicados y muestra 403 en caso contrario. */
export default function GuardaRol({ roles, children }: Props) {
  const sesion = useSesion((s) => s.sesion);
  if (!sesion) return null;

  if (!roles.includes(sesion.usuario.rol)) {
    return (
      <Pagina403
        enPanel
        titulo="Sin acceso a esta sección"
        descripcion="Tu cuenta no tiene permiso para ver esta sección. Si crees que es un error, pide acceso a un administrador."
      />
    );
  }

  return children ?? <Outlet />;
}
