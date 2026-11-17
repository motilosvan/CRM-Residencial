/**
 * Entrena la red de sugerencias a partir de un corpus etiquetado.
 *
 *   npm run rn:entrenar -- --corpus data/corpus.jsonl --salida modelos/rn-v1
 *   npm run rn:entrenar -- --corpus data/corpus.jsonl --salida modelos/rn-v2 --semilla 7 --oculta 128
 *
 * Separa una parte del corpus (estratificada por categoría) para la parada temprana. El conjunto de PRUEBA va
 * en otro archivo y nunca se pasa aquí: se usa una sola vez, al evaluar (RN-06).
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { leerCorpus, dividirEstratificado } from '../datos.js';
import { HIPERPARAMETROS_POR_DEFECTO, RedSugerencias } from '../modelo.js';

const AYUDA = `Uso: npm run rn:entrenar -- --corpus <archivo.jsonl> --salida <directorio> [opciones]

  --validacion <0..1>   fracción para la parada temprana (por defecto 0.15)
  --semilla <n>         por defecto ${HIPERPARAMETROS_POR_DEFECTO.semilla}
  --oculta <n>          neuronas de la capa oculta; 0 = sin capa oculta (por defecto ${HIPERPARAMETROS_POR_DEFECTO.oculta})
  --epocas <n>          máximo de épocas (por defecto ${HIPERPARAMETROS_POR_DEFECTO.epocasMax})
  --min-documentos <n>  frecuencia mínima de un término (por defecto 3)
  --reemplazar          sobrescribe un modelo existente en --salida`;

function numero(nombre: string, valor: string | undefined, min: number, max: number): number | undefined {
  if (valor === undefined) return undefined;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${nombre} debe ser un número entre ${min} y ${max}`);
  return n;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      corpus: { type: 'string' },
      salida: { type: 'string' },
      validacion: { type: 'string' },
      semilla: { type: 'string' },
      oculta: { type: 'string' },
      epocas: { type: 'string' },
      'min-documentos': { type: 'string' },
      reemplazar: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', default: false },
    },
  });
  if (values.ayuda || !values.corpus || !values.salida) {
    console.log(AYUDA);
    process.exitCode = values.ayuda ? 0 : 1;
    return;
  }
  if (existsSync(join(values.salida, 'model.json')) && !values.reemplazar) {
    throw new Error(`Ya hay un modelo en ${values.salida}. Use otro nombre (p. ej. rn-v2) o --reemplazar.`);
  }

  const fraccion = numero('validacion', values.validacion, 0.05, 0.5) ?? 0.15;
  const semilla = numero('semilla', values.semilla, 0, 2 ** 31) ?? HIPERPARAMETROS_POR_DEFECTO.semilla;
  const ejemplos = leerCorpus(await readFile(values.corpus, 'utf8'));
  const { primero: entrenamiento, segundo: validacion } = dividirEstratificado(ejemplos, fraccion, semilla);
  console.log(`Corpus: ${ejemplos.length} correos → ${entrenamiento.length} entrenamiento, ${validacion.length} validación`);

  const nombre = values.salida.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) ?? 'rn';
  const inicio = Date.now();
  const { red, historial } = await RedSugerencias.entrenar(entrenamiento, validacion, {
    nombre,
    hiperparametros: {
      semilla,
      oculta: numero('oculta', values.oculta, 0, 1024),
      epocasMax: numero('epocas', values.epocas, 1, 1000),
    },
    vocabulario: { minDocumentos: numero('min-documentos', values['min-documentos'], 1, 1000) },
    alTerminarEpoca: (e) => {
      if (e.epoca === 1 || e.epoca % 10 === 0) {
        console.log(`  época ${e.epoca}: pérdida ${e.perdida.toFixed(4)}, validación ${e.perdidaValidacion?.toFixed(4) ?? '—'}`);
      }
    },
  });
  try {
    await red.guardar(values.salida);
    const mejor = historial[red.metadatos.epocas - 1];
    console.log(
      `Modelo "${nombre}" guardado en ${values.salida} (${((Date.now() - inicio) / 1000).toFixed(1)} s): ` +
        `${red.vectorizador.dimension} términos, ${historial.length} épocas, ` +
        `se conservan los pesos de la época ${red.metadatos.epocas} (validación ${mejor?.perdidaValidacion?.toFixed(4) ?? '—'}).`,
    );
  } finally {
    red.dispose();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
