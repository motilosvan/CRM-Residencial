import type { ConjuntosService } from '../contratos';
import { CONJUNTOS_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRed } from './util';

export type { OpcionesMock } from './tipos';

export function crearConjuntosMock(o: OpcionesMock = {}): ConjuntosService {
  return {
    async listar(signal) {
      await esperar(o, signal);
      fallaRed(o);
      return o.sinConjuntos ? [] : CONJUNTOS_DEMO.map((c) => ({ ...c }));
    },
  };
}
