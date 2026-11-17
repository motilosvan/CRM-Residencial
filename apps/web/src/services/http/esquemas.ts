import { z } from 'zod';

const color = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const esquemaConjunto = z.object({
  id: z.string(),
  slug: z.string(),
  nombre: z.string(),
  logoUrl: z.string().optional(),
  paleta: z.object({ primario: color, acento: color, secundario: color.optional() }).optional(),
});

export const esquemaSesion = z.object({
  usuario: z.object({
    id: z.string(),
    nombre: z.string(),
    correo: z.string(),
    rol: z.enum(['ADMIN', 'SOPORTE']),
  }),
  conjuntoActivo: esquemaConjunto,
  conjuntos: z.array(esquemaConjunto),
  ultimaActividad: z.number(),
});

export const esquemaResumen = z.object({
  porEstado: z.array(z.object({ estado: z.string(), n: z.number() })),
  carga: z.array(z.object({ idUsuario: z.number(), nombre: z.string(), abiertas: z.number() })),
  respuesta: z.array(
    z.object({
      categoria: z.string(),
      total: z.number(),
      minutosPromedio: z.number(),
      dentroSla: z.number(),
    }),
  ),
});

export const esquemaEstadoGateway = z.object({
  cuentas: z.array(
    z.object({
      cuenta: z.string(),
      ultimoUid: z.number(),
      actualizadoEn: z.string(),
    }),
  ),
  totalCorreos: z.number(),
  ultimoCorreo: z.string().nullable(),
  conectado: z.boolean(),
  buzon: z
    .object({
      correo: z.string(),
      imapHost: z.string(),
      imapPort: z.number(),
      buzon: z.string(),
      diasIniciales: z.number(),
      marcarLeido: z.boolean(),
      activo: z.boolean(),
      ultimaSincronizacion: z.string().nullable(),
      ultimoError: z.string().nullable(),
      version: z.number(),
    })
    .nullable(),
});

export const esquemaUsuarioConjunto = z.object({
  id: z.number().int().positive(),
  nombre: z.string(),
  correo: z.string(),
  rol: z.enum(['ADMIN', 'SOPORTE']),
  activo: z.boolean(),
  version: z.number().int().positive(),
  cuentaActiva: z.boolean(),
});

export const esquemaResultadoSincronizacion = z.object({
  revisados: z.number().int().nonnegative(),
  nuevos: z.number().int().nonnegative(),
  duplicados: z.number().int().nonnegative(),
  respaldos: z.number().int().nonnegative(),
  pendientes: z.boolean(),
});

const esquemaEstadoSugerencia = z.enum(['EN_REINTENTO', 'LISTA', 'FALLIDA']);
const esquemaEstadoSolicitud = z.enum(['NUEVA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA']);
const esquemaCategoriaSolicitud = z.enum([
  'SEGURIDAD',
  'MANTENIMIENTO',
  'FACTURACION',
  'ADMINISTRATIVO',
  'SIN_CLASIFICAR',
]);
const esquemaPrioridadSolicitud = z.enum(['ALTA', 'MEDIA', 'BAJA']);

export const esquemaSugerenciaGuardada = z.object({
  estado: esquemaEstadoSugerencia,
  categoria: z.string().nullable(),
  prioridad: z.string().nullable(),
  resumen: z.string().nullable(),
  justificacion: z.string().nullable(),
  proveedor: z.string(),
  modelo: z.string(),
  fechaActualizacion: z.string(),
});

const esquemaFilaCorreoBase = z.object({
  id: z.number().int().positive(),
  remitente: z.string(),
  asunto: z.string().nullable(),
  fechaRecepcion: z.string(),
  idResidente: z.number().int().positive().nullable(),
  residente: z.string().nullable(),
  unidad: z.string().nullable(),
  idSolicitud: z.number().int().positive().nullable(),
  codigo: z.string().nullable(),
  estado: esquemaEstadoSolicitud.nullable(),
  categoria: z.string().nullable(),
  prioridad: z.string().nullable(),
  sugerenciaEstado: esquemaEstadoSugerencia.nullable(),
  sugerenciaCategoria: z.string().nullable(),
});

export const esquemaFilaCorreoBuzon = esquemaFilaCorreoBase.extend({
  extracto: z.string(),
});

export const esquemaListaCorreos = z.object({
  total: z.number().int().nonnegative(),
  correos: z.array(esquemaFilaCorreoBuzon),
});

export const esquemaDetalleCorreo = esquemaFilaCorreoBase.extend({
  cuerpo: z.string(),
  cuerpoEnmascarado: z.string(),
  sugerencia: esquemaSugerenciaGuardada.nullable(),
});

