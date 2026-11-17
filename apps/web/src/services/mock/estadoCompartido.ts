import type { ConjuntoIdentidad, DetalleCorreoBuzon, DetalleSolicitud, ResidenteConjunto } from '../contratos';
import { CONJUNTOS_DEMO, CORREOS_DEMO, RESIDENTES_DEMO, SOLICITUDES_DEMO } from './datos';

export interface EstadoPanelMock {
  correos: DetalleCorreoBuzon[];
  solicitudes: DetalleSolicitud[];
  residentes: ResidenteConjunto[];
  conjuntos: ConjuntoIdentidad[];
}

export function crearEstadoPanelMock(inicial?: Partial<EstadoPanelMock>): EstadoPanelMock {
  return {
    correos: structuredClone(inicial?.correos ?? CORREOS_DEMO),
    solicitudes: structuredClone(inicial?.solicitudes ?? SOLICITUDES_DEMO),
    residentes: structuredClone(inicial?.residentes ?? RESIDENTES_DEMO),
    conjuntos: structuredClone(inicial?.conjuntos ?? CONJUNTOS_DEMO.map((c) => ({ ...c, version: 1 }))),
  };
}
