import type {
  CategoriaSolicitud,
  DetalleCorreoBuzon,
  DetalleSolicitud,
  FilaCorreoBuzon,
  PrioridadSolicitud,
  SugerenciaPendienteValidacion,
  ValidacionService,
} from '../contratos';
import { CORREOS_DEMO, SOLICITUDES_DEMO } from './datos';
import type { EstadoPanelMock } from './estadoCompartido';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesValidacionMock extends OpcionesMock {
  solicitudes?: DetalleSolicitud[];
  correos?: DetalleCorreoBuzon[];
  estado?: EstadoPanelMock;
}

const PESO_PRIORIDAD: Record<PrioridadSolicitud, number> = { ALTA: 3, MEDIA: 2, BAJA: 1 };

function tieneDecisionPosterior(s: DetalleSolicitud): boolean {
  if (!s.sugerencia) return false;
  const fechaSug = Date.parse(s.sugerencia.fechaActualizacion) || 0;
  return s.historial.some((h) => {
    if (h.usuario === null || h.anterior !== h.nuevo) return false;
    const com = h.comentario ?? '';
    const esDecision = com.startsWith('Reclasificada:') || com.startsWith('Sugerencia IA aceptada:');
    if (!esDecision) return false;
    const fechaH = Date.parse(h.fecha);
    return Number.isNaN(fechaH) || fechaH >= fechaSug;
  });
}

function aFilaCorreoBuzon(c: DetalleCorreoBuzon): FilaCorreoBuzon {
  return {
    id: c.id,
    remitente: c.remitente,
    asunto: c.asunto,
    fechaRecepcion: c.fechaRecepcion,
    idResidente: c.idResidente,
    residente: c.residente,
    unidad: c.unidad,
    idSolicitud: c.idSolicitud,
    codigo: c.codigo,
    estado: c.estado,
    categoria: c.categoria,
    prioridad: c.prioridad,
    sugerenciaEstado: c.sugerenciaEstado,
    sugerenciaCategoria: c.sugerenciaCategoria,
    extracto: c.cuerpo.slice(0, 200),
  };
}

export function crearValidacionMock(o: OpcionesValidacionMock = {}): ValidacionService {
  const solicitudes: DetalleSolicitud[] = o.estado
    ? o.estado.solicitudes
    : (o.solicitudes ?? structuredClone(SOLICITUDES_DEMO));
  const correos: DetalleCorreoBuzon[] = o.estado
    ? o.estado.correos
    : (o.correos ?? structuredClone(CORREOS_DEMO));

  return {
    async obtener(signal) {
      await esperar(o, signal);
      fallaRedApi(o);

      const sugerencias: SugerenciaPendienteValidacion[] = solicitudes
        .filter((s) => {
          if (s.estado === 'CERRADA') return false;
          if (!s.sugerencia || s.sugerencia.estado !== 'LISTA') return false;
          if (!s.sugerencia.categoria || !s.sugerencia.prioridad) return false;
          if (s.categoria === s.sugerencia.categoria && s.prioridad === s.sugerencia.prioridad) return false;
          return !tieneDecisionPosterior(s);
        })
        .slice()
        .sort((a, b) => {
          const difPeso = PESO_PRIORIDAD[b.prioridad] - PESO_PRIORIDAD[a.prioridad];
          if (difPeso !== 0) return difPeso;
          const difFecha = Date.parse(b.fechaCreacion) - Date.parse(a.fechaCreacion);
          return difFecha !== 0 ? difFecha : b.id - a.id;
        })
        .map((s) => ({
          idSolicitud: s.id,
          codigo: s.codigo,
          asunto: s.asunto,
          remitente: s.remitente,
          fechaCreacion: s.fechaCreacion,
          estado: s.estado,
          categoriaActual: s.categoria,
          prioridadActual: s.prioridad,
          version: s.version,
          sugerencia: {
            categoria: s.sugerencia!.categoria as CategoriaSolicitud,
            prioridad: s.sugerencia!.prioridad as PrioridadSolicitud,
            resumen: s.sugerencia!.resumen ?? '',
            justificacion: s.sugerencia!.justificacion,
            proveedor: s.sugerencia!.proveedor,
            modelo: s.sugerencia!.modelo,
            fechaActualizacion: s.sugerencia!.fechaActualizacion,
          },
        }));

      const remitentesSinResidente: FilaCorreoBuzon[] = correos
        .filter((c) => c.idResidente === null)
        .slice()
        .sort((a, b) => {
          const dif = Date.parse(b.fechaRecepcion) - Date.parse(a.fechaRecepcion);
          return dif !== 0 ? dif : b.id - a.id;
        })
        .map(aFilaCorreoBuzon);

      return structuredClone({ sugerencias, remitentesSinResidente });
    },
  };
}
