import type { EntradaLaboratorio, LaboratorioService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaResultadoLaboratorio } from './esquemas';

export function crearLaboratorioHttp(): LaboratorioService {
  return {
    probar: (entrada: EntradaLaboratorio, signal?: AbortSignal) =>
      pedirApi('/laboratorio/probar', esquemaResultadoLaboratorio, {
        metodo: 'POST',
        cuerpo: entrada,
        signal,
      }),
  };
}
