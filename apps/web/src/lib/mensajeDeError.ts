import { ErrorApi, ErrorAuth, type CodigoErrorAuth, type TipoErrorApi } from '@/services/contratos';

const MENSAJE_GENERICO = 'No pudimos completar la operación. Inténtalo de nuevo.';
const MAX_LONGITUD_API = 300;

const TEXTOS_API: Record<Exclude<TipoErrorApi, 'CONFLICTO' | 'INVALIDO'>, string> = {
  RED: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  NO_AUTENTICADO: 'Tu sesión venció. Vuelve a iniciar sesión para continuar.',
  PROHIBIDO: 'No tienes permiso para realizar esta acción.',
  NO_ENCONTRADO: 'No encontramos lo que buscas.',
  LIMITE: 'Demasiadas solicitudes en poco tiempo. Espera un momento e inténtalo de nuevo.',
  SERVIDOR: 'El servidor tuvo un problema al procesar la solicitud. Inténtalo de nuevo.',
};

const TEXTOS_AUTH: Record<CodigoErrorAuth, string> = {
  CODIGO_INCORRECTO: 'El código ingresado no es correcto.',
  CODIGO_VENCIDO: 'El código venció. Solicita uno nuevo.',
  BLOQUEADO: 'Demasiados intentos fallidos. Espera un momento antes de volver a intentar.',
  REENVIO_PRONTO: 'Espera un momento antes de pedir otro código.',
  SIN_MEMBRESIA: 'Tu correo no tiene acceso a este conjunto.',
  RED: TEXTOS_API.RED,
};

function mensajeApiSeguro(crudo: string): string {
  const texto = crudo.trim();
  if (!texto || texto.length > MAX_LONGITUD_API) return MENSAJE_GENERICO;
  // Evita exponer objetos/arreglos JSON o trazas de error que lleguen desde un proxy o respuesta inesperada.
  if (/[{}]/.test(texto) || texto.startsWith('[')) return MENSAJE_GENERICO;
  if (/[\r\n]/.test(texto) || /\bat\s+[\w.$<>]+\s*\(/.test(texto)) return MENSAJE_GENERICO;
  if (/^(?:TypeError|ReferenceError|SyntaxError|RangeError|Error):/i.test(texto)) return MENSAJE_GENERICO;
  return texto;
}

/** Devuelve un mensaje en español seguro para mostrar en la interfaz a partir de cualquier error. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) {
    if (error.tipo === 'CONFLICTO' || error.tipo === 'INVALIDO') {
      return mensajeApiSeguro(error.mensaje);
    }
    return TEXTOS_API[error.tipo];
  }
  if (error instanceof ErrorAuth) {
    return TEXTOS_AUTH[error.codigo] ?? MENSAJE_GENERICO;
  }
  return MENSAJE_GENERICO;
}
