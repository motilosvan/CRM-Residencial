import type { ResidentesService } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaDetalleCorreo, esquemaListaResidentes, esquemaResidenteConjunto } from './esquemas';

export function crearResidentesHttp(): ResidentesService {
  return {
    listar: (filtro = {}, signal) =>
      pedirApi('/residentes', esquemaListaResidentes, {
        signal,
        consulta: {
          q: filtro.q,
          soloActivos: filtro.soloActivos,
        },
      }),
    crear: (entrada) =>
      pedirApi('/residentes', esquemaResidenteConjunto, {
        metodo: 'POST',
        cuerpo: entrada,
      }),
    actualizar: (id, cambio) =>
      pedirApi(`/residentes/${id}`, esquemaResidenteConjunto, {
        metodo: 'PATCH',
        cuerpo: cambio,
      }),
    vincularCorreo: (idCorreo, entrada) =>
      pedirApi(`/correos/${idCorreo}/vincular-residente`, esquemaDetalleCorreo, {
        metodo: 'POST',
        cuerpo: entrada,
      }),
  };
}
