import type { ResumenConjunto, ResumenService } from '../contratos';
import { RESUMEN_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesResumenMock extends OpcionesMock {
  datos?: ResumenConjunto;
}

export function crearResumenMock(o: OpcionesResumenMock = {}): ResumenService {
  const fuente = o.datos ?? RESUMEN_DEMO;
  return {
    async obtener(signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      return structuredClone(fuente);
    },
  };
}
