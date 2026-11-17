import type { CorreosService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaDetalleCorreo, esquemaListaCorreos } from './esquemas';

export function crearCorreosHttp(): CorreosService {
  return {
    listar: (filtro = {}, signal) =>
      pedirApi('/correos', esquemaListaCorreos, {
        signal,
        consulta: {
          q: filtro.q?.trim() || undefined,
          limite: filtro.limite,
          desplazamiento: filtro.desplazamiento,
        },
      }),
    detalle: (id, signal) => pedirApi(`/correos/${id}`, esquemaDetalleCorreo, { signal }),
  };
}
