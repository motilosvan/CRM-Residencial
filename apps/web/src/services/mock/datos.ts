import type {
  AsignacionSolicitud,
  CatalogosDominio,
  CategoriaSolicitud,
  DetalleCorreoBuzon,
  DetalleSolicitud,
  EstadoGateway,
  EstadoSolicitud,
  EventoHistorialSolicitud,
  PrioridadSolicitud,
  ResidenteConjunto,
  ResumenConjunto,
  UsuarioConjunto,
} from '../contratos';
import { PALETA_PARQUES } from '@/tema/paletas';
import type { Conjunto, Usuario } from '@/types/conjunto';

export const CODIGO_DEMO = '123456';

export const CONJUNTOS_DEMO: Conjunto[] = [
  { id: 'cj-parques', slug: 'parque-central-occidente', nombre: 'Parque Central de Occidente', paleta: PALETA_PARQUES },
  { id: 'cj-nogal', slug: 'altos-del-nogal', nombre: 'Altos del Nogal' },
  {
    id: 'cj-miradores',
    slug: 'miradores-del-rio',
    nombre: 'Miradores del Río',
    paleta: { primario: '#1F4E79', acento: '#C8742B', secundario: '#5584B5' },
  },
];

export interface UsuarioDemo extends Usuario {
  conjuntoIds: string[];
}

export const USUARIOS_DEMO: UsuarioDemo[] = [
  {
    id: 'us-admin',
    nombre: 'Administración Demo',
    correo: 'admin@demo.mailflow.test',
    rol: 'ADMIN',
    conjuntoIds: ['cj-parques', 'cj-nogal'],
  },
  {
    id: 'us-soporte',
    nombre: 'Soporte Demo',
    correo: 'soporte@demo.mailflow.test',
    rol: 'SOPORTE',
    conjuntoIds: ['cj-parques'],
  },
];

export const RESUMEN_DEMO: ResumenConjunto = {
  porEstado: [
    { estado: 'NUEVA', n: 3 },
    { estado: 'ASIGNADA', n: 2 },
    { estado: 'EN_PROCESO', n: 4 },
    { estado: 'RESUELTA', n: 8 },
    { estado: 'CERRADA', n: 5 },
  ],
  carga: [{ idUsuario: 2, nombre: 'Soporte Demo', abiertas: 4 }],
  respuesta: [
    { categoria: 'MANTENIMIENTO', total: 6, minutosPromedio: 95, dentroSla: 5 },
    { categoria: 'FACTURACION', total: 4, minutosPromedio: 45, dentroSla: 4 },
  ],
};

export const ESTADO_GATEWAY_DEMO: EstadoGateway = {
  cuentas: [],
  totalCorreos: 22,
  ultimoCorreo: '2026-11-15T14:30:00.000Z',
  conectado: true,
  buzon: {
    correo: 'mesa.ayuda@demo.mailflow.test',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    buzon: 'INBOX',
    diasIniciales: 7,
    marcarLeido: false,
    activo: true,
    ultimaSincronizacion: '2026-11-15T15:00:00.000Z',
    ultimoError: null,
    version: 1,
  },
};

export const USUARIOS_CONJUNTO_DEMO: UsuarioConjunto[] = [
  {
    id: 1,
    nombre: 'Administración Demo',
    correo: 'admin@demo.mailflow.test',
    rol: 'ADMIN',
    activo: true,
    version: 1,
    cuentaActiva: true,
  },
  {
    id: 2,
    nombre: 'Soporte Demo',
    correo: 'soporte@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: true,
    version: 1,
    cuentaActiva: true,
  },
  {
    id: 3,
    nombre: 'Camila Torres',
    correo: 'camila@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: true,
    version: 1,
    cuentaActiva: true,
  },
  {
    id: 4,
    nombre: 'Mateo Rojas',
    correo: 'mateo@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: false,
    version: 2,
    cuentaActiva: true,
  },
  {
    id: 5,
    nombre: 'Lucía Méndez',
    correo: 'lucia@demo.mailflow.test',
    rol: 'SOPORTE',
    activo: true,
    version: 1,
    cuentaActiva: false,
  },
];

export const CUENTAS_DESHABILITADAS_DEMO: readonly string[] = [
  'lucia@demo.mailflow.test',
  'deshabilitado@demo.mailflow.test',
];

