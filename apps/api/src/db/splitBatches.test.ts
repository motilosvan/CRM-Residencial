import { describe, expect, it } from 'vitest';
import { splitBatches } from './splitBatches.js';

describe('splitBatches', () => {
  it('separa por GO en línea propia y descarta lotes vacíos', () => {
    const sql = 'SELECT 1;\nGO\n\nGO\nSELECT 2;\nGO\n';
    expect(splitBatches(sql)).toEqual(['SELECT 1;', 'SELECT 2;']);
  });

  it('acepta GO en cualquier capitalización y con espacios', () => {
    expect(splitBatches('SELECT 1\n  go  \nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('no parte por palabras que solo contienen GO', () => {
    const sql = "SELECT 'GO';\nPRINT 'GOOD';\nSELECT CATEGORIAS FROM GOLD";
    expect(splitBatches(sql)).toHaveLength(1);
  });

  it('no parte por un GO que está dentro de un comentario de bloque', () => {
    const sql = '/* paso 1\nGO\nfin */\nSELECT 1;\nGO\nSELECT 2;';
    expect(splitBatches(sql)).toEqual(['/* paso 1\nGO\nfin */\nSELECT 1;', 'SELECT 2;']);
  });

  it('un /* dentro de un comentario de línea no abre un bloque', () => {
    expect(splitBatches('SELECT 1; -- ojo /* esto no abre\nGO\nSELECT 2;')).toEqual([
      'SELECT 1; -- ojo /* esto no abre',
      'SELECT 2;',
    ]);
  });

  it('un comentario de bloque con guiones dentro se cierra bien (/* ---- x ---- */)', () => {
    expect(splitBatches('/* ---------- 1. Paso ---------- */\nSELECT 1;\nGO\nSELECT 2;')).toEqual([
      '/* ---------- 1. Paso ---------- */\nSELECT 1;',
      'SELECT 2;',
    ]);
  });

  it('no parte por un GO dentro de una cadena multilínea, y respeta comillas escapadas', () => {
    const sql = "PRINT 'linea 1\nGO\nit''s fin';\nGO\nSELECT 2;";
    expect(splitBatches(sql)).toEqual(["PRINT 'linea 1\nGO\nit''s fin';", 'SELECT 2;']);
  });

  it('separa correctamente todos los scripts reales del repositorio', async () => {
    const { readFile, readdir } = await import('node:fs/promises');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const dir = path.join(root, 'db', 'migrations');
    const archivos = [path.join(root, 'ScriptBaseDatosCRM.sql'), ...(await readdir(dir)).filter((f) => f.endsWith('.sql')).map((f) => path.join(dir, f))];
    for (const archivo of archivos) {
      const texto = await readFile(archivo, 'utf8');
      const lotes = splitBatches(texto);
      const separadores = texto.split(/\r?\n/).filter((l) => /^[ \t]*GO[ \t]*$/i.test(l)).length;
      expect(lotes.length, archivo).toBeGreaterThan(0);
      expect(lotes.every((l) => !/^[ \t]*GO[ \t]*$/im.test(l)), archivo).toBe(true);
      expect(lotes.length, archivo).toBeLessThanOrEqual(separadores + 1);
    }
  });

  it('acepta fines de línea CRLF', () => {
    expect(splitBatches('SELECT 1\r\nGO\r\nSELECT 2\r\n')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('devuelve lista vacía para un script vacío', () => {
    expect(splitBatches('  \n GO \n')).toEqual([]);
  });
});