export const esquemaFilaSolicitud = z.object({
  id: z.number().int().positive(),
  codigo: z.string(),
  asunto: z.string().nullable(),
  remitente: z.string(),
  estado: esquemaEstadoSolicitud,
  categoria: esquemaCategoriaSolicitud,
  prioridad: esquemaPrioridadSolicitud,
  slaHoras: z.number().int().positive(),
  version: z.number().int().positive(),
  fechaCreacion: z.string(),
  primeraRespuesta: z.string().nullable(),
  fechaCierre: z.string().nullable(),
  responsable: z.string().nullable(),
  idResponsable: z.number().int().positive().nullable(),
});

export const esquemaListaSolicitudes = z.array(esquemaFilaSolicitud);

export const esquemaEventoHistorialSolicitud = z.object({
  anterior: esquemaEstadoSolicitud.nullable(),
  nuevo: esquemaEstadoSolicitud,
  usuario: z.string().nullable(),
  comentario: z.string().nullable(),
  fecha: z.string(),
});

export const esquemaAsignacionSolicitud = z.object({
  nombre: z.string(),
  fechaAsignacion: z.string(),
  liberadaEn: z.string().nullable(),
});

export const esquemaDetalleSolicitud = esquemaFilaSolicitud.extend({
  cuerpo: z.string(),
  messageId: z.string(),
  historial: z.array(esquemaEventoHistorialSolicitud),
  asignaciones: z.array(esquemaAsignacionSolicitud),
  destinos: z.array(esquemaEstadoSolicitud),
  sugerencia: esquemaSugerenciaGuardada.nullable(),
});

export const esquemaResultadoAsignacion = z.union([
  z.object({
    sinCambios: z.literal(true),
    version: z.number().int().positive(),
  }),
  z.object({
    sinCambios: z.literal(false),
    version: z.number().int().positive(),
    estado: esquemaEstadoSolicitud,
    idAsignacion: z.number().int().positive(),
  }),
]);

export const esquemaResultadoCambioEstado = z.object({
  idSolicitud: z.number().int().positive(),
  estado: esquemaEstadoSolicitud,
  version: z.number().int().positive(),
});

export const esquemaResultadoReclasificacion = z.object({
  idSolicitud: z.number().int().positive(),
  categoria: esquemaCategoriaSolicitud,
  prioridad: esquemaPrioridadSolicitud,
  version: z.number().int().positive(),
  sinCambios: z.boolean(),
});

export const esquemaResidenteConjunto = z.object({
  id: z.number().int().positive(),
  nombre: z.string(),
  unidad: z.string(),
  correo: z.string().nullable(),
  telefono: z.string().nullable(),
  activo: z.boolean(),
  version: z.number().int().positive(),
  totalSolicitudes: z.number().int().nonnegative(),
});

export const esquemaListaResidentes = z.array(esquemaResidenteConjunto);

export const esquemaSugerenciaPendienteValidacion = z.object({
  idSolicitud: z.number().int().positive(),
  codigo: z.string(),
  asunto: z.string().nullable(),
  remitente: z.string(),
  fechaCreacion: z.string(),
  estado: esquemaEstadoSolicitud,
  categoriaActual: esquemaCategoriaSolicitud,
  prioridadActual: esquemaPrioridadSolicitud,
  version: z.number().int().positive(),
  sugerencia: z.object({
    categoria: esquemaCategoriaSolicitud,
    prioridad: esquemaPrioridadSolicitud,
    resumen: z.string(),
    justificacion: z.string().nullable(),
    proveedor: z.string(),
    modelo: z.string(),
    fechaActualizacion: z.string(),
  }),
});

export const esquemaColaValidacion = z.object({
  sugerencias: z.array(esquemaSugerenciaPendienteValidacion),
  remitentesSinResidente: z.array(esquemaFilaCorreoBuzon),
});

export const esquemaConjuntoIdentidad = esquemaConjunto.extend({
  version: z.number().int().positive(),
});

export const esquemaCatalogoCategoria = z.object({
  id: z.number().int().positive(),
  nombre: esquemaCategoriaSolicitud,
  prioridadBase: esquemaPrioridadSolicitud,
  palabrasClave: z.array(z.string()),
});

export const esquemaCatalogoPrioridad = z.object({
  id: z.number().int().positive(),
  nombre: esquemaPrioridadSolicitud,
  peso: z.number().int().positive(),
  slaHoras: z.number().int().positive(),
});

export const esquemaCatalogoEstado = z.object({
  id: z.number().int().positive(),
  nombre: esquemaEstadoSolicitud,
  esFinal: z.boolean(),
});

export const esquemaCatalogoTransicion = z.object({
  origen: esquemaEstadoSolicitud,
  destino: esquemaEstadoSolicitud,
});

export const esquemaCatalogosDominio = z.object({
  categorias: z.array(esquemaCatalogoCategoria),
  prioridades: z.array(esquemaCatalogoPrioridad),
  palabrasClaveUrgencia: z.array(z.string()),
  estados: z.array(esquemaCatalogoEstado),
  transiciones: z.array(esquemaCatalogoTransicion),
});
