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

/**
 * Error del acceso por código y de la sesión. Lleva su estado HTTP y un código estable para el panel;
 * `detalle` solo trae números (nunca el correo ni el código).
 */
export class ErrorAcceso extends Error {
  override name = 'ErrorAcceso';
  constructor(
    readonly estado: 400 | 401 | 403 | 410 | 429,
    readonly codigo:
      | 'CODIGO_INCORRECTO'
      | 'CODIGO_VENCIDO'
      | 'BLOQUEADO'
      | 'REENVIO_PRONTO'
      | 'NO_AUTENTICADO'
      | 'SESION_INACTIVA'
      | 'SIN_MEMBRESIA',
    readonly detalle?: { intentosRestantes?: number; desbloqueoEn?: number },
  ) {
    super(codigo);
  }
}
