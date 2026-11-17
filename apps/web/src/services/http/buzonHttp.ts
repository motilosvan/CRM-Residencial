import type { BuzonService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaEstadoGateway, esquemaResultadoSincronizacion } from './esquemas';

export function crearBuzonHttp(): BuzonService {
  return {
    estado: (signal) => pedirApi('/gateway/estado', esquemaEstadoGateway, { signal }),
    guardar: (entrada) =>
      pedirApi('/buzon', esquemaEstadoGateway, {
        metodo: 'PUT',
        cuerpo: entrada,
      }),
    desconectar: (versionEsperada) =>
      pedirApi('/buzon/desconectar', esquemaEstadoGateway, {
        metodo: 'POST',
        cuerpo: versionEsperada !== undefined ? { versionEsperada } : {},
      }),
    sincronizar: () =>
      pedirApi('/buzon/sincronizar', esquemaResultadoSincronizacion, {
        metodo: 'POST',
      }),
  };
}
