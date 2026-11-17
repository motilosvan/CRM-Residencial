import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { CATEGORIAS, type Categoria } from '../../api/src/domain/clasificador.js';
import { PRIORIDADES, type Prioridad } from '../../api/src/domain/priorizador.js';
import { barajar, generador, pesosPorClase, type Ejemplo } from './datos.js';
import {
  construirVocabulario,
  terminos,
  Vectorizador,
  VOCABULARIO_POR_DEFECTO,
  type OpcionesVocabulario,
} from './texto.js';
import { tf, tfl } from './tf.js';

/**
 * Red neuronal de sugerencias (RN-05). Una capa oculta compartida y dos salidas softmax:
 *
 *   x (TF-IDF, V) → Dense(oculta, ReLU, L2) ─┬→ Dense(5, softmax)  categoría
 *                                            └→ Dense(3, softmax)  prioridad
 *
 * Es pequeña a propósito: con cientos de correos, una red profunda memoriza en vez de aprender.
 */

export interface HiperParametros {
  /** Neuronas de la capa oculta; 0 = sin capa oculta (equivale a una regresión logística: la línea base E1). */
  oculta: number;
  /** Regularización L2 de los pesos: castiga pesos grandes y reduce la memorización. */
  l2: number;
  /**
   * Fracción de neuronas apagadas al azar en cada paso. Mayor que 0 hace el entrenamiento NO reproducible:
   * en TF.js, una semilla fija repetiría la misma máscara en todos los pasos y anularía su efecto.
   */
  dropout: number;
  tasaAprendizaje: number;
  lote: number;
  epocasMax: number;
  /** Épocas seguidas sin mejorar la pérdida de validación antes de parar (parada temprana). */
  paciencia: number;
  /** Fija la inicialización de los pesos y el orden de los lotes: misma semilla y mismo corpus ⇒ mismo modelo. */
  semilla: number;
  /** Compensa las clases con pocos ejemplos (p. ej. SEGURIDAD) en la pérdida. */
  pesoPorClase: boolean;
}

export const HIPERPARAMETROS_POR_DEFECTO: HiperParametros = {
  oculta: 64,
  l2: 1e-4,
  dropout: 0,
  // Provisional: con TF-IDF (vectores de norma 1) y pocos lotes por época, 1e-3 se queda corto en 100 épocas.
  // RN-06 la ajusta con validación cruzada sobre el corpus real.
  tasaAprendizaje: 1e-2,
  lote: 32,
  epocasMax: 100,
  paciencia: 10,
  semilla: 42,
  pesoPorClase: true,
};

const HiperParametrosSchema = z.object({
  oculta: z.number().int().min(0).max(1024),
  l2: z.number().min(0).max(1),
  dropout: z.number().min(0).max(0.9),
  tasaAprendizaje: z.number().positive().max(1),
  lote: z.number().int().min(1).max(4096),
  epocasMax: z.number().int().min(1).max(10_000),
  paciencia: z.number().int().min(1),
  semilla: z.number().int().min(0),
  pesoPorClase: z.boolean(),
});

const OpcionesVocabularioSchema = z.object({
  minDocumentos: z.number().int().min(1),
  maxTerminos: z.number().int().min(1).max(100_000),
});

/**
 * Valores por defecto + los dados. Un campo `undefined` NO reemplaza al valor por defecto: con un spread
 * simple, `{ oculta: undefined }` (una opción de la línea de comandos no indicada) dejaba la red sin capa oculta.
 */
function combinar<T extends object>(base: T, cambios: Partial<T> | undefined): T {
  const definidos = Object.entries(cambios ?? {}).filter(([, v]) => v !== undefined);
  return { ...base, ...Object.fromEntries(definidos) };
}

export interface Prediccion {
  categoria: Categoria;
  confianzaCategoria: number;
  probabilidadesCategoria: Record<Categoria, number>;
  prioridad: Prioridad;
  confianzaPrioridad: number;
  probabilidadesPrioridad: Record<Prioridad, number>;
}

