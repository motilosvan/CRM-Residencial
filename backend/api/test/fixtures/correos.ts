import type { Categoria } from '../../src/domain/clasificador.js';
import type { Prioridad } from '../../src/domain/priorizador.js';

export interface CorreoEjemplo {
  asunto: string;
  cuerpo: string;
  categoria: Categoria;
  prioridad: Prioridad;
}

/**
 * Correos de ejemplo redactados por el equipo para medir el clasificador del MVP.
 * Aviso: el conjunto lo escribió quien también escribió las reglas, así que sobrestima el
 * acierto real. La medición honesta es la tarea S6-01 con correos reales del conjunto.
 */
export const CORREOS_EJEMPLO: CorreoEjemplo[] = [
  // ── SEGURIDAD
  { asunto: 'Robo en el parqueadero', cuerpo: 'Anoche forzaron mi carro y se llevaron la radio. Pido revisar las cámaras de seguridad.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  { asunto: 'Persona sospechosa en torre 3', cuerpo: 'Vi un hombre intentando abrir las puertas del lobby y el portero no estaba.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  { asunto: 'Alarma sonando', cuerpo: 'La alarma del bloque B suena desde las 3 de la madrugada y nadie responde.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  { asunto: 'Intruso en la piscina', cuerpo: 'Hay personas ajenas al conjunto usando la piscina, la vigilancia no las detuvo.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  { asunto: 'Pelea en la zona social', cuerpo: 'Hubo una pelea con agresión física entre visitantes del salón.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  { asunto: 'Posible incendio en el sótano', cuerpo: 'Se huele a humo en el sótano 2, por favor revisen urgente.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  { asunto: 'Amenaza de un vecino', cuerpo: 'Un residente me amenazó en el pasillo, quiero dejar constancia.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  { asunto: 'Cámaras de seguridad dañadas', cuerpo: 'Las cámaras de la entrada peatonal no graban desde el lunes.', categoria: 'SEGURIDAD', prioridad: 'ALTA' },
  // ── MANTENIMIENTO
  { asunto: 'Fuga de agua en baño común', cuerpo: 'Hay una fuga en el baño del salón comunal, el piso está encharcado.', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  { asunto: 'Ascensor de la torre 2 dañado', cuerpo: 'El ascensor se detiene entre pisos hace tres días.', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  { asunto: 'Bombillos quemados en pasillo', cuerpo: 'En el piso 5 hay tres bombillos quemados y el pasillo queda a oscuras.', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  { asunto: 'Gotera en mi apartamento', cuerpo: 'Se filtra agua por el techo del 502 cada vez que llueve, hay humedad en la pared.', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  { asunto: 'Portón eléctrico no cierra', cuerpo: 'El portón del parqueadero queda abierto, el motor hace ruido y no cierra.', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  { asunto: 'Fuga de gas en cocina común', cuerpo: 'Se siente olor a gas en la cocina del salón social. Es urgente.', categoria: 'MANTENIMIENTO', prioridad: 'ALTA' },
  { asunto: 'Tubería rota en el sótano', cuerpo: 'Hay una tubería rota y el agua baja por la rampa.', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  { asunto: 'Reparación del citófono', cuerpo: 'El citófono del apto 304 no suena, solicito arreglo.', categoria: 'MANTENIMIENTO', prioridad: 'MEDIA' },
  // ── FACTURACION
  { asunto: 'Cobro duplicado de la cuota', cuerpo: 'Me llegó el cobro de la cuota de administración dos veces este mes.', categoria: 'FACTURACION', prioridad: 'BAJA' },
  { asunto: 'Solicitud de factura', cuerpo: 'Necesito la factura del pago que hice el 5 de octubre para mi contabilidad.', categoria: 'FACTURACION', prioridad: 'BAJA' },
  { asunto: 'Saldo pendiente', cuerpo: 'Quiero conocer el saldo y la deuda que figura a mi apartamento.', categoria: 'FACTURACION', prioridad: 'BAJA' },
  { asunto: 'No me llegó el recibo', cuerpo: 'Este mes no recibí el recibo de cobro, ¿me lo pueden reenviar?', categoria: 'FACTURACION', prioridad: 'BAJA' },
  { asunto: 'Error en el valor de la cuota extraordinaria', cuerpo: 'El valor cobrado no coincide con lo aprobado.', categoria: 'FACTURACION', prioridad: 'BAJA' },
  { asunto: 'Pagué la mora y sigue el cobro', cuerpo: 'Ya pagué la mora y el sistema todavía me cobra intereses.', categoria: 'FACTURACION', prioridad: 'BAJA' },
  { asunto: 'Extracto de cuenta', cuerpo: 'Solicito el extracto de los últimos seis meses.', categoria: 'FACTURACION', prioridad: 'BAJA' },
  // ── ADMINISTRATIVO
  { asunto: 'Certificado de residencia', cuerpo: 'Necesito un certificado que confirme que vivo en el conjunto para un trámite bancario.', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  { asunto: 'Citación a asamblea', cuerpo: '¿Cuándo es la próxima asamblea y cómo puedo dar poder a un vecino?', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  { asunto: 'Queja por ruido', cuerpo: 'El vecino del 601 hace fiestas con mucho ruido hasta la madrugada, viola la convivencia.', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  { asunto: 'Permiso para mudanza', cuerpo: 'Quisiera pedir permiso para hacer mi mudanza el sábado en la mañana.', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  { asunto: 'Autorización de ingreso', cuerpo: 'Autorizo el ingreso de mi hermana Laura durante la próxima semana.', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  { asunto: 'Reserva del salón comunal', cuerpo: 'Quiero reservar el salón comunal el 20 de diciembre.', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  { asunto: 'Mascotas y reglamento', cuerpo: 'Ruego me envíen el reglamento de propiedad horizontal sobre mascotas.', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  { asunto: 'Copia del acta', cuerpo: 'Solicito copia del acta de la última reunión del consejo.', categoria: 'ADMINISTRATIVO', prioridad: 'BAJA' },
  // ── SIN CLASIFICAR (o ambiguos que deben ir a un humano)
  { asunto: 'Hola', cuerpo: 'Buenos días, quisiera hablar con alguien por favor.', categoria: 'SIN_CLASIFICAR', prioridad: 'MEDIA' },
  { asunto: '(sin asunto)', cuerpo: 'Gracias.', categoria: 'SIN_CLASIFICAR', prioridad: 'MEDIA' },
  { asunto: 'Una pregunta', cuerpo: '¿A qué hora atienden en la oficina?', categoria: 'SIN_CLASIFICAR', prioridad: 'MEDIA' },
];
