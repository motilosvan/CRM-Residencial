import type { CatalogosDominio, CatalogosService } from '../contratos';
import { CATALOGOS_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesCatalogosMock extends OpcionesMock {
  inicial?: CatalogosDominio;
}

export function crearCatalogosMock(o: OpcionesCatalogosMock = {}): CatalogosService {
  const datos = structuredClone(o.inicial ?? CATALOGOS_DEMO);
  return {
    async obtener(signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      return structuredClone(datos);
    },
  };
}
