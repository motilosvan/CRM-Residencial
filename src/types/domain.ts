export type RolUsuario = 'Administrador' | 'Soporte';

export type CategoriaSolicitud =
  | 'Mantenimiento'
  | 'Administrativo'
  | 'Facturación'
  | 'Seguridad';

export type PrioridadSolicitud = 'Alta' | 'Media' | 'Baja';

export type EstadoSolicitud =
  | 'Pendiente de validación'
  | 'Validada'
  | 'Asignada'
  | 'En proceso'
  | 'Resuelta'
  | 'Cerrada';

export type OrigenClasificacion = 'IA' | 'Reglas';

export type EstadoProcesamientoCorreo =
  | 'Recibido'
  | 'Procesando IA'
  | 'Procesado IA'
  | 'Procesado por Reglas';

export interface UsuarioSistema {
  id: string;
  nombre: string;
  correo: string;
  cargo: string;
  rol: RolUsuario;
  activo: boolean;
  avatar: string;
  ultimaSesion: string;
}

export interface Residente {
  id: string;
  nombre: string;
  torre: string;
  apartamento: string;
  correo: string;
  telefono: string;
  activo: boolean;
  fechaRegistro: string;
}

export interface SugerenciaClasificacion {
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  resumen: string;
  justificacion: string;
  confianza: number;
  origen: OrigenClasificacion;
  pendienteRevisionReglas: boolean;
}

export interface EventoHistorial {
  id: string;
  solicitudId: string;
  fecha: string;
  actor: string;
  tipoAccion:
    | 'RECEPCION'
    | 'SUGERENCIA_IA'
    | 'RESPALDO_REGLAS'
    | 'VALIDACION'
    | 'ASIGNACION'
    | 'CAMBIO_ESTADO'
    | 'RESPUESTA_CORREO'
    | 'CATALOGO_CONFIG';
  descripcion: string;
  valorAnterior?: string;
  valorNuevo?: string;
}

export interface Solicitud {
  id: string;
  radicado: string;
  correoId: string;
  remitenteCorreo: string;
  remitenteNombre: string;
  residenteId: string | null;
  asunto: string;
  cuerpoOriginal: string;
  cuerpoEnmascarado: string;
  fechaRecepcion: string;
  fechaActualizacion: string;
  fechaCierre?: string;
  tiempoRespuestaHoras?: number;
  estadoProcesamientoCorreo: EstadoProcesamientoCorreo;
  sugerencia: SugerenciaClasificacion;
  validadaPor?: string;
  fechaValidacion?: string;
  huboModificacionAlValidar?: boolean;
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  estado: EstadoSolicitud;
  pendienteRevision: boolean;
  responsableId: string | null;
  slaHoras: number;
  historial: EventoHistorial[];
}

export interface PublicacionInstitucional {
  id: string;
  titulo: string;
  categoria: string;
  fecha: string;
  extracto: string;
  contenido: string;
  imagenUrl: string;
}

export interface KpiResumen {
  pendientesValidar: number;
  urgentesAbiertas: number;
  tiempoPromedioRespuestaHoras: number;
  resueltasMes: number;
  porcentajeAprobadasSinCambios: number;
  porcentajeUrgentesAlta: number;
}
