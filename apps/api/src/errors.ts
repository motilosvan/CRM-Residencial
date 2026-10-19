/** Errores de negocio. La capa de rutas los traduce: NotFound→404, ConflictError→409, TransicionInvalida/ValidationError→422. */

export class NotFound extends Error {
  override name = 'NotFound';
}

/** La solicitud cambió desde que el cliente la leyó (control de concurrencia optimista). */
export class ConflictError extends Error {
  override name = 'ConflictError';
}

export class TransicionInvalida extends Error {
  override name = 'TransicionInvalida';
  constructor(
    readonly desde: string,
    readonly hasta: string,
    detalle?: string,
  ) {
    super(`Transición no permitida: ${desde} → ${hasta}${detalle ? ` (${detalle})` : ''}`);
  }
}

export class ValidationError extends Error {
  override name = 'ValidationError';
}
