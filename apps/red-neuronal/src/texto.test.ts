import { describe, expect, it } from 'vitest';
import { LIMITE_TEXTO as LIMITE_DEL_WORKER } from '../../worker-ia/src/procesar.js';
import { construirVocabulario, LIMITE_TEXTO, terminos, Vectorizador, type Vocabulario } from './texto.js';

const norma = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe('Red neuronal · terminos (representación del texto)', () => {
  it('minúsculas, sin tildes, sin palabras vacías, números ni letras sueltas; con pares de palabras', () => {
    expect(terminos('', 'Hay una FUGA de agua en la tubería del 301, y')).toEqual([
      'fuga', 'agua', 'tuberia', 'fuga_agua', 'agua_tuberia',
    ]);
  });

  it('conserva las negaciones: "sin luz" y "no funciona" dicen algo', () => {
    const t = terminos('', 'Estamos sin luz y el ascensor no funciona');
    expect(t).toEqual(expect.arrayContaining(['sin_luz', 'no_funciona', 'sin', 'no']));
  });

  it('el asunto cuenta dos veces y no forma pares con el cuerpo', () => {
    const t = terminos('Robo bicicleta', 'parqueadero');
    expect(t.filter((x) => x === 'robo_bicicleta')).toHaveLength(2);
    expect(t).not.toContain('bicicleta_parqueadero');
  });

  it('recorta el cuerpo igual que el worker antes de llamar al proveedor', () => {
    expect(LIMITE_TEXTO).toBe(LIMITE_DEL_WORKER);
    const t = terminos('', `${'relleno '.repeat(LIMITE_TEXTO / 8)}incendio`);
    expect(t).not.toContain('incendio');
  });
});

describe('Red neuronal · vocabulario', () => {
  const docs = [
    ['fuga', 'agua', 'juan'],
    ['fuga', 'agua'],
    ['fuga', 'robo', 'fuga'],
    ['robo', 'agua'],
  ];

  it('solo términos en ≥ minDocumentos correos (un nombre suelto queda fuera); más frecuentes primero', () => {
    const v = construirVocabulario(docs, { minDocumentos: 2, maxTerminos: 10 });
    expect(v.terminos).toEqual(['agua', 'fuga', 'robo']); // agua y fuga en 3 correos (desempate alfabético), robo en 2
    expect(v.documentos).toBe(4);
    // IDF suavizado: ln((1+N)/(1+df)) + 1. "fuga" aparece dos veces en un correo pero ese correo cuenta una vez: df = 3.
    expect(v.idf[1]).toBeCloseTo(Math.log(5 / 4) + 1);
    expect(v.idf[2]).toBeCloseTo(Math.log(5 / 3) + 1);
  });

  it('respeta el tamaño máximo y es determinista', () => {
    expect(construirVocabulario(docs, { minDocumentos: 1, maxTerminos: 2 }).terminos).toEqual(['agua', 'fuga']);
    expect(construirVocabulario(docs)).toEqual(construirVocabulario([...docs]));
  });

  it('sin correos no hay vocabulario', () => {
    expect(() => construirVocabulario([])).toThrow(/No hay correos/);
  });
});

describe('Red neuronal · Vectorizador (TF-IDF)', () => {
  const vocabulario: Vocabulario = { version: 1, documentos: 4, terminos: ['agua', 'fuga', 'robo'], idf: [1.2, 1.2, 1.5] };

  it('norma 1, cuenta repeticiones y pondera por IDF; términos desconocidos no cuentan', () => {
    const v = new Vectorizador(vocabulario).vectorizarTerminos(['fuga', 'fuga', 'robo', 'desconocido']);
    expect(norma(v)).toBeCloseTo(1, 5);
    expect(v[0]).toBe(0);
    expect(v[1]! / v[2]!).toBeCloseTo((2 * 1.2) / 1.5, 5);
  });

  it('un correo sin términos conocidos da el vector cero', () => {
    expect([...new Vectorizador(vocabulario).vectorizar('Hola', 'buenos días')]).toEqual([0, 0, 0]);
  });

  it('guardado como JSON da exactamente los mismos vectores', () => {
    const original = new Vectorizador(vocabulario);
    const copia = new Vectorizador(JSON.parse(JSON.stringify(original.vocabulario)));
    expect(copia.vectorizar('Fuga', 'agua y robo')).toEqual(original.vectorizar('Fuga', 'agua y robo'));
  });

  it('rechaza un vocabulario corrupto', () => {
    expect(() => new Vectorizador({ ...vocabulario, idf: [1] })).toThrow(/mismo largo/);
    expect(() => new Vectorizador({ ...vocabulario, terminos: ['a', 'a', 'b'] })).toThrow(/repetidos/);
  });
});
