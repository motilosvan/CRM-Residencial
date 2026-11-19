import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, 'index.css'), 'utf8');

/** `both`/`forwards` congelan el último fotograma y dejan `transform` distinto de none: rompe `position: fixed` de los hijos. */
describe('animaciones de entrada sin transform permanente', () => {
  for (const clase of ['mf-entra', 'mf-aparece', 'mf-paso-sig', 'mf-paso-ant', 'mf-sacude', 'mf-panel-entra', 'mf-escalon']) {
    it(`.${clase} usa backwards`, () => {
      const bloque = new RegExp(`\\.${clase}\\s*{([^}]*)}`).exec(css)?.[1] ?? '';
      expect(bloque).toMatch(/animation:/);
      expect(bloque).toMatch(/\bbackwards\b/);
      expect(bloque).not.toMatch(/\b(both|forwards)\b/);
    });
  }
});