export interface EpocaEntrenamiento {
  epoca: number;
  perdida: number;
  perdidaValidacion: number | null;
}

const FORMATO = 'soc-crm-red/1';

const MetadatosSchema = z.object({
  formato: z.literal(FORMATO),
  nombre: z.string().min(1),
  categorias: z.array(z.string()),
  prioridades: z.array(z.string()),
  hiperparametros: HiperParametrosSchema,
  vocabulario: OpcionesVocabularioSchema,
  ejemplosEntrenamiento: z.number().int().nonnegative(),
  ejemplosValidacion: z.number().int().nonnegative(),
  /** Épocas del modelo guardado: con parada temprana, la de menor pérdida de validación. */
  epocas: z.number().int().positive(),
  entrenadoEn: z.string(),
});
export type Metadatos = z.output<typeof MetadatosSchema>;

export interface OpcionesEntrenamiento {
  /** Versión del modelo, p. ej. "rn-v1": queda en SUGERENCIAS_IA.modelo. */
  nombre?: string;
  hiperparametros?: Partial<HiperParametros>;
  vocabulario?: Partial<OpcionesVocabulario>;
  alTerminarEpoca?: (e: EpocaEntrenamiento) => void;
}

/** Entropía cruzada con un peso por clase. Sin `tidy` adentro: TF.js necesita los intermedios para el gradiente. */
function entropiaPonderada(pesos: readonly number[]) {
  return (real: tf.Tensor, predicho: tf.Tensor): tf.Tensor => {
    const p = tf.clipByValue(predicho, 1e-7, 1 - 1e-7);
    const porEjemplo = tf.neg(tf.sum(tf.mul(tf.mul(real, tf.log(p)), tf.tensor1d([...pesos])), -1));
    return tf.mean(porEjemplo);
  };
}

function construirModelo(dimension: number, hp: HiperParametros): tfl.LayersModel {
  const l2 = hp.l2 > 0 ? tfl.regularizers.l2({ l2: hp.l2 }) : undefined;
  const entrada = tfl.input({ shape: [dimension], name: 'entrada' });
  let h: tfl.SymbolicTensor = entrada;
  if (hp.oculta > 0) {
    h = tfl.layers
      .dense({
        units: hp.oculta,
        activation: 'relu',
        name: 'oculta',
        kernelInitializer: tfl.initializers.glorotUniform({ seed: hp.semilla }),
        kernelRegularizer: l2,
      })
      .apply(h) as tfl.SymbolicTensor;
    if (hp.dropout > 0) h = tfl.layers.dropout({ rate: hp.dropout }).apply(h) as tfl.SymbolicTensor;
  }
  const salida = (nombre: string, unidades: number, semilla: number) =>
    tfl.layers
      .dense({
        units: unidades,
        activation: 'softmax',
        name: nombre,
        kernelInitializer: tfl.initializers.glorotUniform({ seed: semilla }),
        // Sin capa oculta, la L2 va en las salidas (son los únicos pesos).
        kernelRegularizer: hp.oculta > 0 ? undefined : l2,
      })
      .apply(h) as tfl.SymbolicTensor;
  return tfl.model({
    inputs: entrada,
    outputs: [salida('categoria', CATEGORIAS.length, hp.semilla + 1), salida('prioridad', PRIORIDADES.length, hp.semilla + 2)],
  });
}

/** Filas de vectores → matriz [n, d] en un solo bloque de memoria. */
function apilar(vectores: readonly Float32Array[], indices: readonly number[], d: number): tf.Tensor2D {
  const datos = new Float32Array(indices.length * d);
  indices.forEach((idx, fila) => datos.set(vectores[idx]!, fila * d));
  return tf.tensor2d(datos, [indices.length, d]);
}

