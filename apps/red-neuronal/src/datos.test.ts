import { describe, expect, it } from 'vitest';
import { barajar, dividirEstratificado, generador, leerCorpus, pesosPorClase } from './datos.js';

const linea = (o: object) => JSON.stringify({ id: 'c-1', asunto: 'Fuga', cuerpo: 'Hay agua', categoria: 'MANTENIMIENTO', prioridad: 'ALTA', ...o });

describe('Red neuronal · leerCorpus (JSONL)', () => {
  it('lee los ejemplos e ignora las líneas vacías', () => {
    const c = leerCorpus(`${linea({})}\r\n\n${linea({ id: 'c-2', categoria: 'SEGURIDAD' })}\n`);
    expect(c.map((e) => [e.id, e.categoria])).toEqual([['c-1', 'MANTENIMIENTO'], ['c-2', 'SEGURIDAD']]);
  });

  it('los errores dicen línea y campo, nunca el texto del correo', () => {
    const contenido = [linea({}), linea({ id: 'c-2', categoria: 'PLOMERIA', cuerpo: 'Llamar al 300 555 0123' }), '{roto', linea({})].join('\n');
    const err = (() => {
      try {
        leerCorpus(contenido);
      } catch (e) {
        return (e as Error).message;
      }
      return '';
    })();
    expect(err).toContain('línea 2: campo inválido o faltante: categoria');
    expect(err).toContain('línea 3: no es JSON válido');
    expect(err).toContain('línea 4: id repetido (c-1)');
    expect(err).not.toContain('300 555');
  });
});

describe('Red neuronal · azar con semilla', () => {
  it('misma semilla ⇒ misma secuencia; barajar es una permutación determinista', () => {
    const a = generador(7);
    const b = generador(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const xs = Array.from({ length: 20 }, (_, i) => i);
    const p = barajar(xs, generador(1));
    expect(p).toEqual(barajar(xs, generador(1)));
    expect([...p].sort((x, y) => x - y)).toEqual(xs);
    expect(p).not.toEqual(xs);
  });
});

describe('Red neuronal · dividirEstratificado', () => {
  const ejemplos = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, categoria: 'MANTENIMIENTO' })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, categoria: 'SEGURIDAD' })),
    { id: 'f0', categoria: 'FACTURACION' },
  ];

  it('separa la misma fracción de cada categoría, sin repetir ni perder ejemplos', () => {
    const { primero, segundo } = dividirEstratificado(ejemplos, 0.2, 42);
    const cuenta = (xs: typeof ejemplos, c: string) => xs.filter((e) => e.categoria === c).length;
    expect(cuenta(segundo, 'MANTENIMIENTO')).toBe(4);
    expect(cuenta(segundo, 'SEGURIDAD')).toBe(2);
    expect(cuenta(segundo, 'FACTURACION')).toBe(0); // un solo ejemplo: queda en entrenamiento
    expect(new Set([...primero, ...segundo].map((e) => e.id)).size).toBe(ejemplos.length);
    expect(dividirEstratificado(ejemplos, 0.2, 42)).toEqual({ primero, segundo });
  });

  it('rechaza fracciones fuera de (0, 1)', () => {
    expect(() => dividirEstratificado(ejemplos, 1, 1)).toThrow(/fracción/);
  });
});

describe('Red neuronal · pesosPorClase', () => {
  it('clases balanceadas pesan 1; la minoritaria pesa más; una ausente pesa 1; con tope de 10', () => {
    expect(pesosPorClase([0, 1, 2, 0, 1, 2], 3)).toEqual([1, 1, 1]);
    const w = pesosPorClase([0, 0, 0, 1], 2); // n=4, k=2: 4/(2·3) y 4/(2·1)
    expect(w[0]).toBeCloseTo(2 / 3);
    expect(w[1]).toBe(2);
    expect(pesosPorClase([0, 0], 3)[1]).toBe(1);
    expect(pesosPorClase([...new Array(100).fill(0), 1], 2)[1]).toBe(10);
  });
});
