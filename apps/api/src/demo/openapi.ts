import { CATEGORIAS } from '../domain/clasificador.js';
import { ESTADOS } from '../domain/estados.js';
import { PRIORIDADES } from '../domain/priorizador.js';

/**
 * Especificación OpenAPI 3.1 de la API del visor de demostración. Describe SOLO lo que está
 * implementado en `server.ts`; los endpoints planificados para S4 se listan aparte en `PLANIFICADOS`.
 * Si se agrega o cambia una ruta en server.ts, hay que actualizar este archivo.
 */

const errores = {
  '400': { $ref: '#/components/responses/JsonInvalido' },
  '403': { $ref: '#/components/responses/OrigenNoPermitido' },
  '413': { $ref: '#/components/responses/DemasiadoGrande' },
  '415': { $ref: '#/components/responses/SoloJson' },
  '421': { $ref: '#/components/responses/HostNoPermitido' },
  '422': { $ref: '#/components/responses/ReglaDeNegocio' },
  '500': { $ref: '#/components/responses/ErrorInterno' },
};
const erroresGet = { '421': errores['421'], '422': errores['422'], '500': errores['500'] };
const idPath = {
  name: 'id', in: 'path', required: true, description: 'Id numérico de la solicitud (SOL-000035 → 35)',
  schema: { type: 'integer', minimum: 1 }, example: 1,
};
const json = (schema: object, example?: unknown) => ({
  required: true,
  content: { 'application/json': { schema, ...(example !== undefined ? { example } : {}) } },
});
const ok = (description: string, schema: object) => ({ description, content: { 'application/json': { schema } } });

