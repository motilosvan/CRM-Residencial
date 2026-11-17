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

export interface EntradaBuzon {
  correo: string;
  contrasena: string;
  imapHost?: string;
  imapPort?: number;
  buzon?: string;
  diasIniciales?: number;
  marcarLeido?: boolean;
  versionEsperada?: number;
}

export interface ResultadoSincronizacionBuzon {
  revisados: number;
  nuevos: number;
  duplicados: number;
  respaldos: number;
  pendientes: boolean;
}

export interface BuzonService {
  /** GET /gateway/estado */
  estado(signal?: AbortSignal): Promise<EstadoGateway>;
  /** PUT /buzon */
  guardar(entrada: EntradaBuzon): Promise<EstadoGateway>;
  /** POST /buzon/desconectar */
  desconectar(versionEsperada?: number): Promise<EstadoGateway>;
  /** POST /buzon/sincronizar */
  sincronizar(): Promise<ResultadoSincronizacionBuzon>;
}

/* ---------- Bandeja de correos del conjunto ---------- */

export type EstadoSugerencia = 'EN_REINTENTO' | 'LISTA' | 'FALLIDA';

export interface SugerenciaGuardada {
  estado: EstadoSugerencia;
  categoria: string | null;
  prioridad: string | null;
  resumen: string | null;
  justificacion: string | null;
  proveedor: string;
  modelo: string;
  fechaActualizacion: string;
}

export type EstadoSolicitud = 'NUEVA' | 'ASIGNADA' | 'EN_PROCESO' | 'RESUELTA' | 'CERRADA';
export type CategoriaSolicitud = 'SEGURIDAD' | 'MANTENIMIENTO' | 'FACTURACION' | 'ADMINISTRATIVO' | 'SIN_CLASIFICAR';
export type PrioridadSolicitud = 'ALTA' | 'MEDIA' | 'BAJA';

export type EstadoSolicitudCorreo = EstadoSolicitud;

export interface FilaCorreo {
  id: number;
  remitente: string;
  asunto: string | null;
  fechaRecepcion: string;
  idResidente: number | null;
  residente: string | null;
  unidad: string | null;
  idSolicitud: number | null;
  codigo: string | null;
  estado: EstadoSolicitudCorreo | null;
  categoria: string | null;
  prioridad: string | null;
  sugerenciaEstado: EstadoSugerencia | null;
  sugerenciaCategoria: string | null;
}

export interface FilaCorreoBuzon extends FilaCorreo {
  extracto: string;
}

export interface DetalleCorreoBuzon extends FilaCorreo {
  cuerpo: string;
  cuerpoEnmascarado: string;
  sugerencia: SugerenciaGuardada | null;
}

export interface FiltroCorreos {
  q?: string;
  limite?: number;
  desplazamiento?: number;
}

export interface ListaCorreosBuzon {
  total: number;
  correos: FilaCorreoBuzon[];
}

