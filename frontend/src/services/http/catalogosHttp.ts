import type { CatalogosService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaCatalogosDominio } from './esquemas';

export function crearCatalogosHttp(): CatalogosService {
  return {
    obtener: (signal) => pedirApi('/catalogos', esquemaCatalogosDominio, { signal }),
  };
}