export const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'SOC-CRM — API del visor de demostración',
    version: '0.2.0',
    description:
      'API local del MVP (solo 127.0.0.1, sin autenticación: actúa como el Administrador de demostración). ' +
      'Las escrituras son las transacciones reales T1–T4 sobre SQL Server. Toda escritura sobre una solicitud exige ' +
      'la `version` que se leyó; si otra persona la cambió antes, responde 409. Los POST exigen ' +
      '`Content-Type: application/json` y, si el navegador envía `Origin`, debe ser el del propio visor.',
  },
  servers: [{ url: 'http://127.0.0.1:3100', description: 'Visor local (npm run demo)' }],
  tags: [
    { name: 'Solicitudes', description: 'Bandeja, detalle y cambios sobre una solicitud' },
    { name: 'Correos', description: 'Ingreso de correos (T1)' },
    { name: 'Indicadores', description: 'Resumen de gestión' },
  ],
  paths: {
    '/api/solicitudes': {
      get: {
        tags: ['Solicitudes'],
        operationId: 'listarSolicitudes',
        summary: 'Bandeja de solicitudes',
        description: 'Ordenada por prioridad (ALTA primero) y luego por antigüedad. Lectura consistente (SNAPSHOT).',
        parameters: [
          { name: 'estado', in: 'query', schema: { type: 'string', enum: [...ESTADOS] } },
          { name: 'categoria', in: 'query', schema: { type: 'string', enum: [...CATEGORIAS] } },
          { name: 'prioridad', in: 'query', schema: { type: 'string', enum: [...PRIORIDADES] } },
          { name: 'idResponsable', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 200 } },
          { name: 'desplazamiento', in: 'query', schema: { type: 'integer', minimum: 0, default: 0 } },
        ],
        responses: { '200': ok('Lista de solicitudes', { type: 'array', items: { $ref: '#/components/schemas/FilaBandeja' } }), ...erroresGet },
      },
    },
    '/api/solicitudes/{id}': {
      get: {
        tags: ['Solicitudes'],
        operationId: 'detalleSolicitud',
        summary: 'Detalle de una solicitud',
        description: 'Datos, correo original, historial inmutable, asignaciones y los estados a los que puede pasar (`destinos`). Todo del mismo instante.',
        parameters: [idPath],
        responses: {
          '200': ok('Detalle', { $ref: '#/components/schemas/Detalle' }),
          '404': { $ref: '#/components/responses/NoExiste' },
          ...erroresGet,
        },
      },
    },
    '/api/solicitudes/{id}/estado': {
      post: {
        tags: ['Solicitudes'],
        operationId: 'cambiarEstado',
        summary: 'Cambiar estado (T3)',
        description:
          'Solo transiciones válidas: ASIGNADA→EN_PROCESO, ASIGNADA→NUEVA (desasignar), EN_PROCESO→RESUELTA, RESUELTA→CERRADA, RESUELTA→EN_PROCESO (reabrir). ' +
          'A ASIGNADA se llega solo asignando. Desasignar y cerrar liberan al responsable; CERRADA es final.',
        parameters: [idPath],
        requestBody: json(
          { type: 'object', required: ['nuevoEstado', 'version'], properties: { nuevoEstado: { type: 'string', enum: [...ESTADOS] }, version: { type: 'integer', minimum: 1 } } },
          { nuevoEstado: 'EN_PROCESO', version: 2 },
        ),
        responses: {
          '200': ok('Estado cambiado', { type: 'object', properties: { idSolicitud: { type: 'integer' }, estado: { type: 'string' }, version: { type: 'integer' } } }),
          '404': { $ref: '#/components/responses/NoExiste' },
          '409': { $ref: '#/components/responses/Conflicto' },
          ...errores,
        },
      },
    },
    '/api/solicitudes/{id}/asignar': {
      post: {
        tags: ['Solicitudes'],
        operationId: 'asignar',
        summary: 'Asignar o reasignar responsable (T2)',
        description: 'NUEVA pasa a ASIGNADA. Reasignar libera al anterior. Asignar al mismo responsable devuelve `sinCambios: true`. No se asignan solicitudes RESUELTA ni CERRADA.',
        parameters: [idPath],
        requestBody: json(
          { type: 'object', required: ['idResponsable', 'version'], properties: { idResponsable: { type: 'integer', minimum: 1 }, version: { type: 'integer', minimum: 1 } } },
          { idResponsable: 2, version: 1 },
        ),
        responses: {
          '200': ok('Asignación hecha (o sin cambios)', {
            oneOf: [
              { type: 'object', properties: { sinCambios: { const: true }, version: { type: 'integer' } } },
              { type: 'object', properties: { sinCambios: { const: false }, version: { type: 'integer' }, estado: { type: 'string' }, idAsignacion: { type: 'integer' } } },
            ],
          }),
          '404': { $ref: '#/components/responses/NoExiste' },
          '409': { $ref: '#/components/responses/Conflicto' },
          ...errores,
        },
      },
    },
    '/api/solicitudes/{id}/reclasificar': {
      post: {
        tags: ['Solicitudes'],
        operationId: 'reclasificar',
        summary: 'Reclasificar categoría y/o prioridad (T4)',
        description: 'Al menos uno de los dos. Si no cambia nada responde `sinCambios: true` sin tocar la versión. No aplica a solicitudes CERRADA.',
        parameters: [idPath],
        requestBody: json(
          {
            type: 'object', required: ['version'],
            properties: { categoria: { type: 'string', enum: [...CATEGORIAS] }, prioridad: { type: 'string', enum: [...PRIORIDADES] }, version: { type: 'integer', minimum: 1 } },
          },
          { categoria: 'SEGURIDAD', prioridad: 'ALTA', version: 1 },
        ),
        responses: {
          '200': ok('Reclasificada (o sin cambios)', {
            type: 'object',
            properties: { idSolicitud: { type: 'integer' }, categoria: { type: 'string' }, prioridad: { type: 'string' }, version: { type: 'integer' }, sinCambios: { type: 'boolean' } },
          }),
          '404': { $ref: '#/components/responses/NoExiste' },
          '409': { $ref: '#/components/responses/Conflicto' },
          ...errores,
        },
      },
    },
    '/api/ingesta': {
      post: {
        tags: ['Correos'],
        operationId: 'ingestarCorreo',
        summary: 'Simular un correo entrante (T1)',
        description:
          'Crea correo + solicitud NUEVA + historial, ya clasificada y priorizada. El visor genera un Message-ID único en cada llamada. ' +
          'Un remitente inválido se guarda como desconocido@invalid; el asunto se recorta a 500 caracteres.',
        requestBody: json(
          {
            type: 'object', required: ['remitente', 'asunto', 'cuerpo'],
            properties: { remitente: { type: 'string', maxLength: 320 }, asunto: { type: 'string', maxLength: 2000 }, cuerpo: { type: 'string', maxLength: 20000 } },
          },
          { remitente: 'ana.torres@mail.com', asunto: 'Fuga de agua en el parqueadero', cuerpo: 'Hay agua saliendo de una tubería, es urgente.' },
        ),
        responses: {
          '200': ok('Solicitud creada (o duplicado ignorado)', {
            oneOf: [
              { type: 'object', properties: { duplicado: { const: true } } },
              {
                type: 'object',
                properties: {
                  duplicado: { const: false }, idCorreo: { type: 'integer' }, idSolicitud: { type: 'integer' },
                  categoria: { type: 'string', enum: [...CATEGORIAS] }, prioridad: { type: 'string', enum: [...PRIORIDADES] },
                  idResidente: { type: ['integer', 'null'] },
                },
              },
            ],
          }),
          ...errores,
        },
      },
    },
    '/api/resumen': {
      get: {
        tags: ['Indicadores'],
        operationId: 'resumen',
        summary: 'Indicadores de gestión',
        description: 'Solicitudes por estado, carga de cada responsable (solo solicitudes no finales), tiempo medio hasta la primera respuesta y cuántas se atendieron dentro del SLA. Lectura SNAPSHOT.',
        responses: {
          '200': ok('Indicadores', {
            type: 'object',
            properties: {
              porEstado: { type: 'array', items: { type: 'object', properties: { estado: { type: 'string' }, n: { type: 'integer' } } } },
              carga: { type: 'array', items: { type: 'object', properties: { idUsuario: { type: 'integer' }, nombre: { type: 'string' }, abiertas: { type: 'integer' } } } },
              respuesta: { type: 'array', items: { type: 'object', properties: { categoria: { type: 'string' }, total: { type: 'integer' }, minutosPromedio: { type: 'integer' }, dentroSla: { type: 'integer' } } } },
              responsables: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, nombre: { type: 'string' } } } },
            },
          }),
          ...erroresGet,
        },
      },
    },
    '/api/openapi.json': {
      get: { tags: ['Indicadores'], operationId: 'openapi', summary: 'Esta especificación (OpenAPI 3.1)', responses: { '200': { description: 'Especificación' } } },
    },
  },
  components: {
    schemas: {
      FilaBandeja: {
        type: 'object',
        properties: {
          id: { type: 'integer' }, codigo: { type: 'string', example: 'SOL-000035' }, asunto: { type: ['string', 'null'] }, remitente: { type: 'string' },
          estado: { type: 'string', enum: [...ESTADOS] }, categoria: { type: 'string', enum: [...CATEGORIAS] }, prioridad: { type: 'string', enum: [...PRIORIDADES] },
          slaHoras: { type: 'integer' }, version: { type: 'integer' }, fechaCreacion: { type: 'string', format: 'date-time' },
          primeraRespuesta: { type: ['string', 'null'], format: 'date-time' }, fechaCierre: { type: ['string', 'null'], format: 'date-time' },
          responsable: { type: ['string', 'null'] }, idResponsable: { type: ['integer', 'null'] },
        },
      },
      Detalle: {
        allOf: [
          { $ref: '#/components/schemas/FilaBandeja' },
          {
            type: 'object',
            properties: {
              cuerpo: { type: 'string' }, messageId: { type: 'string' },
              historial: { type: 'array', items: { type: 'object', properties: { anterior: { type: ['string', 'null'] }, nuevo: { type: 'string' }, usuario: { type: ['string', 'null'] }, comentario: { type: ['string', 'null'] }, fecha: { type: 'string', format: 'date-time' } } } },
              asignaciones: { type: 'array', items: { type: 'object', properties: { nombre: { type: 'string' }, fechaAsignacion: { type: 'string', format: 'date-time' }, liberadaEn: { type: ['string', 'null'], format: 'date-time' } } } },
              destinos: { type: 'array', items: { type: 'string' }, description: 'Estados a los que se puede pasar con /estado' },
            },
          },
        ],
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
    },
    responses: {
      JsonInvalido: { description: 'El cuerpo no es JSON válido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      OrigenNoPermitido: { description: 'La petición viene de otra página (protección CSRF)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NoExiste: { description: 'La solicitud no existe', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Conflicto: { description: 'Otra persona cambió la solicitud: la versión enviada no es la actual. Recargar y reintentar.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      DemasiadoGrande: { description: 'Cuerpo mayor de 64 KB', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      SoloJson: { description: 'Falta Content-Type: application/json', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      HostNoPermitido: { description: 'Host distinto de 127.0.0.1/localhost (protección DNS rebinding)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      ReglaDeNegocio: { description: 'Datos inválidos o regla de negocio (transición no permitida, responsable inactivo…)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      ErrorInterno: { description: 'Error inesperado (sin detalles, para no filtrar datos)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
} as const;

/** Endpoints de la API definitiva (S4, con login y roles). NO están implementados todavía. */
export const PLANIFICADOS = [
  { metodo: 'POST', ruta: '/api/v1/auth/login', rol: '—', descripcion: 'Iniciar sesión (cookie httpOnly)' },
  { metodo: 'POST', ruta: '/api/v1/auth/logout', rol: 'cualquiera', descripcion: 'Cerrar sesión' },
  { metodo: 'GET', ruta: '/api/v1/solicitudes', rol: 'ADMIN, SOPORTE', descripcion: 'Bandeja (SOPORTE ve solo las suyas)' },
  { metodo: 'GET', ruta: '/api/v1/solicitudes/:id', rol: 'ADMIN, SOPORTE', descripcion: 'Detalle' },
  { metodo: 'POST', ruta: '/api/v1/solicitudes/:id/asignacion', rol: 'ADMIN', descripcion: 'Asignar / reasignar' },
  { metodo: 'POST', ruta: '/api/v1/solicitudes/:id/estado', rol: 'ADMIN, SOPORTE*', descripcion: 'Cambiar estado (*SOPORTE solo las asignadas a sí mismo)' },
  { metodo: 'PATCH', ruta: '/api/v1/solicitudes/:id/clasificacion', rol: 'ADMIN', descripcion: 'Reclasificar' },
  { metodo: 'GET', ruta: '/api/v1/usuarios', rol: 'ADMIN', descripcion: 'Personal y responsables disponibles' },
  { metodo: 'POST', ruta: '/api/v1/reportes', rol: 'ADMIN', descripcion: 'Generar reporte de un periodo (T5)' },
  { metodo: 'GET', ruta: '/api/v1/reportes/:id', rol: 'ADMIN', descripcion: 'Consultar / exportar CSV' },
] as const;