function unoCaliente(etiquetas: readonly number[], indices: readonly number[], k: number): tf.Tensor2D {
  const datos = new Float32Array(indices.length * k);
  indices.forEach((idx, fila) => (datos[fila * k + etiquetas[idx]!] = 1));
  return tf.tensor2d(datos, [indices.length, k]);
}

function argmax(xs: ArrayLike<number>): number {
  let mejor = 0;
  for (let i = 1; i < xs.length; i++) if ((xs[i] ?? 0) > (xs[mejor] ?? 0)) mejor = i;
  return mejor;
}

function aRegistro<K extends string>(claves: readonly K[], valores: ArrayLike<number>, desde: number): Record<K, number> {
  return Object.fromEntries(claves.map((c, i) => [c, valores[desde + i] ?? 0])) as Record<K, number>;
}

/** TF.js puede entregar los pesos en varios bloques; en disco van en un solo archivo. */
function unirPesos(datos: ArrayBuffer | ArrayBuffer[] | undefined): Buffer {
  if (!datos) throw new Error('TF.js no entregó los pesos del modelo');
  return Array.isArray(datos) ? Buffer.concat(datos.map((b) => Buffer.from(b))) : Buffer.from(datos);
}

const mismaLista = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export class RedSugerencias {
  private constructor(
    private readonly modelo: tfl.LayersModel,
    readonly vectorizador: Vectorizador,
    readonly metadatos: Metadatos,
  ) {}

  /**
   * Entrena con `entrenamiento`. Si hay `validacion`, aplica parada temprana y se queda con los pesos de la
   * época de menor pérdida de validación; si no, entrena `epocasMax` épocas.
   */
  static async entrenar(
    entrenamiento: readonly Ejemplo[],
    validacion: readonly Ejemplo[] = [],
    opciones: OpcionesEntrenamiento = {},
  ): Promise<{ red: RedSugerencias; historial: EpocaEntrenamiento[] }> {
    if (entrenamiento.length === 0) throw new Error('No hay ejemplos de entrenamiento');
    const hp: HiperParametros = HiperParametrosSchema.parse(combinar(HIPERPARAMETROS_POR_DEFECTO, opciones.hiperparametros));
    const ov: OpcionesVocabulario = OpcionesVocabularioSchema.parse(combinar(VOCABULARIO_POR_DEFECTO, opciones.vocabulario));

    const docs = entrenamiento.map((e) => terminos(e.asunto, e.cuerpo));
    const vectorizador = new Vectorizador(construirVocabulario(docs, ov));
    const d = vectorizador.dimension;
    if (d === 0) {
      throw new Error(`El vocabulario quedó vacío: ningún término aparece en ${ov.minDocumentos} correos o más`);
    }

    const X = docs.map((t) => vectorizador.vectorizarTerminos(t));
    const yCat = entrenamiento.map((e) => CATEGORIAS.indexOf(e.categoria));
    const yPri = entrenamiento.map((e) => PRIORIDADES.indexOf(e.prioridad));
    const unos = (k: number) => new Array<number>(k).fill(1);

    const modelo = construirModelo(d, hp);
    modelo.compile({
      optimizer: tf.train.adam(hp.tasaAprendizaje),
      loss: [
        entropiaPonderada(hp.pesoPorClase ? pesosPorClase(yCat, CATEGORIAS.length) : unos(CATEGORIAS.length)),
        entropiaPonderada(hp.pesoPorClase ? pesosPorClase(yPri, PRIORIDADES.length) : unos(PRIORIDADES.length)),
      ],
    });

    // Validación: se vectoriza con el vocabulario de entrenamiento y se arma una sola vez.
    const iVal = validacion.map((_, i) => i);
    const XVal = validacion.map((e) => vectorizador.vectorizar(e.asunto, e.cuerpo));
    const val =
      validacion.length > 0
        ? {
            x: apilar(XVal, iVal, d),
            yc: unoCaliente(validacion.map((e) => CATEGORIAS.indexOf(e.categoria)), iVal, CATEGORIAS.length),
            yp: unoCaliente(validacion.map((e) => PRIORIDADES.indexOf(e.prioridad)), iVal, PRIORIDADES.length),
          }
        : null;

    const azar = generador(hp.semilla);
    const indices = entrenamiento.map((_, i) => i);
    const historial: EpocaEntrenamiento[] = [];
    let mejorPerdida = Number.POSITIVE_INFINITY;
    let mejorEpoca = 0;
    let mejoresPesos: tf.Tensor[] | null = null;

    try {
      for (let epoca = 1; epoca <= hp.epocasMax; epoca++) {
        // Orden de los lotes con el generador propio: `fit({ shuffle: true })` usa Math.random y no sería reproducible.
        const orden = barajar(indices, azar);
        let suma = 0;
        let lotes = 0;
        for (let i = 0; i < orden.length; i += hp.lote) {
          const idx = orden.slice(i, i + hp.lote);
          const x = apilar(X, idx, d);
          const yc = unoCaliente(yCat, idx, CATEGORIAS.length);
          const yp = unoCaliente(yPri, idx, PRIORIDADES.length);
          try {
            const r = await modelo.trainOnBatch(x, [yc, yp]);
            suma += Array.isArray(r) ? (r[0] ?? 0) : r;
            lotes++;
          } finally {
            tf.dispose([x, yc, yp]);
          }
        }

        let perdidaValidacion: number | null = null;
        if (val) {
          const r = modelo.evaluate(val.x, [val.yc, val.yp], { batchSize: 256 });
          const escalares = Array.isArray(r) ? r : [r];
          perdidaValidacion = (await escalares[0]!.data())[0] ?? Number.NaN;
          tf.dispose(escalares);
        }
        const e: EpocaEntrenamiento = { epoca, perdida: suma / lotes, perdidaValidacion };
        historial.push(e);
        opciones.alTerminarEpoca?.(e);

        if (perdidaValidacion === null) {
          mejorEpoca = epoca;
        } else if (perdidaValidacion < mejorPerdida - 1e-6) {
          mejorPerdida = perdidaValidacion;
          mejorEpoca = epoca;
          tf.dispose(mejoresPesos ?? []);
          mejoresPesos = modelo.getWeights().map((w) => w.clone());
        } else if (epoca - mejorEpoca >= hp.paciencia) {
          break; // parada temprana: la validación dejó de mejorar
        }
      }
      if (mejoresPesos) modelo.setWeights(mejoresPesos);
    } catch (err) {
      modelo.dispose();
      throw err;
    } finally {
      tf.dispose(mejoresPesos ?? []);
      if (val) tf.dispose([val.x, val.yc, val.yp]);
      modelo.optimizer?.dispose();
    }

    const metadatos: Metadatos = {
      formato: FORMATO,
      nombre: opciones.nombre ?? 'rn-sin-nombre',
      categorias: [...CATEGORIAS],
      prioridades: [...PRIORIDADES],
      hiperparametros: hp,
      vocabulario: ov,
      ejemplosEntrenamiento: entrenamiento.length,
      ejemplosValidacion: validacion.length,
      epocas: mejorEpoca,
      entrenadoEn: new Date().toISOString(),
    };
    return { red: new RedSugerencias(modelo, vectorizador, metadatos), historial };
  }

  predecir(asunto: string, cuerpo: string): Prediccion {
    return this.predecirVectores([this.vectorizador.vectorizar(asunto, cuerpo)])[0]!;
  }

  /** Varias predicciones en una sola pasada (la justificación por oclusión hace ~100 por correo). */
  predecirVectores(vectores: readonly Float32Array[]): Prediccion[] {
    if (vectores.length === 0) return [];
    const d = this.vectorizador.dimension;
    const x = apilar(vectores, vectores.map((_, i) => i), d);
    const salidas = this.modelo.predict(x) as tf.Tensor[];
    try {
      const pc = salidas[0]!.dataSync();
      const pp = salidas[1]!.dataSync();
      const kc = CATEGORIAS.length;
      const kp = PRIORIDADES.length;
      return vectores.map((_, i) => {
        const filaC = pc.subarray(i * kc, (i + 1) * kc);
        const filaP = pp.subarray(i * kp, (i + 1) * kp);
        const c = argmax(filaC);
        const p = argmax(filaP);
        return {
          categoria: CATEGORIAS[c]!,
          confianzaCategoria: filaC[c] ?? 0,
          probabilidadesCategoria: aRegistro(CATEGORIAS, filaC, 0),
          prioridad: PRIORIDADES[p]!,
          confianzaPrioridad: filaP[p] ?? 0,
          probabilidadesPrioridad: aRegistro(PRIORIDADES, filaP, 0),
        };
      });
    } finally {
      tf.dispose([x, ...salidas]);
    }
  }

  /**
   * Guarda en `directorio`: model.json (arquitectura), pesos.bin, vocabulario.json y metadatos.json.
   * Sin tfjs-node no existe `file://`: se escribe con un manejador propio.
   */
  async guardar(directorio: string): Promise<void> {
    await mkdir(directorio, { recursive: true });
    await this.modelo.save(
      tf.io.withSaveHandler(async (a) => {
        await writeFile(join(directorio, 'pesos.bin'), unirPesos(a.weightData));
        const modelJson = {
          format: a.format,
          generatedBy: a.generatedBy,
          convertedBy: a.convertedBy ?? null,
          modelTopology: a.modelTopology,
          weightsManifest: [{ paths: ['pesos.bin'], weights: a.weightSpecs ?? [] }],
        };
        await writeFile(join(directorio, 'model.json'), JSON.stringify(modelJson));
        return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
      }),
    );
    await writeFile(join(directorio, 'vocabulario.json'), JSON.stringify(this.vectorizador.vocabulario));
    await writeFile(join(directorio, 'metadatos.json'), `${JSON.stringify(this.metadatos, null, 2)}\n`);
  }

  /** Carga un modelo guardado. Falla si se entrenó con otro catálogo de categorías o prioridades. */
  static async cargar(directorio: string): Promise<RedSugerencias> {
    const leer = (archivo: string) => readFile(join(directorio, archivo));
    const [modelJson, pesos, vocabulario, metadatosJson] = await Promise.all([
      leer('model.json'),
      leer('pesos.bin'),
      leer('vocabulario.json'),
      leer('metadatos.json'),
    ]);
    const metadatos = MetadatosSchema.parse(JSON.parse(metadatosJson.toString('utf8')));
    if (!mismaLista(metadatos.categorias, CATEGORIAS) || !mismaLista(metadatos.prioridades, PRIORIDADES)) {
      throw new Error(
        `El modelo ${metadatos.nombre} se entrenó con otro catálogo de categorías o prioridades: hay que reentrenarlo`,
      );
    }
    const vectorizador = new Vectorizador(JSON.parse(vocabulario.toString('utf8')));
    const mj = JSON.parse(modelJson.toString('utf8')) as {
      modelTopology: object;
      weightsManifest: { weights: tf.io.WeightsManifestEntry[] }[];
    };
    const modelo = await tfl.loadLayersModel(
      tf.io.fromMemory({
        modelTopology: mj.modelTopology,
        weightSpecs: mj.weightsManifest.flatMap((g) => g.weights),
        weightData: pesos.buffer.slice(pesos.byteOffset, pesos.byteOffset + pesos.byteLength) as ArrayBuffer,
      }),
    );
    const entrada = modelo.inputs[0]?.shape[1];
    if (entrada !== vectorizador.dimension) {
      modelo.dispose();
      throw new Error(`El modelo espera ${entrada} términos y el vocabulario tiene ${vectorizador.dimension}`);
    }
    return new RedSugerencias(modelo, vectorizador, metadatos);
  }

  /** Libera la memoria de los pesos (TF.js no la recoge solo). */
  dispose(): void {
    this.modelo.dispose();
  }
}
