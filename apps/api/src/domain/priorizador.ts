import { normalizar, palabrasClasificacion, palabrasCoincidentes, palabrasDePatrones, type Categoria } from './clasificador.js';

export const PRIORIDADES = ['ALTA', 'MEDIA', 'BAJA'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

const PESO: Record<Prioridad, number> = { ALTA: 3, MEDIA: 2, BAJA: 1 };

/** Prioridad base por categoría. */
const BASE: Record<Categoria, Prioridad> = Object.freeze({
  SEGURIDAD: 'ALTA',
  MANTENIMIENTO: 'MEDIA',
  FACTURACION: 'BAJA',
  ADMINISTRATIVO: 'BAJA',
  SIN_CLASIFICAR: 'MEDIA',
});

/** Prioridad base por categoría derivada del motor de reglas. */
export const PRIORIDAD_BASE_POR_CATEGORIA: Readonly<Record<Categoria, Prioridad>> = BASE;

/** Señales de urgencia que elevan a ALTA sin importar la categoría. */
const URGENTES: RegExp[] = [
  /\burgente/, /\burgencia/, /\bemergencia/, /\bincendio/, /\binundacion/, /\bfuga de gas/, /\bolor a gas/,
  /\bescape de gas/, /\bcortocircuito/, /\brobo\b/, /\brobaron/, /\bagresi/, /\bamenaza/, /\batrapad/,
  /\bascensor (atascado|detenido|trabado)/, /\bsin agua\b/, /\bsin luz\b/, /\bheri/, /\bdisparo/,
];

/** Palabras clave de urgencia derivadas de `URGENTES` sin duplicar la lista. */
export const PALABRAS_CLAVE_URGENCIA: readonly string[] = palabrasDePatrones(URGENTES);

/** Señales de urgencia que coinciden en asunto o cuerpo. */
export function palabrasUrgencia(asunto: string, cuerpo: string): string[] {
  return palabrasCoincidentes(`${asunto} ${cuerpo}`, URGENTES);
}

/**
 * Palabras clave y señales de urgencia que coincidieron en la clasificación y priorización,
 * sin duplicados y conservando el orden de aparición en las reglas.
 */
export function palabrasDetectadas(asunto: string, cuerpo: string): string[] {
  return Array.from(new Set([...palabrasClasificacion(asunto, cuerpo), ...palabrasUrgencia(asunto, cuerpo)]));
}

/**
 * Ajusta una prioridad que no calculó este módulo (p. ej. la sugerida por una IA) a la regla del negocio:
 * lo relacionado con seguridad nunca queda en BAJA.
 */
export function prioridadPermitida(categoria: Categoria, prioridad: Prioridad): Prioridad {
  return categoria === 'SEGURIDAD' && prioridad === 'BAJA' ? 'ALTA' : prioridad;
}

/** Limitación conocida: no entiende negaciones ("esto no es urgente"). */
export function priorizar(categoria: Categoria, asunto: string, cuerpo: string): Prioridad {
  const texto = normalizar(`${asunto} ${cuerpo}`);
  const urgente = URGENTES.some((p) => p.test(texto));
  const base = BASE[categoria];
  return urgente && PESO.ALTA > PESO[base] ? 'ALTA' : base;
}
