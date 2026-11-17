import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { corpusSintetico, exactitud } from '../test/corpusSintetico.js';
import { RedSugerencias, type EpocaEntrenamiento } from './modelo.js';
import { tf } from './tf.js';

// 5 categorías × 3 prioridades × 16 = 240. Con 8 por combinación la red se aferraba a coincidencias del
// relleno ("buenos", "piso") y fallaba la prioridad: el sobreajuste por pocos datos que anticipa el plan.
const entrenamiento = corpusSintetico(16, 1, 'e');
const validacion = corpusSintetico(2, 2, 'v');
const nuevos = corpusSintetico(3, 3, 'n'); // nunca vistos al entrenar
const COMPLETO = { epocasMax: 60, paciencia: 60 };
const CORTO = { epocasMax: 5 }; // para lo que no depende de que la red converja
const VOCAB = { minDocumentos: 2 };

let red: RedSugerencias;
let historial: EpocaEntrenamiento[];
let dir: string;

beforeAll(async () => {
  ({ red, historial } = await RedSugerencias.entrenar(entrenamiento, validacion, {
    nombre: 'rn-prueba', hiperparametros: COMPLETO, vocabulario: VOCAB,
  }));
  dir = await mkdtemp(join(tmpdir(), 'rn-'));
});
afterAll(async () => {
  red.dispose();
  await rm(dir, { recursive: true, force: true });
});

const probabilidades = (r: RedSugerencias) => r.predecirVectores(nuevos.map((e) => r.vectorizador.vectorizar(e.asunto, e.cuerpo)));