export const CORREOS_DEMO: DetalleCorreoBuzon[] = [
  {
    id: 1,
    remitente: 'elena.vargas@demo.mailflow.test',
    asunto: 'Fuga de agua en el sótano del bloque B',
    fechaRecepcion: '2026-11-16T15:10:00.000Z',
    idResidente: 101,
    residente: 'Elena Vargas',
    unidad: 'T2-401',
    idSolicitud: 22,
    codigo: 'SOL-000022',
    estado: 'NUEVA',
    categoria: 'MANTENIMIENTO',
    prioridad: 'ALTA',
    sugerenciaEstado: 'LISTA',
    sugerenciaCategoria: 'MANTENIMIENTO',
    cuerpo:
      'Buenos días, soy Elena Vargas del apartamento T2-401. Desde esta mañana hay una fuga de agua constante junto a los parqueaderos del sótano 1. Mi celular es 300 456 7890 para cualquier novedad.',
    cuerpoEnmascarado:
      'Buenos días, soy [NOMBRE_PROTEGIDO] del [UNIDAD_PROTEGIDA]. Desde esta mañana hay una fuga de agua constante junto a los parqueaderos del sótano 1. Mi celular es [TEL_PROTEGIDO] para cualquier novedad.',
    sugerencia: {
      estado: 'LISTA',
      categoria: 'MANTENIMIENTO',
      prioridad: 'ALTA',
      resumen: 'Reporte de fuga de agua constante en el sótano 1 junto a parqueaderos.',
      justificacion: 'Menciona fuga activa en zona común con posible riesgo de inundación.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-16T15:11:00.000Z',
    },
  },
  {
    id: 2,
    remitente: 'visitante.ext@demo.mailflow.test',
    asunto: 'Solicitud de información para ingreso de trasteo',
    fechaRecepcion: '2026-11-16T13:45:00.000Z',
    idResidente: null,
    residente: null,
    unidad: null,
    idSolicitud: 21,
    codigo: 'SOL-000021',
    estado: 'NUEVA',
    categoria: 'SIN_CLASIFICAR',
    prioridad: 'MEDIA',
    sugerenciaEstado: 'LISTA',
    sugerenciaCategoria: 'ADMINISTRATIVO',
    cuerpo:
      'Cordial saludo, la próxima semana nos mudamos al conjunto con placas XYZ 123 y quisiéramos conocer los horarios autorizados y requisitos de portería. Pueden responder a visitante.ext@demo.mailflow.test.',
    cuerpoEnmascarado:
      'Cordial saludo, la próxima semana nos mudamos al conjunto con placas [PLACA_PROTEGIDA] y quisiéramos conocer los horarios autorizados y requisitos de portería. Pueden responder a [CORREO_PROTEGIDO].',
    sugerencia: {
      estado: 'LISTA',
      categoria: 'ADMINISTRATIVO',
      prioridad: 'BAJA',
      resumen: 'Consulta sobre horarios y requisitos de portería para mudanza.',
      justificacion: 'Trámite administrativo de mudanza sin urgencia inmediata.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-16T13:46:00.000Z',
    },
  },
  {
    id: 3,
    remitente: 'jorge.salazar@demo.mailflow.test',
    asunto: 'Revisión de factura de administración de noviembre',
    fechaRecepcion: '2026-11-16T11:20:00.000Z',
    idResidente: 102,
    residente: 'Jorge Salazar',
    unidad: 'T1-204',
    idSolicitud: 20,
    codigo: 'SOL-000020',
    estado: 'ASIGNADA',
    categoria: 'FACTURACION',
    prioridad: 'MEDIA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo:
      'Hola, realicé el pago de la cuota de administración del apartamento T1-204 el día 5 de noviembre y en el último estado de cuenta aparece un saldo pendiente. Adjunto el soporte del movimiento.',
    cuerpoEnmascarado:
      'Hola, realicé el pago de la cuota de administración del [UNIDAD_PROTEGIDA] el día 5 de noviembre y en el último estado de cuenta aparece un saldo pendiente. Adjunto el soporte del movimiento.',
    sugerencia: null,
  },
  {
    id: 4,
    remitente: 'diana.osorio@demo.mailflow.test',
    asunto: 'Portón peatonal norte queda abierto en las noches',
    fechaRecepcion: '2026-11-15T22:05:00.000Z',
    idResidente: 103,
    residente: 'Diana Osorio',
    unidad: 'T3-102',
    idSolicitud: 19,
    codigo: 'SOL-000019',
    estado: 'EN_PROCESO',
    categoria: 'SEGURIDAD',
    prioridad: 'ALTA',
    sugerenciaEstado: 'LISTA',
    sugerenciaCategoria: 'SEGURIDAD',
    cuerpo:
      'Buenas noches, el electroimán del portón peatonal norte no está cerrando bien y cualquier persona puede entrar sin tarjeta. Por favor revisar urgente.',
    cuerpoEnmascarado:
      'Buenas noches, el electroimán del portón peatonal norte no está cerrando bien y cualquier persona puede entrar sin tarjeta. Por favor revisar urgente.',
    sugerencia: {
      estado: 'LISTA',
      categoria: 'SEGURIDAD',
      prioridad: 'ALTA',
      resumen: 'Falla en electroimán del portón peatonal norte permite acceso sin tarjeta.',
      justificacion: 'Afecta directamente el control de acceso perimetral.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-15T22:06:00.000Z',
    },
  },
  {
    id: 5,
    remitente: 'carlos.mora@demo.mailflow.test',
    asunto: 'Reserva de salón social para reunión familiar',
    fechaRecepcion: '2026-11-15T16:30:00.000Z',
    idResidente: 104,
    residente: 'Carlos Mora',
    unidad: 'T1-505',
    idSolicitud: 18,
    codigo: 'SOL-000018',
    estado: 'RESUELTA',
    categoria: 'ADMINISTRATIVO',
    prioridad: 'BAJA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo:
      'Buenas tardes, solicito disponibilidad del salón social para el sábado 28 de noviembre en la tarde. Soy Carlos Mora de T1-505, teléfono 3112223344.',
    cuerpoEnmascarado:
      'Buenas tardes, solicito disponibilidad del salón social para el sábado 28 de noviembre en la tarde. Soy [NOMBRE_PROTEGIDO] de [UNIDAD_PROTEGIDA], teléfono [TEL_PROTEGIDO].',
    sugerencia: null,
  },
  {
    id: 6,
    remitente: 'paula.rios@demo.mailflow.test',
    asunto: 'Luminaria fundida en pasillo piso 3 torre 2',
    fechaRecepcion: '2026-11-15T09:15:00.000Z',
    idResidente: 105,
    residente: 'Paula Ríos',
    unidad: 'T2-303',
    idSolicitud: 17,
    codigo: 'SOL-000017',
    estado: 'EN_PROCESO',
    categoria: 'MANTENIMIENTO',
    prioridad: 'BAJA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo:
      'Buen día, la lámpara frente al ascensor del piso 3 en torre 2 lleva dos días apagada. Agradezco su ayuda con el cambio de bombillo.',
    cuerpoEnmascarado:
      'Buen día, la lámpara frente al ascensor del piso 3 en torre 2 lleva dos días apagada. Agradezco su ayuda con el cambio de bombillo.',
    sugerencia: null,
  },
  {
    id: 7,
    remitente: 'nuevo.vecino@demo.mailflow.test',
    asunto: 'Autorización de ingreso técnico de internet',
    fechaRecepcion: '2026-11-14T18:40:00.000Z',
    idResidente: null,
    residente: null,
    unidad: null,
    idSolicitud: 16,
    codigo: 'SOL-000016',
    estado: 'ASIGNADA',
    categoria: 'SEGURIDAD',
    prioridad: 'MEDIA',
    sugerenciaEstado: 'EN_REINTENTO',
    sugerenciaCategoria: null,
    cuerpo:
      'Buenas tardes, autorizo el ingreso del técnico de fibra óptica mañana entre 9:00 y 11:00 a. m. con documento 1.023.456.789.',
    cuerpoEnmascarado:
      'Buenas tardes, autorizo el ingreso del técnico de fibra óptica mañana entre 9:00 y 11:00 a. m. con documento [DOC_PROTEGIDO].',
    sugerencia: {
      estado: 'EN_REINTENTO',
      categoria: null,
      prioridad: null,
      resumen: null,
      justificacion: null,
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-14T18:41:00.000Z',
    },
  },
  {
    id: 8,
    remitente: 'andres.leon@demo.mailflow.test',
    asunto: 'Certificado de paz y salvo para venta',
    fechaRecepcion: '2026-11-14T14:10:00.000Z',
    idResidente: 106,
    residente: 'Andrés León',
    unidad: 'T3-601',
    idSolicitud: 15,
    codigo: 'SOL-000015',
    estado: 'CERRADA',
    categoria: 'FACTURACION',
    prioridad: 'MEDIA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo:
      'Estimados, necesito el certificado de paz y salvo de administración del apartamento T3-601 al corte de octubre. Muchas gracias.',
    cuerpoEnmascarado:
      'Estimados, necesito el certificado de paz y salvo de administración del [UNIDAD_PROTEGIDA] al corte de octubre. Muchas gracias.',
    sugerencia: null,
  },
  {
    id: 9,
    remitente: 'marcela.vega@demo.mailflow.test',
    asunto: 'Ruido excesivo después de medianoche en torre 1',
    fechaRecepcion: '2026-11-13T08:50:00.000Z',
    idResidente: 107,
    residente: 'Marcela Vega',
    unidad: 'T1-301',
    idSolicitud: 14,
    codigo: 'SOL-000014',
    estado: 'RESUELTA',
    categoria: 'SEGURIDAD',
    prioridad: 'MEDIA',
    sugerenciaEstado: 'LISTA',
    sugerenciaCategoria: 'SEGURIDAD',
    cuerpo:
      'Buen día, reporto ruido fuerte anoche en el cuarto piso de torre 1 que dificultó el descanso. Agradezco el seguimiento con portería.',
    cuerpoEnmascarado:
      'Buen día, reporto ruido fuerte anoche en el cuarto piso de torre 1 que dificultó el descanso. Agradezco el seguimiento con portería.',
    sugerencia: {
      estado: 'LISTA',
      categoria: 'SEGURIDAD',
      prioridad: 'MEDIA',
      resumen: 'Queja de convivencia por ruido nocturno en torre 1.',
      justificacion: 'Incidente de convivencia atendible por vigilancia y administración.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-13T08:52:00.000Z',
    },
  },
  {
    id: 10,
    remitente: 'fernando.gil@demo.mailflow.test',
    asunto: 'Humedad en techo del cuarto de basuras',
    fechaRecepcion: '2026-11-12T17:25:00.000Z',
    idResidente: 108,
    residente: 'Fernando Gil',
    unidad: 'T2-102',
    idSolicitud: 13,
    codigo: 'SOL-000013',
    estado: 'CERRADA',
    categoria: 'MANTENIMIENTO',
    prioridad: 'MEDIA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo:
      'Hola administración, noté una mancha de humedad en el techo del cuarto de basuras de la torre 2. Conviene revisarla antes de que empeore.',
    cuerpoEnmascarado:
      'Hola administración, noté una mancha de humedad en el techo del cuarto de basuras de la torre 2. Conviene revisarla antes de que empeore.',
    sugerencia: null,
  },
  {
    id: 11,
    remitente: 'gloria.diaz@demo.mailflow.test',
    asunto: 'Actualización de placa vehicular para tag de acceso',
    fechaRecepcion: '2026-11-11T10:05:00.000Z',
    idResidente: 109,
    residente: 'Gloria Díaz',
    unidad: 'T3-205',
    idSolicitud: 12,
    codigo: 'SOL-000012',
    estado: 'CERRADA',
    categoria: 'ADMINISTRATIVO',
    prioridad: 'BAJA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo:
      'Buenos días, cambié de vehículo y solicito actualizar el registro del parqueadero con placa ABC-987 para el tag de T3-205.',
    cuerpoEnmascarado:
      'Buenos días, cambié de vehículo y solicito actualizar el registro del parqueadero con placa [PLACA_PROTEGIDA] para el tag de [UNIDAD_PROTEGIDA].',
    sugerencia: null,
  },
  {
    id: 12,
    remitente: 'ricardo.pardo@demo.mailflow.test',
    asunto: 'Consulta general sobre reglamento de mascotas',
    fechaRecepcion: '2026-11-10T15:00:00.000Z',
    idResidente: 110,
    residente: 'Ricardo Pardo',
    unidad: 'T1-108',
    idSolicitud: 11,
    codigo: 'SOL-000011',
    estado: 'RESUELTA',
    categoria: 'SIN_CLASIFICAR',
    prioridad: 'BAJA',
    sugerenciaEstado: null,
    sugerenciaCategoria: null,
    cuerpo:
      'Cordial saludo, me podrían compartir por favor el apartado vigente del manual de convivencia sobre tránsito de mascotas en zonas comunes.',
    cuerpoEnmascarado:
      'Cordial saludo, me podrían compartir por favor el apartado vigente del manual de convivencia sobre tránsito de mascotas en zonas comunes.',
    sugerencia: null,
  },
];

