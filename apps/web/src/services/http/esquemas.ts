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