export interface CorreosService {
  /** GET /correos */
  listar(filtro?: FiltroCorreos, signal?: AbortSignal): Promise<ListaCorreosBuzon>;
  /** GET /correos/:id */
  detalle(id: number, signal?: AbortSignal): Promise<DetalleCorreoBuzon>;
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

/* ---------- Solicitudes del conjunto (T2–T4, T7→T4) ---------- */

export interface FilaSolicitud {
  id: number;
  codigo: string;
  asunto: string | null;
  remitente: string;
  estado: EstadoSolicitud;
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  slaHoras: number;
  version: number;
  fechaCreacion: string;
  primeraRespuesta: string | null;
  fechaCierre: string | null;
  responsable: string | null;
  idResponsable: number | null;
}

export interface EventoHistorialSolicitud {
  anterior: EstadoSolicitud | null;
  nuevo: EstadoSolicitud;
  usuario: string | null;
  comentario: string | null;
  fecha: string;
}

export interface AsignacionSolicitud {
  nombre: string;
  fechaAsignacion: string;
  liberadaEn: string | null;
}

export interface DetalleSolicitud extends FilaSolicitud {
  cuerpo: string;
  messageId: string;
  historial: EventoHistorialSolicitud[];
  asignaciones: AsignacionSolicitud[];
  destinos: EstadoSolicitud[];
  sugerencia: SugerenciaGuardada | null;
}

export interface FiltroSolicitudes {
  estado?: EstadoSolicitud;
  categoria?: CategoriaSolicitud;
  prioridad?: PrioridadSolicitud;
  idResponsable?: number;
  limite?: number;
  desplazamiento?: number;
}

export interface EntradaAsignacionSolicitud {
  idResponsable: number;
  versionEsperada: number;
}

export type ResultadoAsignacion =
  | { sinCambios: true; version: number }
  | { sinCambios: false; version: number; estado: EstadoSolicitud; idAsignacion: number };

export interface EntradaCambioEstadoSolicitud {
  nuevoEstado: EstadoSolicitud;
  versionEsperada: number;
  comentario?: string;
}

export interface ResultadoCambioEstado {
  idSolicitud: number;
  estado: EstadoSolicitud;
  version: number;
}

export interface EntradaReclasificacionSolicitud {
  categoria?: CategoriaSolicitud;
  prioridad?: PrioridadSolicitud;
  versionEsperada: number;
  comentario?: string;
}

export interface EntradaAceptarSugerenciaSolicitud {
  versionEsperada: number;
  comentario?: string;
}

export interface ResultadoReclasificacion {
  idSolicitud: number;
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  version: number;
  sinCambios: boolean;
}

export interface SolicitudesService {
  /** GET /solicitudes */
  listar(filtro?: FiltroSolicitudes, signal?: AbortSignal): Promise<FilaSolicitud[]>;
  /** GET /solicitudes/:id */
  detalle(id: number, signal?: AbortSignal): Promise<DetalleSolicitud>;
  /** POST /solicitudes/:id/asignar */
  asignar(id: number, entrada: EntradaAsignacionSolicitud): Promise<ResultadoAsignacion>;
  /** POST /solicitudes/:id/estado */
  cambiarEstado(id: number, entrada: EntradaCambioEstadoSolicitud): Promise<ResultadoCambioEstado>;
  /** POST /solicitudes/:id/reclasificar */
  reclasificar(id: number, entrada: EntradaReclasificacionSolicitud): Promise<ResultadoReclasificacion>;
  /** POST /solicitudes/:id/aceptar-sugerencia */
  aceptarSugerencia(id: number, entrada: EntradaAceptarSugerenciaSolicitud): Promise<ResultadoReclasificacion>;
}

/* ---------- Residentes y cola de validación (Ola 2) ---------- */

export interface ResidenteConjunto {
  id: number;
  nombre: string;
  unidad: string;
  correo: string | null;
  telefono: string | null;
  activo: boolean;
  version: number;
  totalSolicitudes: number;
}

export interface FiltroResidentes {
  q?: string;
  soloActivos?: boolean;
}

export interface EntradaResidente {
  nombre: string;
  unidad: string;
  correo?: string | null;
  telefono?: string | null;
}

export interface CambioResidente {
  nombre?: string;
  unidad?: string;
  correo?: string | null;
  telefono?: string | null;
  activo?: boolean;
  versionEsperada: number;
}

export interface EntradaVincularCorreo {
  idResidente?: number;
  residente?: {
    nombre: string;
    unidad: string;
    telefono?: string | null;
    usarCorreoRemitente?: boolean;
  };
}

export interface ResidentesService {
  /** GET /residentes */
  listar(filtro?: FiltroResidentes, signal?: AbortSignal): Promise<ResidenteConjunto[]>;
  /** POST /residentes */
  crear(entrada: EntradaResidente): Promise<ResidenteConjunto>;
  /** PATCH /residentes/:id */
  actualizar(id: number, cambio: CambioResidente): Promise<ResidenteConjunto>;
  /** POST /correos/:id/vincular-residente */
  vincularCorreo(idCorreo: number, entrada: EntradaVincularCorreo): Promise<DetalleCorreoBuzon>;
}

export interface SugerenciaPendienteValidacion {
  idSolicitud: number;
  codigo: string;
  asunto: string | null;
  remitente: string;
  fechaCreacion: string;
  estado: EstadoSolicitud;
  categoriaActual: CategoriaSolicitud;
  prioridadActual: PrioridadSolicitud;
  version: number;
  sugerencia: {
    categoria: CategoriaSolicitud;
    prioridad: PrioridadSolicitud;
    resumen: string;
    justificacion: string | null;
    proveedor: string;
    modelo: string;
    fechaActualizacion: string;
  };
}

export interface ColaValidacion {
  sugerencias: SugerenciaPendienteValidacion[];
  remitentesSinResidente: FilaCorreoBuzon[];
}

export interface ValidacionService {
  /** GET /validacion */
  obtener(signal?: AbortSignal): Promise<ColaValidacion>;
}

/* ---------- Identidad del conjunto y catálogos del dominio (Ola 2) ---------- */

export interface ConjuntoIdentidad extends Conjunto {
  version: number;
}

export interface EntradaIdentidadConjunto {
  nombre?: string;
  logoUrl?: string | null;
  colorPrimario?: string | null;
  colorAcento?: string | null;
  colorSecundario?: string | null;
  versionEsperada: number;
}

export interface IdentidadService {
  /** GET /conjunto/identidad */
  obtener(signal?: AbortSignal): Promise<ConjuntoIdentidad>;
  /** PATCH /conjunto/identidad */
  actualizar(entrada: EntradaIdentidadConjunto): Promise<ConjuntoIdentidad>;
}

export interface CatalogoCategoria {
  id: number;
  nombre: CategoriaSolicitud;
  prioridadBase: PrioridadSolicitud;
  palabrasClave: string[];
}

export interface CatalogoPrioridad {
  id: number;
  nombre: PrioridadSolicitud;
  peso: number;
  slaHoras: number;
}

export interface CatalogoEstado {
  id: number;
  nombre: EstadoSolicitud;
  esFinal: boolean;
}

export interface CatalogoTransicion {
  origen: EstadoSolicitud;
  destino: EstadoSolicitud;
}

export interface CatalogosDominio {
  categorias: CatalogoCategoria[];
  prioridades: CatalogoPrioridad[];
  palabrasClaveUrgencia: string[];
  estados: CatalogoEstado[];
  transiciones: CatalogoTransicion[];
}

export interface CatalogosService {
  /** GET /catalogos */
  obtener(signal?: AbortSignal): Promise<CatalogosDominio>;
}

/* ---------- Reportes, Auditoría Global y Laboratorio IA (Ola 3) ---------- */

export interface ReportePeriodo {
  desde: string | null;
  hasta: string | null;
}

export interface ReporteTotales {
  total: number;
  abiertas: number;
  resueltas: number;
  cerradas: number;
}

export interface ReportePorEstado {
  estado: string;
  n: number;
}

export interface ReportePorCategoria {
  categoria: string;
  n: number;
}

export interface ReportePorPrioridad {
  prioridad: string;
  n: number;
}

export interface ReporteRespuestaCategoria {
  categoria: string;
  total: number;
  minutosPromedio: number;
  dentroSla: number;
  porcentajeSla: number;
}

export interface ReporteGlobal {
  totalConRespuesta: number;
  minutosPromedio: number | null;
  dentroSla: number;
  porcentajeSla: number | null;
}

export interface ReporteCargaUsuario {
  idUsuario: number;
  nombre: string;
  abiertas: number;
  resueltasEnPeriodo: number;
}

export interface ReporteSolicitudes {
  periodo: ReportePeriodo;
  totales: ReporteTotales;
  porEstado: ReportePorEstado[];
  porCategoria: ReportePorCategoria[];
  porPrioridad: ReportePorPrioridad[];
  respuesta: ReporteRespuestaCategoria[];
  global: ReporteGlobal;
  carga: ReporteCargaUsuario[];
}

export interface FiltroReporte {
  desde?: string;
  hasta?: string;
}

export interface ReportesService {
  /** GET /reportes */
  obtener(filtro?: FiltroReporte, signal?: AbortSignal): Promise<ReporteSolicitudes>;
  /** GET /reportes?formato=csv */
  descargarCsv(filtro?: FiltroReporte, signal?: AbortSignal): Promise<string>;
}

export type TipoEventoAuditoria = 'ESTADO' | 'ASIGNACION' | 'ADMIN';

export interface EventoAuditoria {
  tipo: TipoEventoAuditoria;
  entidad: string;
  codigo: string;
  accion: string;
  actor: string;
  detalle: string | null;
  fecha: string;
}

export interface FiltroAuditoria {
  q?: string;
  limite?: number;
  desplazamiento?: number;
}

export interface RespuestaAuditoria {
  total: number;
  eventos: EventoAuditoria[];
}

export interface AuditoriaService {
  /** GET /auditoria */
  listar(filtro?: FiltroAuditoria, signal?: AbortSignal): Promise<RespuestaAuditoria>;
}

export interface EntradaLaboratorio {
  asunto: string;
  cuerpo: string;
}

export interface ResultadoLaboratorio {
  asuntoEnmascarado: string;
  cuerpoEnmascarado: string;
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  palabrasDetectadas: string[];
}

export interface LaboratorioService {
  /** POST /laboratorio/probar */
  probar(entrada: EntradaLaboratorio, signal?: AbortSignal): Promise<ResultadoLaboratorio>;
}
