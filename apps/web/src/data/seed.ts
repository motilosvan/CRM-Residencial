import {
  PublicacionInstitucional,
  Residente,
  Solicitud,
  UsuarioSistema,
  CategoriaSolicitud,
  PrioridadSolicitud,
  EstadoSolicitud,
} from '../types/domain';
import { maskPII } from '../lib/piiMasker';

export const USUARIOS_SEED: UsuarioSistema[] = [
  {
    id: 'usr-admin-1',
    nombre: 'Dra. Claudia Patricia Morales',
    correo: 'administracion@parquesoccidente.demo',
    cargo: 'Administradora General PH',
    rol: 'Administrador',
    activo: true,
    avatar: 'CM',
    ultimaSesion: '2025-05-14T08:15:00',
  },
  {
    id: 'usr-sop-1',
    nombre: 'Ing. Jhon Jairo Bermúdez',
    correo: 'mantenimiento@parquesoccidente.demo',
    cargo: 'Jefe de Mantenimiento Locativo',
    rol: 'Soporte',
    activo: true,
    avatar: 'JB',
    ultimaSesion: '2025-05-14T07:50:00',
  },
  {
    id: 'usr-sop-2',
    nombre: 'Paola Andrea Castellanos',
    correo: 'asistente@parquesoccidente.demo',
    cargo: 'Auxiliar de Soporte Administrativo',
    rol: 'Soporte',
    activo: true,
    avatar: 'PC',
    ultimaSesion: '2025-05-14T08:05:00',
  },
  {
    id: 'usr-sop-3',
    nombre: 'Camilo Andrés Rincón',
    correo: 'atencion@parquesoccidente.demo',
    cargo: 'Auxiliar de Soporte al Residente',
    rol: 'Soporte',
    activo: true,
    avatar: 'CR',
    ultimaSesion: '2025-05-13T17:40:00',
  },
  {
    id: 'usr-sop-4',
    nombre: 'Sargento (r) Edgar Lozano',
    correo: 'seguridad@parquesoccidente.demo',
    cargo: 'Jefe de Seguridad y Monitoreo',
    rol: 'Soporte',
    activo: true,
    avatar: 'EL',
    ultimaSesion: '2025-05-14T06:00:00',
  },
  {
    id: 'usr-sop-5',
    nombre: 'Hernán Darío Gómez',
    correo: 'contabilidad@parquesoccidente.demo',
    cargo: 'Contador Público PH',
    rol: 'Soporte',
    activo: true,
    avatar: 'HG',
    ultimaSesion: '2025-05-12T16:20:00',
  },
];

const NOMBRES_COLOMBIANOS = [
  'Alejandro Vargas', 'María Fernanda Rojas', 'Carlos Eduardo Peña', 'Diana Marcela Ortiz',
  'Juan Sebastián Gómez', 'Laura Valentina Castro', 'Andrés Felipe Mora', 'Natalia Andrea Silva',
  'Jorge Eliécer Duarte', 'Sandra Milena Pineda', 'Óscar Iván Trujillo', 'Luz Marina Cárdenas',
  'Germán Darío Alarcón', 'Adriana Lucía Mendoza', 'Diego Fernando Acosta', 'Paola Ximena León',
  'Ricardo José Forero', 'Mónica Patricia Guerrero', 'Mauricio Alejandro Niño', 'Gloria Inés Salamanca',
  'Daniel Esteban Prieto', 'Ángela María Barrera', 'Héctor Julio Zambrano', 'Martha Cecilia Quintero',
  'Santiago Nicolás Bello', 'Juliana Andrea Lozano', 'Fernando José Galindo', 'Viviana Carolina Díaz',
  'César Augusto Fajardo', 'Liliana Marcela Pardo', 'Rodrigo Alberto Reyes', 'Clara Inés Téllez',
  'Gustavo Adolfo Navarrete', 'Beatriz Elena Valbuena', 'Nicolás David Buitrago', 'Tatiana Andrea Ospina',
  'Álvaro Javier Corredor', 'Yolanda Patricia Suárez', 'Cristian Camilo Rico', 'Olga Lucía Pedraza',
];

