import { z } from 'zod';
import { normalizar } from '../../api/src/domain/clasificador.js';

/**
 * Representación del texto (RN-04). El MISMO código se usa al entrenar y al predecir dentro del worker:
 * si difieren (train/serve skew), la red se equivoca en silencio.
 */

/** Igual a LIMITE_TEXTO del worker (apps/worker-ia/src/procesar.ts): la red ve lo mismo que en producción. Una prueba lo verifica. */
export const LIMITE_TEXTO = 4000;

/**
 * Palabras gramaticales que aparecen en cualquier correo y no ayudan a decidir. Ya normalizadas (sin tildes).
 * No incluye negaciones ("no", "sin", "ni"): "sin luz" o "no funciona" sí dicen algo.
 */
const VACIAS = new Set(
  (
    'al algo alguna algunas alguno algunos ante antes asi aun cada como con contra cual cuales cuando de del desde ' +
    'donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estaba estan estar estas este esto estos ' +
    'favor fue ha han hay la las le les lo los mas me mi mis muy nos nuestra nuestro o para pero por porque que se ' +
    'ser si sobre son su sus tambien te tiene tienen tu un una uno unos unas usted ustedes y ya yo'
  ).split(' '),
);

/** Minúsculas, sin tildes, sin palabras vacías, sin números sueltos ni letras sueltas. */
function palabras(texto: string): string[] {
  return (normalizar(texto).match(/[a-z0-9]+/g) ?? []).filter((p) => p.length > 1 && !VACIAS.has(p) && !/^\d+$/.test(p));
}

/** Palabras y pares de palabras seguidas ("fuga agua" → "fuga_agua"), dentro de un mismo fragmento. */
function conBigramas(ps: readonly string[]): string[] {
  const salida = [...ps];
  for (let i = 0; i + 1 < ps.length; i++) salida.push(`${ps[i]}_${ps[i + 1]}`);
  return salida;
}

/** Términos de un correo. El asunto cuenta dos veces, como en las reglas, porque resume la intención. */
export function terminos(asunto: string, cuerpo: string): string[] {
  const deAsunto = conBigramas(palabras(asunto));
  return [...deAsunto, ...deAsunto, ...conBigramas(palabras(cuerpo.slice(0, LIMITE_TEXTO)))];
}

export const VocabularioSchema = z
  .object({
    version: z.literal(1),
    /** Correos con los que se construyó (N del IDF). */
    documentos: z.number().int().positive(),
    terminos: z.array(z.string().min(1)),
    idf: z.array(z.number().positive()),
  })
  .refine((v) => v.terminos.length === v.idf.length, { message: 'terminos e idf deben tener el mismo largo' })
  .refine((v) => new Set(v.terminos).size === v.terminos.length, { message: 'hay términos repetidos' });
export type Vocabulario = z.output<typeof VocabularioSchema>;

export interface OpcionesVocabulario {
  /** Un término entra solo si aparece en al menos esta cantidad de correos (deja fuera nombres y direcciones). */
  minDocumentos: number;
  /** Tamaño máximo del vocabulario (= neuronas de entrada). */
  maxTerminos: number;
}
export const VOCABULARIO_POR_DEFECTO: OpcionesVocabulario = { minDocumentos: 3, maxTerminos: 3000 };

/**
 * Vocabulario a partir de los correos de ENTRENAMIENTO (nunca de validación o prueba: sería filtrar información).
 * Orden determinista: más frecuentes primero y, a igual frecuencia, alfabético. IDF suavizado: ln((1+N)/(1+df)) + 1.
 */
export function construirVocabulario(
  documentos: readonly (readonly string[])[],
  opciones: OpcionesVocabulario = VOCABULARIO_POR_DEFECTO,
): Vocabulario {
  if (documentos.length === 0) throw new Error('No hay correos para construir el vocabulario');
  const df = new Map<string, number>();
  for (const d of documentos) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = documentos.length;
  const elegidos = [...df]
    .filter(([, f]) => f >= opciones.minDocumentos)
    .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .slice(0, opciones.maxTerminos);
  return {
    version: 1,
    documentos: n,
    terminos: elegidos.map(([t]) => t),
    idf: elegidos.map(([, f]) => Math.log((1 + n) / (1 + f)) + 1),
  };
}

/** Correo → vector TF-IDF de norma 1 (la entrada de la red). */
export class Vectorizador {
  readonly vocabulario: Vocabulario;
  private readonly indice: Map<string, number>;

  constructor(vocabulario: unknown) {
    this.vocabulario = VocabularioSchema.parse(vocabulario);
    this.indice = new Map(this.vocabulario.terminos.map((t, i) => [t, i]));
  }

  get dimension(): number {
    return this.vocabulario.terminos.length;
  }

  /** Un correo sin ningún término conocido da el vector cero (la red decide solo con sus sesgos). */
  vectorizarTerminos(ts: readonly string[]): Float32Array {
    const v = new Float32Array(this.dimension);
    for (const t of ts) {
      const i = this.indice.get(t);
      if (i !== undefined) v[i] = (v[i] ?? 0) + 1;
    }
    let norma = 0;
    for (let i = 0; i < v.length; i++) {
      const x = (v[i] ?? 0) * (this.vocabulario.idf[i] ?? 0);
      v[i] = x;
      norma += x * x;
    }
    if (norma > 0) {
      const raiz = Math.sqrt(norma);
      for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / raiz;
    }
    return v;
  }

  vectorizar(asunto: string, cuerpo: string): Float32Array {
    return this.vectorizarTerminos(terminos(asunto, cuerpo));
  }
}
