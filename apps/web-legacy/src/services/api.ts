/**
 * Cliente de la API real (apps/api). En desarrollo, Vite reenvía /api a `npm run api` (ver vite.config.ts).
 * Los valores de estado, categoría y prioridad llegan con los nombres canónicos de la BD
 * (NUEVA, MANTENIMIENTO, ALTA...); la presentación los traduce con lib/etiquetas.ts.
 */

export interface CorreoBuzon {
  id: number;
  remitente: string;
  asunto: string | null;
  fechaRecepcion: string;
  idResidente: number | null;
  residente: string | null;
  unidad: string | null;
  idSolicitud: number | null;
  codigo: string | null;
  estado: string | null;
  categoria: string | null;
  prioridad: string | null;
  sugerenciaEstado: EstadoSugerencia | null;
  sugerenciaCategoria: string | null;
  extracto: string;
}

export type EstadoSugerencia = 'EN_REINTENTO' | 'LISTA' | 'FALLIDA';

/** Lo que propuso el modelo de IA. Es solo una sugerencia: no cambia la solicitud. */
export interface SugerenciaIA {
  estado: EstadoSugerencia;
  categoria: string | null;
  prioridad: string | null;
  resumen: string | null;
  justificacion: string | null;
  proveedor: string;
  modelo: string;
  fechaActualizacion: string;
}

export interface DetalleCorreo extends Omit<CorreoBuzon, 'extracto'> {
  cuerpo: string;
  /** Lo enmascara el servidor: es el texto que recibe el modelo de IA. */
  cuerpoEnmascarado: string;
  sugerencia: SugerenciaIA | null;
}

export interface PaginaCorreos {
  total: number;
  correos: CorreoBuzon[];
}

export interface EstadoGateway {
  cuentas: { cuenta: string; ultimoUid: number; actualizadoEn: string }[];
  totalCorreos: number;
  ultimoCorreo: string | null;
}

export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ErrorApi';
  }

  /** La API no responde (no está corriendo o el proxy no llega a ella). */
  get sinConexion(): boolean {
    return this.status === 0;
  }
}

async function pedir<T>(ruta: string, signal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(ruta, { headers: { accept: 'application/json' }, signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ErrorApi(0, 'No hay conexión con la API');
  }
  const cuerpo = (await r.json().catch(() => null)) as { error?: string } | null;
  if (!r.ok) {
    // Si el proxy de Vite no alcanza la API responde 5xx sin JSON: eso es "sin conexión".
    if (r.status >= 500 && !cuerpo?.error) throw new ErrorApi(0, 'No hay conexión con la API');
    throw new ErrorApi(r.status, cuerpo?.error ?? `Error ${r.status}`);
  }
  return cuerpo as T;
}

export const api = {
  correos(filtro: { q?: string; limite?: number; desplazamiento?: number } = {}, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    if (filtro.q) qs.set('q', filtro.q);
    if (filtro.limite !== undefined) qs.set('limite', String(filtro.limite));
    if (filtro.desplazamiento !== undefined) qs.set('desplazamiento', String(filtro.desplazamiento));
    return pedir<PaginaCorreos>(`/api/correos?${qs}`, signal);
  },
  correo(id: number, signal?: AbortSignal) {
    return pedir<DetalleCorreo>(`/api/correos/${id}`, signal);
  },
  estadoGateway(signal?: AbortSignal) {
    return pedir<EstadoGateway>('/api/gateway/estado', signal);
  },
};
