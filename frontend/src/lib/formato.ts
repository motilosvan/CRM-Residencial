const ZONA_BOGOTA = 'America/Bogota';
const LOCALE_CO = 'es-CO';
const GUION = '—';

const formatoFecha = new Intl.DateTimeFormat(LOCALE_CO, {
  timeZone: ZONA_BOGOTA,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const formatoFechaHora = new Intl.DateTimeFormat(LOCALE_CO, {
  timeZone: ZONA_BOGOTA,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export type EntradaFecha = Date | string | number | null | undefined;

function parsearFecha(valor: EntradaFecha): Date | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string' && !valor.trim()) return null;
  if (typeof valor === 'number' && !Number.isFinite(valor)) return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function partes(fmt: Intl.DateTimeFormat, fecha: Date): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const p of fmt.formatToParts(fecha)) {
    if (p.type !== 'literal') mapa[p.type] = p.value;
  }
  return mapa;
}

function textoFecha(p: Record<string, string>): string {
  const mes = (p.month ?? '').replace(/\.$/, '');
  return `${p.day} ${mes} ${p.year}`;
}

/** Formatea una fecha en español de Colombia (`America/Bogota`), p. ej. `'5 mar 2026'`. */
export function formatearFecha(valor: EntradaFecha): string {
  const fecha = parsearFecha(valor);
  if (!fecha) return GUION;
  return textoFecha(partes(formatoFecha, fecha));
}

/** Formatea fecha y hora de 24 h en `America/Bogota`, p. ej. `'5 mar 2026, 15:45'`. */
export function formatearFechaHora(valor: EntradaFecha): string {
  const fecha = parsearFecha(valor);
  if (!fecha) return GUION;
  const p = partes(formatoFechaHora, fecha);
  return `${textoFecha(p)}, ${p.hour}:${p.minute}`;
}

/** Formatea una duración en minutos (p. ej. `'0 min'`, `'1 h'`, `'1 h 30 min'`). */
export function formatearDuracion(minutos: number | null | undefined): string {
  if (typeof minutos !== 'number' || !Number.isFinite(minutos) || minutos < 0) return GUION;
  const total = Math.round(minutos);
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}
