import type { ResumenService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaResumen } from './esquemas';

export function crearResumenHttp(): ResumenService {
  return {
    obtener: (signal) => pedirApi('/resumen', esquemaResumen, { signal }),
  };
}
