import { ShieldAlert } from 'lucide-react';
import { PaginaError } from './PaginaError';

export default function Pagina403() {
  return (
    <PaginaError
      codigo="403"
      icono={ShieldAlert}
      titulo="Sin acceso a este conjunto"
      descripcion="Tu cuenta no tiene permiso para ver este conjunto. Si crees que es un error, pide acceso a un administrador."
    />
  );
}
