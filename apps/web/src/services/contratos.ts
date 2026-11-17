import type { Conjunto, Rol, Sesion } from '@/types/conjunto';

export interface ConjuntosService {
  /** GET /conjuntos */
  listar(signal?: AbortSignal): Promise<Conjunto[]>;
}

export interface SolicitudCodigo {
  conjuntoId: string;
  correo: string;
}

/** Marcas de tiempo en epoch ms. */
export interface CodigoEnviado {
  venceEn: number;
  reenvioDisponibleEn: number;
}

export interface AuthService {
  /** POST /auth/codigo */
  solicitarCodigo(p: SolicitudCodigo): Promise<CodigoEnviado>;
  /** POST /auth/verificar */
  verificarCodigo(p: SolicitudCodigo & { codigo: string }): Promise<Sesion>;
  /** GET /auth/sesion. `null` si no hay sesión vigente (401). */
  sesion(): Promise<Sesion | null>;
  /** POST /auth/conjunto */
  cambiarConjunto(conjuntoId: string): Promise<Sesion>;
  /** POST /auth/salir. Nunca lanza: cerrar sesión siempre "funciona" en el cliente. */
  salir(): Promise<void>;
}

export type CodigoErrorAuth =
  | 'CODIGO_INCORRECTO'
  | 'CODIGO_VENCIDO'
  | 'BLOQUEADO'
  | 'REENVIO_PRONTO'
  | 'SIN_MEMBRESIA'
  | 'RED';

/** Error de acceso. Los fallos de red (también en `ConjuntosService`) usan el código 'RED'. */
export class ErrorAuth extends Error {
  readonly codigo: CodigoErrorAuth;
  readonly intentosRestantes?: number;
  readonly desbloqueoEn?: number;

  constructor(codigo: CodigoErrorAuth, detalle?: { intentosRestantes?: number; desbloqueoEn?: number }) {
    super(codigo);
    this.name = 'ErrorAuth';
    this.codigo = codigo;
    this.intentosRestantes = detalle?.intentosRestantes;
    this.desbloqueoEn = detalle?.desbloqueoEn;
  }
}

export type TipoErrorApi =
  | 'NO_AUTENTICADO'
  | 'PROHIBIDO'
  | 'NO_ENCONTRADO'
  | 'CONFLICTO'
  | 'INVALIDO'
  | 'LIMITE'
  | 'RED'
  | 'SERVIDOR';

const MENSAJE_GENERICO = 'No pudimos completar la operación. Inténtalo de nuevo.';

/** Estado HTTP → tipo. 0 (sin respuesta) y los 4xx no previstos son 'RED'; 400 se trata como 'INVALIDO'. */
export function tipoDeEstado(estado: number): TipoErrorApi {
  if (estado === 401) return 'NO_AUTENTICADO';
  if (estado === 403) return 'PROHIBIDO';
  if (estado === 404) return 'NO_ENCONTRADO';
  if (estado === 409) return 'CONFLICTO';
  if (estado === 400 || estado === 422) return 'INVALIDO';
  if (estado === 429) return 'LIMITE';
  if (estado >= 500) return 'SERVIDOR';
  return 'RED';
}

/** Error de las llamadas de datos (`pedirApi*`). `estado` 0 = no hubo respuesta válida (red o forma inesperada). */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly mensaje: string;
  readonly tipo: TipoErrorApi;

  constructor(estado: number, mensaje?: string) {
    const texto = mensaje && mensaje.trim() ? mensaje : MENSAJE_GENERICO;
    super(texto);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.mensaje = texto;
    this.tipo = tipoDeEstado(estado);
  }
}

/* ---------- Resumen del conjunto ---------- */

export interface ResumenEstado {
  estado: string;
  n: number;
}

export interface CargaUsuarioResumen {
  idUsuario: number;
  nombre: string;
  abiertas: number;
}

export interface RespuestaCategoriaResumen {
  categoria: string;
  total: number;
  minutosPromedio: number;
  dentroSla: number;
}

export interface ResumenConjunto {
  porEstado: ResumenEstado[];
  carga: CargaUsuarioResumen[];
  respuesta: RespuestaCategoriaResumen[];
}

export interface ResumenService {
  /** GET /resumen */
  obtener(signal?: AbortSignal): Promise<ResumenConjunto>;
}

/* ---------- Buzón y estado del gateway ---------- */

export type CodigoErrorBuzon = 'AUTENTICACION' | 'CERTIFICADO' | 'CONEXION' | 'CLAVE' | 'INTERNO';

export interface CuentaGateway {
  cuenta: string;
  ultimoUid: number;
  actualizadoEn: string;
}

export interface BuzonPublico {
  correo: string;
  imapHost: string;
  imapPort: number;
  buzon: string;
  diasIniciales: number;
  marcarLeido: boolean;
  activo: boolean;
  ultimaSincronizacion: string | null;
  ultimoError: CodigoErrorBuzon | (string & {}) | null;
  version: number;
}

export interface EstadoGateway {
  cuentas: CuentaGateway[];
  totalCorreos: number;
  ultimoCorreo: string | null;
  conectado: boolean;
  buzon: BuzonPublico | null;
}

/** Contrato del buzón del conjunto (guardar, desconectar y sincronizar se incorporan en 5c). */
export interface BuzonService {
  /** GET /gateway/estado */
  estado(signal?: AbortSignal): Promise<EstadoGateway>;
}

/* ---------- Personal del conjunto (usuarios) ---------- */

export interface UsuarioConjunto {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  /** Estado de la membresía en el conjunto activo. */
  activo: boolean;
  /** Versión de la membresía para control optimista (`versionEsperada` en PATCH). */
  version: number;
  /** Estado global de la cuenta en la plataforma. */
  cuentaActiva: boolean;
}

export interface FiltroUsuarios {
  rol?: Rol;
  incluirInactivos?: boolean;
}

export interface NuevoUsuarioConjunto {
  nombre: string;
  correo: string;
  rol: Rol;
}

export interface CambioUsuarioConjunto {
  rol?: Rol;
  activo?: boolean;
  versionEsperada: number;
}

export interface UsuariosService {
  /** GET /usuarios */
  listar(filtro?: FiltroUsuarios, signal?: AbortSignal): Promise<UsuarioConjunto[]>;
  /** POST /usuarios */
  agregar(entrada: NuevoUsuarioConjunto): Promise<UsuarioConjunto>;
  /** PATCH /usuarios/:id */
  actualizar(id: number, cambio: CambioUsuarioConjunto): Promise<UsuarioConjunto>;
}
