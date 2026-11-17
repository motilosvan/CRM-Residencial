import { ShieldAlert } from 'lucide-react';
import { PaginaError } from './PaginaError';

interface Props {
  titulo?: string;
  descripcion?: string;
  enPanel?: boolean;
}

export default function Pagina403({
  titulo = 'Sin acceso a este conjunto',
  descripcion = 'Tu cuenta no tiene permiso para ver este conjunto. Si crees que es un error, pide acceso a un administrador.',
  enPanel = false,
}: Props = {}) {
  return (
    <PaginaError
      codigo="403"
      icono={ShieldAlert}
      titulo={titulo}
      descripcion={descripcion}
      enPanel={enPanel}
    />
  );
}
