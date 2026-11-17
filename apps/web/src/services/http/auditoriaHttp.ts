import type { AuditoriaService, FiltroAuditoria } from '../contratos';
import { pedirApi } from './cliente';
import { esquemaRespuestaAuditoria } from './esquemas';

export function crearAuditoriaHttp(): AuditoriaService {
  return {
    listar: (filtro?: FiltroAuditoria, signal?: AbortSignal) =>
      pedirApi('/auditoria', esquemaRespuestaAuditoria, {
        consulta: {
          q: filtro?.q?.trim() || undefined,
          limite: filtro?.limite,
          desplazamiento: filtro?.desplazamiento,
        },
        signal,
      }),
  };
}