export const RESIDENTES_SEED: Residente[] = NOMBRES_COLOMBIANOS.map((nombre, index) => {
  const torreNum = (index % 8) + 1;
  const piso = Math.floor(index / 8) + 1;
  const aptoNum = `${piso}0${(index % 4) + 1}`;
  const slug = nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.');

  return {
    id: `res-${index + 1}`,
    nombre,
    torre: `Torre ${torreNum}`,
    apartamento: aptoNum,
    correo: `${slug}@example.com`,
    telefono: `31${index % 9} ${240 + index} ${1100 + index * 7}`,
    activo: index !== 14 && index !== 29 && index !== 37,
    fechaRegistro: '2023-02-10',
  };
});

interface PlantillaCaso {
  asunto: string;
  cuerpo: string;
  categoria: CategoriaSolicitud;
  prioridad: PrioridadSolicitud;
  confianza: number;
  resumen: string;
  justificacion: string;
  responsableDefault: string;
}

const PLANTILLAS_CASOS: PlantillaCaso[] = [
  {
    asunto: 'URGENTE: Fuga de agua fuerte en parqueadero sótano 1 frente a Torre 3',
    cuerpo: 'Buenos días administración, por favor ayuda urgente, se rompió un tubo madre en el sótano 1 cerca al parqueadero 44 y está saliendo muchísima agua con riesgo de inundación. Mi celular es 310 445 9821 y mi CC 79.451.882.',
    categoria: 'Mantenimiento',
    prioridad: 'Alta',
    confianza: 0.96,
    resumen: 'Ruptura de tubería con fuga severa y riesgo de inundación en sótano 1 (parqueadero 44).',
    justificacion: 'Términos críticos de infraestructura ("fuga", "inundación", "tubo madre") que afectan bienes comunes de inmediato.',
    responsableDefault: 'usr-sop-1',
  },
  {
    asunto: 'EMERGENCIA ascensor detenido con adulto mayor atrapado en Torre 5',
    cuerpo: 'Por favor envíen al técnico ya mismo!! El ascensor par de la Torre 5 se quedó bloqueado entre el piso 4 y 5 con mi papá adentro. Me pueden llamar al 315 889 2210.',
    categoria: 'Seguridad',
    prioridad: 'Alta',
    confianza: 0.98,
    resumen: 'Ascensor bloqueado entre pisos 4 y 5 de Torre 5 con adulto mayor atrapado en su interior.',
    justificacion: 'Riesgo vital y de seguridad física inmediata ("adulto mayor atrapado", "ascensor detenido").',
    responsableDefault: 'usr-sop-4',
  },
  {
    asunto: 'Persona sospechosa merodeando vehículos en zona visitante',
    cuerpo: 'Buenas noches, desde mi ventana de la Torre 2 veo a una persona ajena al conjunto intentando abrir las manijas de los carros en bahía de visitantes. Favor revisar cámaras de portería urgente.',
    categoria: 'Seguridad',
    prioridad: 'Alta',
    confianza: 0.91,
    resumen: 'Alerta de individuo sospechoso manipulando vehículos en parqueadero de visitantes.',
    justificacion: 'Incidente de seguridad activo en curso que requiere verificación por CCTV y ronda.',
    responsableDefault: 'usr-sop-4',
  },
  {
    asunto: 'Daño de luminaria LED en el pasillo del piso 3 Torre 1',
    cuerpo: 'Cordial saludo. Para reportar que dos lámparas del pasillo del piso 3 en la Torre 1 llevan tres días parpadeando y ayer se apagaron del todo, queda muy oscuro en la noche. Gracias.',
    categoria: 'Mantenimiento',
    prioridad: 'Media',
    confianza: 0.88,
    resumen: 'Falla de dos luminarias en pasillo común del piso 3 de la Torre 1.',
    justificacion: 'Mantenimiento eléctrico preventivo/correctivo en zona común sin peligro inminente.',
    responsableDefault: 'usr-sop-1',
  },
  {
    asunto: 'Solicitud de certificado de Paz y Salvo para trámite notarial',
    cuerpo: 'Estimada administración, solicito amablemente la expedición del paz y salvo de administración del apartamento correspondiente al mes en curso. Mi cédula es CC 52.310.904. Quedo atento al envío al correo.',
    categoria: 'Administrativo',
    prioridad: 'Baja',
    confianza: 0.94,
    resumen: 'Solicitud formal de expedición de certificado de paz y salvo para trámite notarial.',
    justificacion: 'Trámite documental ordinario de administración.',
    responsableDefault: 'usr-sop-2',
  },
  {
    asunto: 'Reclamo por cobro doble de cuota extraordinaria de fachada en factura de mayo',
    cuerpo: 'Buenas tardes contabilidad, revisando el recibo de este mes me aparece cargada dos veces la cuota extraordinaria de impermeabilización ($145.000 COP duplicado) y además no tomaron el descuento por pronto pago. Mi teléfono es 312 778 4512.',
    categoria: 'Facturación',
    prioridad: 'Media',
    confianza: 0.89,
    resumen: 'Reclamación por cobro duplicado de cuota extraordinaria e inaplicación de descuento pronto pago.',
    justificacion: 'Inconsistencia en estado de cuenta y facturación mensual.',
    responsableDefault: 'usr-sop-5',
  },
  {
    asunto: 'Queja por ruido excesivo y fiesta en la madrugada - Torre 4',
    cuerpo: 'Hola, nuevamente hasta las 3:30 AM hubo música a todo volumen y gritos en el piso superior. Llamamos a portería pero no bajaron el volumen. Solicito llamado de atención por comité de convivencia.',
    categoria: 'Administrativo',
    prioridad: 'Media',
    confianza: 0.64,
    resumen: 'Reporte de perturbación por ruido nocturno reiterado para gestión de convivencia.',
    justificacion: 'Ambigüedad entre seguridad nocturna y gestión administrativa de manual de convivencia (Confianza 0.64 < 0.70).',
    responsableDefault: 'usr-sop-3',
  },
  {
    asunto: 'Autorización de salida de mudanza para este sábado',
    cuerpo: 'Buen día, adjunto datos del camión furgón placa WXY-123 para autorizar trasteo este sábado de 9:00 am a 1:00 pm. Cédula del conductor CC 1018443210.',
    categoria: 'Administrativo',
    prioridad: 'Baja',
    confianza: 0.92,
    resumen: 'Solicitud de permiso de mudanza/trasteo para el día sábado en horario permitido.',
    justificacion: 'Trámite programado de autorización administrativa y control de portería.',
    responsableDefault: 'usr-sop-2',
  },
  {
    asunto: 'Cortes intermitentes de energía y olor a cable quemado en cuarto de bombas',
    cuerpo: 'Atención: cuando pasamos hacia el bicicletero sentimos olor a caucho quemado saliendo del cuarto eléctrico y hubo bajón de luz en las zonas comunes de las Torres 6 y 7.',
    categoria: 'Mantenimiento',
    prioridad: 'Alta',
    confianza: 0.62,
    resumen: 'Alerta de posible cortocircuito y olor a quemado en cuarto eléctrico de zonas comunes.',
    justificacion: 'Activado respaldo por reglas por detección de términos eléctricos de riesgo.',
    responsableDefault: 'usr-sop-1',
  },
  {
    asunto: 'Reserva de Salón Social para reunión familiar el 28 de este mes',
    cuerpo: 'Buenas tardes, quisiera consultar disponibilidad del salón social #1 para el sábado 28 y conocer el valor del depósito vigente. Muchas gracias.',
    categoria: 'Administrativo',
    prioridad: 'Baja',
    confianza: 0.95,
    resumen: 'Consulta de disponibilidad y requisitos para reserva de salón social.',
    justificacion: 'Solicitud informativa y de agendamiento de zonas comunes.',
    responsableDefault: 'usr-sop-3',
  },
];

