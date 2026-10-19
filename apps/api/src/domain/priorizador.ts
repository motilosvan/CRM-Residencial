import { normalizar, type Categoria } from './clasificador.js';

export const PRIORIDADES = ['ALTA', 'MEDIA', 'BAJA'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

const PESO: Record<Prioridad, number> = { ALTA: 3, MEDIA: 2, BAJA: 1 };

/** Prioridad base por categoría. */
const BASE: Record<Categoria, Prioridad> = {
  SEGURIDAD: 'ALTA',
  MANTENIMIENTO: 'MEDIA',
  FACTURACION: 'BAJA',
  ADMINISTRATIVO: 'BAJA',
  SIN_CLASIFICAR: 'MEDIA',
};

/** Señales de urgencia que elevan a ALTA sin importar la categoría. */
const URGENTES: RegExp[] = [
  /\burgente/, /\burgencia/, /\bemergencia/, /\bincendio/, /\binundacion/, /\bfuga de gas/, /\bolor a gas/,
  /\bescape de gas/, /\bcortocircuito/, /\brobo\b/, /\brobaron/, /\bagresi/, /\bamenaza/, /\batrapad/,
  /\bascensor (atascado|detenido|trabado)/, /\bsin agua\b/, /\bsin luz\b/, /\bheri/, /\bdisparo/,
];

/** Limitación conocida: no entiende negaciones ("esto no es urgente"). */
export function priorizar(categoria: Categoria, asunto: string, cuerpo: string): Prioridad {
  const texto = normalizar(`${asunto} ${cuerpo}`);
  const urgente = URGENTES.some((p) => p.test(texto));
  const base = BASE[categoria];
  return urgente && PESO.ALTA > PESO[base] ? 'ALTA' : base;
}
