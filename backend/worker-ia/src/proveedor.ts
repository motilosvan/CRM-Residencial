import type { Categoria } from '../../api/src/domain/clasificador.js';
import type { Prioridad } from '../../api/src/domain/priorizador.js';

/** Texto YA enmascarado: un proveedor nunca recibe el original. */
export interface EntradaIA {
  asunto: string;
  cuerpo: string;
}

export interface SugerenciaIA {
  categoria: Categoria;
  prioridad: Prioridad;
  resumen: string;
  justificacion: string;
  /** Modelo que respondió según el proveedor; puede diferir del pedido. */
  modelo: string;
}

/** Permite cambiar de proveedor sin tocar el ciclo del worker. */
export interface ProveedorIA {
  readonly nombre: string;
  readonly modelo: string;
  sugerir(entrada: EntradaIA): Promise<SugerenciaIA>;
}

/**
 * El proveedor limitó las llamadas (HTTP 429): por cuota diaria o, en modelos gratuitos, por ráfagas.
 * No es culpa del correo: el ciclo se pausa sin descontarle intentos.
 */
export class ErrorCuota extends Error {
  override name = 'ErrorCuota';
  constructor(
    message: string,
    readonly reanudarEn: Date,
  ) {
    super(message);
  }
}

/** Llave, modelo, certificado o política de datos: reintentar no sirve, hay que corregir algo. */
export class ErrorConfiguracionIA extends Error {
  override name = 'ErrorConfiguracionIA';
}

/** Fallo pasajero del servicio (5xx, red, tiempo agotado). Se reintenta en el ciclo siguiente. */
export class ErrorTemporalIA extends Error {
  override name = 'ErrorTemporalIA';
}

/** El modelo respondió algo inutilizable para este correo: cuenta como intento. */
export class ErrorRespuestaIA extends Error {
  override name = 'ErrorRespuestaIA';
}