const ESTADOS_CICLO: EstadoSolicitud[] = [
  'Pendiente de validación',
  'Validada',
  'Asignada',
  'En proceso',
  'Resuelta',
  'Cerrada',
];

export const SOLICITUDES_SEED: Solicitud[] = Array.from({ length: 60 }, (_, idx) => {
  const plantilla = PLANTILLAS_CASOS[idx % PLANTILLAS_CASOS.length];
  const esNoRegistrado = idx === 4 || idx === 11;
  const residente = esNoRegistrado ? null : RESIDENTES_SEED[idx % RESIDENTES_SEED.length];

  const estado: EstadoSolicitud =
    idx < 15
      ? 'Pendiente de validación'
      : ESTADOS_CICLO[1 + (idx % (ESTADOS_CICLO.length - 1))];

  const diasAtras = Math.floor((idx * 58) / 60);
  const fechaRecepcionDate = new Date(2025, 4, 14 - diasAtras, 8 + (idx % 10), (idx * 7) % 60);
  const fechaRecepcion = fechaRecepcionDate.toISOString();

  const cuerpoConFirma = `${plantilla.cuerpo}\n\n--\nAtentamente,\n${
    residente ? `${residente.nombre} - ${residente.torre} Apto ${residente.apartamento}` : 'Propietario Externo / Arrendatario Nuevo'
  }\n> El 10 de mayo administracion@parquesoccidente.demo escribió: Recuerde indicar torre y apartamento.`;

  const { maskedText } = maskPII(cuerpoConFirma);
  const usaReglas = plantilla.confianza < 0.7;

  const id = `sol-${1001 + idx}`;
  const radicado = `PCO-2025-${String(1001 + idx).padStart(4, '0')}`;

  const historial = [
    {
      id: `evt-${idx}-1`,
      solicitudId: id,
      fecha: fechaRecepcion,
      actor: 'Email Gateway (Gmail IMAP)',
      tipoAccion: 'RECEPCION' as const,
      descripcion: `Correo recibido de ${residente ? residente.correo : `externo.nuevo${idx}@correo.co`} y preprocesado con enmascarado PII.`,
    },
    {
      id: `evt-${idx}-2`,
      solicitudId: id,
      fecha: new Date(fechaRecepcionDate.getTime() + 15000).toISOString(),
      actor: usaReglas ? 'Motor de Reglas Léxicas' : 'Motor IA Gemini 1.5 Flash',
      tipoAccion: usaReglas ? ('RESPALDO_REGLAS' as const) : ('SUGERENCIA_IA' as const),
      descripcion: usaReglas
        ? `Confianza IA (${Math.round(plantilla.confianza * 100)}%) inferior al umbral (70%). Clasificado por reglas como ${plantilla.categoria} / ${plantilla.prioridad}.`
        : `Sugerencia generada con confianza del ${Math.round(plantilla.confianza * 100)}%: ${plantilla.categoria} (${plantilla.prioridad}).`,
      valorAnterior: 'Sin clasificar',
      valorNuevo: `${plantilla.categoria} | ${plantilla.prioridad}`,
    },
  ];

  if (estado !== 'Pendiente de validación') {
    historial.push({
      id: `evt-${idx}-3`,
      solicitudId: id,
      fecha: new Date(fechaRecepcionDate.getTime() + 3600000).toISOString(),
      actor: 'Dra. Claudia Patricia Morales',
      tipoAccion: 'VALIDACION',
      descripcion:
        idx % 7 === 0
          ? 'Validada con ajuste manual de prioridad por parte del Administrador.'
          : 'Sugerencia aprobada sin cambios por el Administrador.',
      valorAnterior: 'Pendiente de validación',
      valorNuevo: 'Validada',
    });
  }

  if (estado === 'Asignada' || estado === 'En proceso' || estado === 'Resuelta' || estado === 'Cerrada') {
    const resp = USUARIOS_SEED.find((u) => u.id === plantilla.responsableDefault);
    historial.push({
      id: `evt-${idx}-4`,
      solicitudId: id,
      fecha: new Date(fechaRecepcionDate.getTime() + 5400000).toISOString(),
      actor: 'Dra. Claudia Patricia Morales',
      tipoAccion: 'ASIGNACION',
      descripcion: `Solicitud asignada a ${resp?.nombre ?? 'Soporte'}.`,
      valorAnterior: 'Sin responsable',
      valorNuevo: resp?.nombre ?? 'Soporte',
    });
  }

  return {
    id,
    radicado,
    correoId: `msg-gmail-${2000 + idx}`,
    remitenteCorreo: residente ? residente.correo : `arrendatario.externo${idx}@visitante.co`,
    remitenteNombre: residente ? residente.nombre : `Remitente Externo #${idx}`,
    residenteId: residente ? residente.id : null,
    asunto: `${plantilla.asunto} ${residente ? `(${residente.torre} - ${residente.apartamento})` : '(Sin registro)'}`,
    cuerpoOriginal: cuerpoConFirma,
    cuerpoEnmascarado: maskedText,
    fechaRecepcion,
    fechaActualizacion: new Date(fechaRecepcionDate.getTime() + 7200000).toISOString(),
    tiempoRespuestaHoras:
      estado === 'Resuelta' || estado === 'Cerrada' ? 3 + (idx % 18) : undefined,
    estadoProcesamientoCorreo: usaReglas ? 'Procesado por Reglas' : 'Procesado IA',
    sugerencia: {
      categoria: plantilla.categoria,
      prioridad: plantilla.prioridad,
      resumen: plantilla.resumen,
      justificacion: plantilla.justificacion,
      confianza: plantilla.confianza,
      origen: usaReglas ? 'Reglas' : 'IA',
      pendienteRevisionReglas: usaReglas,
    },
    validadaPor: estado !== 'Pendiente de validación' ? 'Dra. Claudia Patricia Morales' : undefined,
    fechaValidacion:
      estado !== 'Pendiente de validación'
        ? new Date(fechaRecepcionDate.getTime() + 3600000).toISOString()
        : undefined,
    huboModificacionAlValidar:
      estado !== 'Pendiente de validación' ? idx % 7 === 0 : undefined,
    categoria: plantilla.categoria,
    prioridad: plantilla.prioridad,
    estado,
    pendienteRevision: usaReglas && estado === 'Pendiente de validación',
    responsableId:
      estado === 'Pendiente de validación' || estado === 'Validada'
        ? null
        : plantilla.responsableDefault,
    slaHoras: plantilla.prioridad === 'Alta' ? 4 : plantilla.prioridad === 'Media' ? 24 : 72,
    historial,
  };
});

