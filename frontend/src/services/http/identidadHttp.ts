import type { IdentidadService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaConjuntoIdentidad } from './esquemas';

export function crearIdentidadHttp(): IdentidadService {
  return {
    obtener: (signal) => pedirApi('/conjunto/identidad', esquemaConjuntoIdentidad, { signal }),
    actualizar: (entrada) =>
      pedirApi('/conjunto/identidad', esquemaConjuntoIdentidad, {
        metodo: 'PATCH',
        cuerpo: entrada,
      }),
  };
}