const SLA_POR_PRIORIDAD: Record<PrioridadSolicitud, number> = { ALTA: 4, MEDIA: 24, BAJA: 72 };

const DESTINOS_POR_ESTADO: Record<EstadoSolicitud, EstadoSolicitud[]> = {
  NUEVA: [],
  ASIGNADA: ['EN_PROCESO', 'NUEVA'],
  EN_PROCESO: ['RESUELTA'],
  RESUELTA: ['CERRADA', 'EN_PROCESO'],
  CERRADA: [],
};

function sumarMinutos(iso: string, minutos: number): string {
  return new Date(new Date(iso).getTime() + minutos * 60_000).toISOString();
}

function historialBase(
  fechaCreacion: string,
  estado: EstadoSolicitud,
  responsable: string | null,
): { historial: EventoHistorialSolicitud[]; asignaciones: AsignacionSolicitud[]; primeraRespuesta: string | null; fechaCierre: string | null } {
  const historial: EventoHistorialSolicitud[] = [
    {
      anterior: null,
      nuevo: 'NUEVA',
      usuario: null,
      comentario: 'Creada automáticamente desde correo',
      fecha: fechaCreacion,
    },
  ];
  const asignaciones: AsignacionSolicitud[] = [];
  let primeraRespuesta: string | null = null;
  let fechaCierre: string | null = null;

  if (estado === 'NUEVA') {
    return { historial, asignaciones, primeraRespuesta, fechaCierre };
  }

  const fAsig = sumarMinutos(fechaCreacion, 25);
  const nombreAsig = responsable ?? 'Soporte Demo';
  asignaciones.push({ nombre: nombreAsig, fechaAsignacion: fAsig, liberadaEn: null });
  historial.push({
    anterior: 'NUEVA',
    nuevo: 'ASIGNADA',
    usuario: 'Administración Demo',
    comentario: `Asignada a ${nombreAsig}`,
    fecha: fAsig,
  });

  if (estado === 'ASIGNADA') {
    return { historial, asignaciones, primeraRespuesta, fechaCierre };
  }

  const fProc = sumarMinutos(fechaCreacion, 60);
  primeraRespuesta = fProc;
  historial.push({
    anterior: 'ASIGNADA',
    nuevo: 'EN_PROCESO',
    usuario: nombreAsig,
    comentario: 'En atención por el equipo del conjunto',
    fecha: fProc,
  });

  if (estado === 'EN_PROCESO') {
    return { historial, asignaciones, primeraRespuesta, fechaCierre };
  }

  const fRes = sumarMinutos(fechaCreacion, 180);
  historial.push({
    anterior: 'EN_PROCESO',
    nuevo: 'RESUELTA',
    usuario: nombreAsig,
    comentario: 'Gestión completada y notificada al residente',
    fecha: fRes,
  });

  if (estado === 'RESUELTA') {
    return { historial, asignaciones, primeraRespuesta, fechaCierre };
  }

  const fCierre = sumarMinutos(fechaCreacion, 360);
  fechaCierre = fCierre;
  asignaciones[0].liberadaEn = fCierre;
  historial.push({
    anterior: 'RESUELTA',
    nuevo: 'CERRADA',
    usuario: 'Administración Demo',
    comentario: 'Caso cerrado tras confirmación',
    fecha: fCierre,
  });
  return { historial, asignaciones, primeraRespuesta, fechaCierre };
}