export const PUBLICACIONES_SEED: PublicacionInstitucional[] = [
  {
    id: 'pub-1',
    titulo: 'Protocolo de Inspección Estructural Post-Sismo en Torres 1 a 8',
    categoria: 'Seguridad e Infraestructura',
    fecha: '12 de mayo de 2025',
    extracto: 'Conoce el dictamen técnico emitido por la comisión de ingeniería tras el sismo registrado esta semana y las recomendaciones de evacuación.',
    contenido: 'El equipo de ingeniería estructural realizó una inspección visual y de juntas constructivas en las 8 torres y sótanos del Conjunto Residencial Parques del Occidente. No se encontraron afectaciones estructurales; únicamente fisuras superficiales en pañetes de punto fijo de Torre 4 que serán resanadas esta semana.',
    imagenUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'pub-2',
    titulo: 'Mantenimiento y Lavado de Tanques de Red Hidráulica',
    categoria: 'Mantenimiento',
    fecha: '08 de mayo de 2025',
    extracto: 'Programación de suspensión temporal del suministro de agua potable por desinfección semestral certificada.',
    contenido: 'El próximo miércoles entre las 8:00 a.m. y las 2:00 p.m. se llevará a cabo el lavado y desinfección de los tanques subterráneos de reserva. Recomendamos almacenar agua suficiente para el consumo básico del hogar.',
    imagenUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'pub-3',
    titulo: 'Avance del 75% en Impermeabilización de Fachadas y Cubiertas',
    categoria: 'Obras Civiles',
    fecha: '03 de mayo de 2025',
    extracto: 'Balance financiero y técnico de la obra aprobada en Asamblea General para la protección hidrófuga de ladrillo a la vista.',
    contenido: 'Finalizamos satisfactoriamente la intervención en las Torres 1 a 6. Agradecemos a los copropietarios mantener las ventanas cerradas durante el paso de los andamios colgantes en las Torres 7 y 8.',
    imagenUrl: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'pub-4',
    titulo: 'Tenencia Responsable de Mascotas en Zonas Verdes y Senderos',
    categoria: 'Convivencia',
    fecha: '28 de abril de 2025',
    extracto: 'Recordatorio normativo sobre el uso obligatorio de traílla, recolección de excretas y registro en el censo de mascotas.',
    contenido: 'Conforme al Manual de Convivencia y el Código Nacional de Policía (Ley 1801), todo canino debe circular con collar y traílla en áreas comunes. Se han dispuesto 6 nuevas estaciones con bolsas biodegradables en el parque interior.',
    imagenUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'pub-5',
    titulo: 'Horarios de Atención Presencial de Administración y Contabilidad',
    categoria: 'Administrativo',
    fecha: '22 de abril de 2025',
    extracto: 'Consulta los horarios de atención en oficina y recuerda que tus solicitudes por correo son clasificadas las 24 horas por nuestro sistema SOC-CRM.',
    contenido: 'Atención presencial: Lunes a Viernes de 8:00 a.m. a 5:00 p.m. y Sábados de 8:00 a.m. a 12:00 m. Para radicar solicitudes sin hacer fila, envía un correo a administracion@parquesoccidente.demo indicando tu torre y apartamento.',
    imagenUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'pub-6',
    titulo: 'Modernización del Circuito Cerrado de Televisión (CCTV) en Portería',
    categoria: 'Seguridad',
    fecha: '15 de abril de 2025',
    extracto: 'Instalación de 16 cámaras domo Full HD con visión nocturna en perímetro vehicular y accesos peatonales.',
    contenido: 'Se completó la actualización del centro de monitoreo en la portería principal sobre la Calle 77B # 129-70, mejorando el reconocimiento de placas y el control perimetral nocturno.',
    imagenUrl: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'pub-7',
    titulo: 'Normas de Ruido, Remodelaciones y Paz Vecinal',
    categoria: 'Convivencia',
    fecha: '09 de abril de 2025',
    extracto: 'Horarios autorizados para reparaciones locativas y uso moderado de equipos de sonido en apartamentos.',
    contenido: 'Las obras menores dentro de unidades privadas solo están permitidas de lunes a viernes de 8:00 a.m. a 4:30 p.m. y sábados de 9:00 a.m. a 1:00 p.m. Domingos y festivos está prohibido el uso de taladros o demoliciones.',
    imagenUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'pub-8',
    titulo: 'Sorteo Semestral y Reglamentación de Parqueaderos de Visitantes',
    categoria: 'Parqueaderos',
    fecha: '02 de abril de 2025',
    extracto: 'Requisitos para estar al día en cartera y participar en la asignación rotativa de cupos comunales.',
    contenido: 'Para participar en la asignación de parqueaderos comunales de moto y vehículo es indispensable encontrarse a paz y salvo por todo concepto al cierre del mes anterior y no presentar sanciones vigentes de convivencia.',
    imagenUrl: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=80',
  },
];
