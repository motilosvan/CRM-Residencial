import type { SolicitudesService } from '../contratos';
import { pedirApi } from './cliente';
import {
  esquemaDetalleSolicitud,
  esquemaListaSolicitudes,
  esquemaResultadoAsignacion,
  esquemaResultadoCambioEstado,
  esquemaResultadoReclasificacion,
} from './esquemas';

export function crearSolicitudesHttp(): SolicitudesService {
  return {
    listar: (filtro = {}, signal) =>
      pedirApi('/solicitudes', esquemaListaSolicitudes, {
        signal,
        consulta: {
          estado: filtro.estado,
          categoria: filtro.categoria,
          prioridad: filtro.prioridad,
          idResponsable: filtro.idResponsable,
          limite: filtro.limite,
          desplazamiento: filtro.desplazamiento,
        },
      }),
    detalle: (id, signal) => pedirApi(`/solicitudes/${id}`, esquemaDetalleSolicitud, { signal }),
    asignar: (id, entrada) =>
      pedirApi(`/solicitudes/${id}/asignar`, esquemaResultadoAsignacion, {
        metodo: 'POST',
        cuerpo: entrada,
      }),
    cambiarEstado: (id, entrada) =>
      pedirApi(`/solicitudes/${id}/estado`, esquemaResultadoCambioEstado, {
        metodo: 'POST',
        cuerpo: entrada,
      }),
    reclasificar: (id, entrada) =>
      pedirApi(`/solicitudes/${id}/reclasificar`, esquemaResultadoReclasificacion, {
        metodo: 'POST',
        cuerpo: entrada,
      }),
    aceptarSugerencia: (id, entrada) =>
      pedirApi(`/solicitudes/${id}/aceptar-sugerencia`, esquemaResultadoReclasificacion, {
        metodo: 'POST',
        cuerpo: entrada,
      }),
  };
}