const RESPONSABLE_CORREO_DEMO: Record<number, { id: number; nombre: string } | null> = {
  22: null,
  21: null,
  20: { id: 2, nombre: 'Soporte Demo' },
  19: { id: 2, nombre: 'Soporte Demo' },
  18: { id: 2, nombre: 'Soporte Demo' },
  17: { id: 3, nombre: 'Camila Torres' },
  16: { id: 3, nombre: 'Camila Torres' },
  15: null,
  14: { id: 3, nombre: 'Camila Torres' },
  13: null,
  12: null,
  11: { id: 2, nombre: 'Soporte Demo' },
};

function solicitudDesdeCorreo(c: DetalleCorreoBuzon): DetalleSolicitud {
  const id = c.idSolicitud!;
  const estado = (c.estado ?? 'NUEVA') as EstadoSolicitud;
  const categoria = (c.categoria ?? 'SIN_CLASIFICAR') as CategoriaSolicitud;
  const prioridad = (c.prioridad ?? 'MEDIA') as PrioridadSolicitud;
  const resp = RESPONSABLE_CORREO_DEMO[id] ?? null;
  const nombreParaHistorial = resp?.nombre ?? (estado === 'CERRADA' ? 'Soporte Demo' : null);
  const meta = historialBase(c.fechaRecepcion, estado, nombreParaHistorial);
  return {
    id,
    codigo: c.codigo!,
    asunto: c.asunto,
    remitente: c.remitente,
    estado,
    categoria,
    prioridad,
    slaHoras: SLA_POR_PRIORIDAD[prioridad],
    version: estado === 'NUEVA' ? 1 : estado === 'ASIGNADA' ? 2 : estado === 'EN_PROCESO' ? 3 : 4,
    fechaCreacion: c.fechaRecepcion,
    primeraRespuesta: meta.primeraRespuesta,
    fechaCierre: meta.fechaCierre,
    responsable: resp?.nombre ?? null,
    idResponsable: resp?.id ?? null,
    cuerpo: c.cuerpo,
    messageId: `<correo-${c.id}@demo.mailflow.test>`,
    historial: meta.historial,
    asignaciones: meta.asignaciones,
    destinos: DESTINOS_POR_ESTADO[estado],
    sugerencia: c.sugerencia,
  };
}

