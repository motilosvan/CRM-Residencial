import type { FiltroReporte, ReportesService } from '../contratos';
import { pedirApi, pedirApiTexto } from './cliente';
import { esquemaReporteSolicitudes } from './esquemas';

export function crearReportesHttp(): ReportesService {
  return {
    obtener: (filtro?: FiltroReporte, signal?: AbortSignal) =>
      pedirApi('/reportes', esquemaReporteSolicitudes, {
        consulta: {
          desde: filtro?.desde?.trim() || undefined,
          hasta: filtro?.hasta?.trim() || undefined,
        },
        signal,
      }),
    descargarCsv: (filtro?: FiltroReporte, signal?: AbortSignal) =>
      pedirApiTexto('/reportes', {
        consulta: {
          desde: filtro?.desde?.trim() || undefined,
          hasta: filtro?.hasta?.trim() || undefined,
          formato: 'csv',
        },
        signal,
      }),
  };
}
