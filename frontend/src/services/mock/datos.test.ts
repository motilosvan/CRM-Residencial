import { describe, expect, it } from 'vitest';
import { validarPaleta } from '@/tema/derivarTema';
import { CONJUNTOS_DEMO } from './datos';

describe('conjuntos de demo', () => {
  for (const c of CONJUNTOS_DEMO.filter((x) => x.paleta)) {
    it(`${c.slug} tiene una paleta que cumple AA`, () => {
      expect(validarPaleta(c.paleta!)).toEqual({ valida: true, problemas: [] });
    });
  }
});