function solicitudAdicional(p: {
  id: number;
  asunto: string;
  remitente: string;
  estado: EstadoSolicitud;
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  fechaCreacion: string;
  cuerpo: string;
  resp: { id: number; nombre: string } | null;
  sugerencia?: DetalleSolicitud['sugerencia'];
}): DetalleSolicitud {
  const codigo = `SOL-${String(p.id).padStart(6, '0')}`;
  const nombreParaHistorial = p.resp?.nombre ?? (p.estado === 'CERRADA' ? 'Soporte Demo' : null);
  const meta = historialBase(p.fechaCreacion, p.estado, nombreParaHistorial);
  return {
    id: p.id,
    codigo,
    asunto: p.asunto,
    remitente: p.remitente,
    estado: p.estado,
    categoria: p.categoria,
    prioridad: p.prioridad,
    slaHoras: SLA_POR_PRIORIDAD[p.prioridad],
    version: p.estado === 'NUEVA' ? 1 : p.estado === 'ASIGNADA' ? 2 : p.estado === 'EN_PROCESO' ? 3 : 4,
    fechaCreacion: p.fechaCreacion,
    primeraRespuesta: meta.primeraRespuesta,
    fechaCierre: meta.fechaCierre,
    responsable: p.resp?.nombre ?? null,
    idResponsable: p.resp?.id ?? null,
    cuerpo: p.cuerpo,
    messageId: `<sol-${p.id}@demo.mailflow.test>`,
    historial: meta.historial,
    asignaciones: meta.asignaciones,
    destinos: DESTINOS_POR_ESTADO[p.estado],
    sugerencia: p.sugerencia ?? null,
  };
}

