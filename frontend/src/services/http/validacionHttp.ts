import type { ValidacionService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaColaValidacion } from './esquemas';

export function crearValidacionHttp(): ValidacionService {
  return {
    obtener: (signal) => pedirApi('/validacion', esquemaColaValidacion, { signal }),
  };
}
