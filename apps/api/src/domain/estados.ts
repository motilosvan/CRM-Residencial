/**
 * Máquina de estados de una solicitud. La fuente de verdad en ejecución es la tabla
 * TRANSICIONES_ESTADO; esta copia sirve para la UI y para validar rápido sin BD.
 * Una prueba de integración garantiza que ambas coinciden.
 */
export const ESTADOS = ['NUEVA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA'] as const;
export type Estado = (typeof ESTADOS)[number];

export const ESTADO_FINAL: Estado = 'CERRADA';

export const TRANSICIONES: ReadonlyArray<readonly [Estado, Estado]> = [
  ['NUEVA', 'ASIGNADA'],
  ['ASIGNADA', 'EN_PROCESO'],
  ['EN_PROCESO', 'RESUELTA'],
  ['RESUELTA', 'CERRADA'],
  ['RESUELTA', 'EN_PROCESO'], // reabrir
  ['ASIGNADA', 'NUEVA'], // desasignar
];

export function puedeTransicionar(desde: Estado, hasta: Estado): boolean {
  return TRANSICIONES.some(([o, d]) => o === desde && d === hasta);
}

export function destinosDesde(desde: Estado): Estado[] {
  return TRANSICIONES.filter(([o]) => o === desde).map(([, d]) => d);
}