export const SOLICITUDES_DEMO: DetalleSolicitud[] = [
  ...CORREOS_DEMO.filter((c) => c.idSolicitud !== null).map(solicitudDesdeCorreo),
  solicitudAdicional({
    id: 10,
    asunto: 'Solicitud de copia de manual de parqueaderos',
    remitente: 'laura.gomez@demo.mailflow.test',
    estado: 'NUEVA',
    categoria: 'SIN_CLASIFICAR',
    prioridad: 'MEDIA',
    fechaCreacion: '2026-11-10T10:00:00.000Z',
    cuerpo: 'Buen día, me gustaría recibir copia del reglamento actualizado de parqueaderos de visitantes.',
    resp: null,
    sugerencia: {
      estado: 'LISTA',
      categoria: 'ADMINISTRATIVO',
      prioridad: 'BAJA',
      resumen: 'Solicitud de copia del reglamento de parqueaderos.',
      justificacion: 'Consulta documental de convivencia y administración.',
      proveedor: 'openrouter',
      modelo: 'gpt-4o-mini',
      fechaActualizacion: '2026-11-10T10:02:00.000Z',
    },
  }),
  solicitudAdicional({
    id: 9,
    asunto: 'Mantenimiento preventivo puerta vehicular torre 1',
    remitente: 'oscar.marin@demo.mailflow.test',
    estado: 'EN_PROCESO',
    categoria: 'MANTENIMIENTO',
    prioridad: 'MEDIA',
    fechaCreacion: '2026-11-09T14:30:00.000Z',
    cuerpo: 'La puerta vehicular hace un sonido fuerte al abrir y cerrar desde ayer.',
    resp: { id: 2, nombre: 'Soporte Demo' },
  }),
  solicitudAdicional({
    id: 8,
    asunto: 'Aclaración cobro de intereses de mora',
    remitente: 'natalia.cruz@demo.mailflow.test',
    estado: 'EN_PROCESO',
    categoria: 'FACTURACION',
    prioridad: 'MEDIA',
    fechaCreacion: '2026-11-08T11:15:00.000Z',
    cuerpo: 'Solicito revisión del cobro de mora reflejado en el recibo del mes pasado.',
    resp: { id: 2, nombre: 'Soporte Demo' },
  }),
  solicitudAdicional({
    id: 7,
    asunto: 'Pintura de señalización en zona de visitantes',
    remitente: 'sergio.silva@demo.mailflow.test',
    estado: 'RESUELTA',
    categoria: 'MANTENIMIENTO',
    prioridad: 'BAJA',
    fechaCreacion: '2026-11-07T09:00:00.000Z',
    cuerpo: 'La demarcación de dos cupos de visitantes está muy desgastada.',
    resp: { id: 2, nombre: 'Soporte Demo' },
  }),
  solicitudAdicional({
    id: 6,
    asunto: 'Permiso para adecuación menor en cocina',
    remitente: 'claudia.parra@demo.mailflow.test',
    estado: 'RESUELTA',
    categoria: 'ADMINISTRATIVO',
    prioridad: 'BAJA',
    fechaCreacion: '2026-11-06T16:40:00.000Z',
    cuerpo: 'Solicito autorización de horario para cambio de mesón en apartamento T2-203.',
    resp: { id: 3, nombre: 'Camila Torres' },
  }),
  solicitudAdicional({
    id: 5,
    asunto: 'Envío de estado de cuenta acumulado 2026',
    remitente: 'hector.arias@demo.mailflow.test',
    estado: 'RESUELTA',
    categoria: 'FACTURACION',
    prioridad: 'MEDIA',
    fechaCreacion: '2026-11-05T13:20:00.000Z',
    cuerpo: 'Agradezco el envío del histórico de pagos del año en curso.',
    resp: { id: 2, nombre: 'Soporte Demo' },
  }),
  solicitudAdicional({
    id: 4,
    asunto: 'Revisión de motobomba de presión torre 3',
    remitente: 'monica.reyes@demo.mailflow.test',
    estado: 'RESUELTA',
    categoria: 'MANTENIMIENTO',
    prioridad: 'ALTA',
    fechaCreacion: '2026-11-04T08:10:00.000Z',
    cuerpo: 'Se presentó baja presión de agua en los pisos altos de torre 3.',
    resp: { id: 3, nombre: 'Camila Torres' },
  }),
  solicitudAdicional({
    id: 3,
    asunto: 'Registro de nueva mascota en censo del conjunto',
    remitente: 'david.luna@demo.mailflow.test',
    estado: 'RESUELTA',
    categoria: 'ADMINISTRATIVO',
    prioridad: 'BAJA',
    fechaCreacion: '2026-11-03T12:00:00.000Z',
    cuerpo: 'Adjunto carné de vacunación para actualizar el registro de mascotas.',
    resp: { id: 2, nombre: 'Soporte Demo' },
  }),
  solicitudAdicional({
    id: 2,
    asunto: 'Revisión de cámara de acceso peatonal sur',
    remitente: 'beatriz.navas@demo.mailflow.test',
    estado: 'CERRADA',
    categoria: 'SEGURIDAD',
    prioridad: 'ALTA',
    fechaCreacion: '2026-11-02T19:30:00.000Z',
    cuerpo: 'La cámara del acceso sur estuvo intermitente durante la noche.',
    resp: null,
  }),
  solicitudAdicional({
    id: 1,
    asunto: 'Cambio de bombillo en escalera de emergencia',
    remitente: 'ivan.castro@demo.mailflow.test',
    estado: 'CERRADA',
    categoria: 'MANTENIMIENTO',
    prioridad: 'BAJA',
    fechaCreacion: '2026-11-01T10:15:00.000Z',
    cuerpo: 'En el descanso del segundo piso falta iluminación en la escalera.',
    resp: null,
  }),
];

