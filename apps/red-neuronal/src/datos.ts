import { z } from 'zod';
import { CATEGORIAS } from '../../api/src/domain/clasificador.js';
import { PRIORIDADES } from '../../api/src/domain/priorizador.js';

/**
 * Un correo etiquetado del corpus (`data/*.jsonl`, fuera de git). El texto llega YA enmascarado
 * (`domain/enmascarar.ts`), igual que lo recibe la red dentro del worker.
 */
export const EjemploSchema = z.object({
  id: z.string().trim().min(1).max(100),
  asunto: z.string(),
  cuerpo: z.string(),
  categoria: z.enum(CATEGORIAS),
  prioridad: z.enum(PRIORIDADES),
  /** De dónde salió: manual, gateway, sintetico... */
  fuente: z.string().max(50).optional(),
  /** Quién lo etiquetó (iniciales): sirve para medir el acuerdo entre etiquetadores. */
  etiquetador: z.string().max(50).optional(),
});
export type Ejemplo = z.output<typeof EjemploSchema>;

/**
 * JSONL → ejemplos. Los errores dicen línea y campo, nunca el texto: el corpus puede traer datos personales
 * que el enmascarado no detectó.
 */
export function leerCorpus(jsonl: string): Ejemplo[] {
  const ejemplos: Ejemplo[] = [];
  const errores: string[] = [];
  const ids = new Set<string>();
  jsonl.split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    let crudo: unknown;
    try {
      crudo = JSON.parse(linea);
    } catch {
      errores.push(`línea ${i + 1}: no es JSON válido`);
      return;
    }
    const r = EjemploSchema.safeParse(crudo);
    if (!r.success) {
      const campos = [...new Set(r.error.issues.map((x) => x.path.join('.') || '(raíz)'))];
      errores.push(`línea ${i + 1}: campo inválido o faltante: ${campos.join(', ')}`);
      return;
    }
    if (ids.has(r.data.id)) {
      errores.push(`línea ${i + 1}: id repetido (${r.data.id})`);
      return;
    }
    ids.add(r.data.id);
    ejemplos.push(r.data);
  });
  if (errores.length > 0) {
    const resto = errores.length > 20 ? `\n  … y ${errores.length - 20} más` : '';
    throw new Error(`Corpus inválido:\n  - ${errores.slice(0, 20).join('\n  - ')}${resto}`);
  }
  return ejemplos;
}

/** Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da las mismas divisiones y el mismo orden. */
export function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Fisher–Yates con el generador dado. No modifica la entrada. */
export function barajar<T>(xs: readonly T[], azar: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/**
 * Separa una fracción de cada categoría (división estratificada), para que una clase con pocos ejemplos,
 * como SEGURIDAD, aparezca en los dos conjuntos. Una categoría con un solo ejemplo queda entera en el primero.
 */
export function dividirEstratificado<T extends { categoria: string }>(
  ejemplos: readonly T[],
  fraccion: number,
  semilla: number,
): { primero: T[]; segundo: T[] } {
  if (!(fraccion > 0 && fraccion < 1)) throw new Error('La fracción debe estar entre 0 y 1');
  const azar = generador(semilla);
  const porCategoria = new Map<string, T[]>();
  for (const e of ejemplos) porCategoria.set(e.categoria, [...(porCategoria.get(e.categoria) ?? []), e]);
  const primero: T[] = [];
  const segundo: T[] = [];
  for (const categoria of [...porCategoria.keys()].sort()) {
    const grupo = barajar(porCategoria.get(categoria)!, azar);
    const n = grupo.length < 2 ? 0 : Math.max(1, Math.round(grupo.length * fraccion));
    segundo.push(...grupo.slice(0, n));
    primero.push(...grupo.slice(n));
  }
  return { primero, segundo };
}

/**
 * Peso por clase para la pérdida: n / (k · n_c), acotado a [0,1; 10]. Una clase con la mitad de ejemplos
 * pesa el doble, así la red no aprende a ignorar SEGURIDAD solo porque llega poco. Una clase ausente pesa 1.
 */
export function pesosPorClase(etiquetas: readonly number[], k: number): number[] {
  const cuenta = new Array<number>(k).fill(0);
  for (const e of etiquetas) cuenta[e] = (cuenta[e] ?? 0) + 1;
  return cuenta.map((c) => (c === 0 ? 1 : Math.min(10, Math.max(0.1, etiquetas.length / (k * c)))));
}