describe('Red neuronal · entrenamiento', () => {
  it('aprende un corpus separable y acierta en correos que no vio (prueba de cordura)', () => {
    const p = probabilidades(red);
    expect(exactitud(nuevos.map((e) => e.categoria), p.map((x) => x.categoria))).toBeGreaterThanOrEqual(0.95);
    expect(exactitud(nuevos.map((e) => e.prioridad), p.map((x) => x.prioridad))).toBeGreaterThanOrEqual(0.95);
    expect(historial.at(-1)!.perdida).toBeLessThan(historial[0]!.perdida);
  });

  it('entrega probabilidades que suman 1 y la confianza es la de la clase elegida', () => {
    const p = red.predecir('Robo en la torre', 'Vimos un intruso, es urgente');
    expect(p).toMatchObject({ categoria: 'SEGURIDAD', prioridad: 'ALTA' });
    expect(Object.values(p.probabilidadesCategoria).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5);
    expect(Object.values(p.probabilidadesPrioridad).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5);
    expect(p.confianzaCategoria).toBe(p.probabilidadesCategoria.SEGURIDAD);
  });

  it('es reproducible: misma semilla ⇒ mismas probabilidades; otra semilla ⇒ otros pesos', async () => {
    const entrenarCon = (semilla: number) =>
      RedSugerencias.entrenar(entrenamiento, validacion, { hiperparametros: { ...CORTO, semilla }, vocabulario: VOCAB });
    const [a, b, c] = [await entrenarCon(42), await entrenarCon(42), await entrenarCon(7)];
    try {
      expect(probabilidades(b.red)).toEqual(probabilidades(a.red));
      expect(b.historial).toEqual(a.historial);
      expect(probabilidades(c.red)).not.toEqual(probabilidades(a.red));
    } finally {
      [a, b, c].forEach((x) => x.red.dispose());
    }
  });

  it('parada temprana: se detiene tras `paciencia` épocas sin mejorar y conserva la mejor', async () => {
    // Con datos separables la pérdida de validación podría bajar para siempre: con un 30 % de etiquetas
    // cambiadas, llega un punto en que confiar más en el entrenamiento empeora la validación (sobreajuste).
    const ruidosa = validacion.map((e, i) => (i % 3 === 0 ? { ...e, categoria: e.categoria === 'SEGURIDAD' ? 'FACTURACION' as const : 'SEGURIDAD' as const } : e));
    const r = await RedSugerencias.entrenar(entrenamiento, ruidosa, {
      hiperparametros: { epocasMax: 300, paciencia: 5, tasaAprendizaje: 0.05 }, vocabulario: VOCAB,
    });
    try {
      const perdidas = r.historial.map((e) => e.perdidaValidacion!);
      const mejor = perdidas.indexOf(Math.min(...perdidas)) + 1;
      expect(r.historial.length).toBeLessThan(300);
      expect(r.historial.length - mejor).toBe(5);
      expect(r.red.metadatos.epocas).toBe(mejor);
    } finally {
      r.red.dispose();
    }
  });

  it('sin capa oculta (línea base E1, regresión logística) también aprende', async () => {
    const r = await RedSugerencias.entrenar(entrenamiento, validacion, {
      hiperparametros: { ...COMPLETO, oculta: 0, tasaAprendizaje: 0.05 }, vocabulario: VOCAB,
    });
    try {
      const p = probabilidades(r.red);
      expect(exactitud(nuevos.map((e) => e.categoria), p.map((x) => x.categoria))).toBeGreaterThanOrEqual(0.9);
    } finally {
      r.red.dispose();
    }
  });

  it('no deja tensores sin liberar (el worker corre por días)', async () => {
    const antes = tf.memory().numTensors;
    const r = await RedSugerencias.entrenar(entrenamiento, validacion, { hiperparametros: CORTO, vocabulario: VOCAB });
    r.red.predecir('Fuga', 'urgente');
    r.red.dispose();
    expect(tf.memory().numTensors).toBe(antes);
  });

  it('una opción no indicada (undefined) conserva el valor por defecto, y los valores inválidos se rechazan', async () => {
    // Así llegan las opciones de la línea de comandos que no se escribieron: antes dejaban la red sin capa oculta.
    const r = await RedSugerencias.entrenar(entrenamiento, [], {
      hiperparametros: { oculta: undefined, epocasMax: 1, semilla: undefined }, vocabulario: { minDocumentos: undefined },
    });
    try {
      expect(r.red.metadatos.hiperparametros).toMatchObject({ oculta: 64, epocasMax: 1, semilla: 42 });
      expect(r.red.metadatos.vocabulario.minDocumentos).toBe(3);
      expect(r.historial).toHaveLength(1);
    } finally {
      r.red.dispose();
    }
    await expect(RedSugerencias.entrenar(entrenamiento, [], { hiperparametros: { lote: 0 } })).rejects.toThrow(/lote/);
    await expect(RedSugerencias.entrenar(entrenamiento, [], { hiperparametros: { tasaAprendizaje: Number.NaN } })).rejects.toThrow(
      /tasaAprendizaje/,
    );
  });

  it('errores claros: sin ejemplos o con un vocabulario vacío', async () => {
    await expect(RedSugerencias.entrenar([])).rejects.toThrow(/No hay ejemplos/);
    await expect(RedSugerencias.entrenar(entrenamiento.slice(0, 2), [], { vocabulario: { minDocumentos: 50 } })).rejects.toThrow(
      /vocabulario quedó vacío/,
    );
  });
});

describe('Red neuronal · guardar y cargar', () => {
  it('cargar lo guardado da exactamente las mismas predicciones', async () => {
    await red.guardar(dir);
    const cargada = await RedSugerencias.cargar(dir);
    try {
      expect(probabilidades(cargada)).toEqual(probabilidades(red));
      expect(cargada.metadatos).toMatchObject({ nombre: 'rn-prueba', ejemplosEntrenamiento: 240, ejemplosValidacion: 30 });
    } finally {
      cargada.dispose();
    }
  });

  it('rechaza un modelo entrenado con otro catálogo de categorías', async () => {
    const otro = await mkdtemp(join(tmpdir(), 'rn-'));
    try {
      await red.guardar(otro);
      const meta = JSON.parse(await readFile(join(otro, 'metadatos.json'), 'utf8'));
      meta.categorias = ['SEGURIDAD', 'MANTENIMIENTO'];
      await writeFile(join(otro, 'metadatos.json'), JSON.stringify(meta));
      await expect(RedSugerencias.cargar(otro)).rejects.toThrow(/otro catálogo/);
    } finally {
      await rm(otro, { recursive: true, force: true });
    }
  });
});