export const RESIDENTES_DEMO: ResidenteConjunto[] = [
  {
    id: 101,
    nombre: 'Elena Vargas',
    unidad: 'T2-401',
    correo: 'elena.vargas@demo.mailflow.test',
    telefono: '3004567890',
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 102,
    nombre: 'Jorge Salazar',
    unidad: 'T1-204',
    correo: 'jorge.salazar@demo.mailflow.test',
    telefono: '3101112233',
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 103,
    nombre: 'Diana Osorio',
    unidad: 'T3-102',
    correo: 'diana.osorio@demo.mailflow.test',
    telefono: null,
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 104,
    nombre: 'Carlos Mora',
    unidad: 'T1-505',
    correo: 'carlos.mora@demo.mailflow.test',
    telefono: '3112223344',
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 105,
    nombre: 'Paula Ríos',
    unidad: 'T2-303',
    correo: 'paula.rios@demo.mailflow.test',
    telefono: null,
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 106,
    nombre: 'Andrés León',
    unidad: 'T3-601',
    correo: 'andres.leon@demo.mailflow.test',
    telefono: '3145556677',
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 107,
    nombre: 'Marcela Vega',
    unidad: 'T1-301',
    correo: 'marcela.vega@demo.mailflow.test',
    telefono: null,
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 108,
    nombre: 'Fernando Gil',
    unidad: 'T2-102',
    correo: 'fernando.gil@demo.mailflow.test',
    telefono: '3189990011',
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 109,
    nombre: 'Gloria Díaz',
    unidad: 'T3-205',
    correo: 'gloria.diaz@demo.mailflow.test',
    telefono: null,
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 110,
    nombre: 'Ricardo Pardo',
    unidad: 'T1-108',
    correo: 'ricardo.pardo@demo.mailflow.test',
    telefono: '3207778899',
    activo: true,
    version: 1,
    totalSolicitudes: 1,
  },
  {
    id: 111,
    nombre: 'Marta Quintero',
    unidad: 'T1-304',
    correo: 'marta.quintero@demo.mailflow.test',
    telefono: '3159876543',
    activo: false,
    version: 2,
    totalSolicitudes: 0,
  },
  {
    id: 112,
    nombre: 'Luis Benítez',
    unidad: 'T2-105',
    correo: null,
    telefono: '3124567890',
    activo: true,
    version: 1,
    totalSolicitudes: 0,
  },
];

