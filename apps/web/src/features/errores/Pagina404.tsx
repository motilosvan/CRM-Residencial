import { SearchX } from 'lucide-react';
import { PaginaError } from './PaginaError';

export default function Pagina404() {
  return (
    <PaginaError
      icono={SearchX}
      titulo="Página no encontrada"
      descripcion="La dirección que buscas no existe o fue movida."
    />
  );
}
