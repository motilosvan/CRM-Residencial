import type { BuzonService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaEstadoGateway } from './esquemas';

export function crearBuzonHttp(): BuzonService {
  return {
    estado: (signal) => pedirApi('/gateway/estado', esquemaEstadoGateway, { signal }),
  };
}