export const CATALOGOS_DEMO: CatalogosDominio = {
  categorias: [
    {
      id: 1,
      nombre: 'SEGURIDAD',
      prioridadBase: 'ALTA',
      palabrasClave: [
        'robo',
        'robaron',
        'hurto',
        'ladron',
        'intruso',
        'sospechos',
        'alarma',
        'camaras?',
        'vigilan',
        'porteri',
        'portero',
        'forzaron',
        'violentaron',
        'agresi',
        'pelea',
        'arma',
        'disparo',
        'amenaza',
        'incendio',
        'humo',
        'emergencia',
        'acceso no autorizado',
        'seguridad',
      ],
    },
    {
      id: 2,
      nombre: 'MANTENIMIENTO',
      prioridadBase: 'MEDIA',
      palabrasClave: [
        'fuga',
        'gotera',
        'humedad',
        'filtracion',
        'inundacion',
        'tuberia',
        'ascensor',
        'elevador',
        'bombillo',
        'luz',
        'luces',
        'iluminacion',
        'lampara',
        'dano',
        'danado',
        'reparacion',
        'arreglo',
        'averia',
        'porton',
        'citofono',
        'cerradura',
        'pintura',
        'jardin',
        'piscina',
        'bomba',
        'tanque',
        'plaga',
        'fumigacion',
        'cortocircuito',
        'desague',
        'destapar',
        'grieta',
        'mantenimiento',
        'roto',
        'rota',
        'quemad',
        'gas',
      ],
    },
    {
      id: 3,
      nombre: 'FACTURACION',
      prioridadBase: 'BAJA',
      palabrasClave: [
        'cuota',
        'factura',
        'pago',
        'pague',
        'pagar',
        'recibo',
        'cobro',
        'cobrar',
        'mora',
        'saldo',
        'deuda',
        'paz y salvo',
        'extracto',
        'estado de cuenta',
        'tarifa',
        'valor',
        'facturacion',
      ],
    },
    {
      id: 4,
      nombre: 'ADMINISTRATIVO',
      prioridadBase: 'BAJA',
      palabrasClave: [
        'asamblea',
        'certificad',
        'certificacion',
        'permiso',
        'reglamento',
        'convivencia',
        'queja',
        'ruido',
        'mascota',
        'parqueadero',
        'autorizacion',
        'autorizar',
        'mudanza',
        'trastee?o',
        'reserva',
        'salon comunal',
        'zona social',
        'acta',
        'circular',
        'consejo',
        'propiedad horizontal',
        'visitante',
      ],
    },
    {
      id: 5,
      nombre: 'SIN_CLASIFICAR',
      prioridadBase: 'MEDIA',
      palabrasClave: [],
    },
  ],
  prioridades: [
    { id: 1, nombre: 'ALTA', peso: 3, slaHoras: 4 },
    { id: 2, nombre: 'MEDIA', peso: 2, slaHoras: 24 },
    { id: 3, nombre: 'BAJA', peso: 1, slaHoras: 72 },
  ],
  palabrasClaveUrgencia: [
    'urgente',
    'urgencia',
    'emergencia',
    'incendio',
    'inundacion',
    'fuga de gas',
    'olor a gas',
    'escape de gas',
    'cortocircuito',
    'robo',
    'robaron',
    'agresi',
    'amenaza',
    'atrapad',
    'ascensor (atascado|detenido|trabado)',
    'sin agua',
    'sin luz',
    'heri',
    'disparo',
  ],
  estados: [
    { id: 1, nombre: 'NUEVA', esFinal: false },
    { id: 2, nombre: 'ASIGNADA', esFinal: false },
    { id: 3, nombre: 'EN_PROCESO', esFinal: false },
    { id: 4, nombre: 'RESUELTA', esFinal: false },
    { id: 5, nombre: 'CERRADA', esFinal: true },
  ],
  transiciones: [
    { origen: 'NUEVA', destino: 'ASIGNADA' },
    { origen: 'ASIGNADA', destino: 'EN_PROCESO' },
    { origen: 'EN_PROCESO', destino: 'RESUELTA' },
    { origen: 'RESUELTA', destino: 'CERRADA' },
    { origen: 'RESUELTA', destino: 'EN_PROCESO' },
    { origen: 'ASIGNADA', destino: 'NUEVA' },
  ],
};
