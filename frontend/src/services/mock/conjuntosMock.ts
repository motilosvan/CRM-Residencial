import type { Conjunto } from '@/types/conjunto';
import type { ConjuntosService } from '../contratos';
import { CONJUNTOS_DEMO } from './datos';
import type { EstadoPanelMock } from './estadoCompartido';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRed } from './util';

export type { OpcionesMock } from './tipos';

export interface OpcionesConjuntosMock extends OpcionesMock {
  estado?: EstadoPanelMock;
}

function aConjuntoPublico(c: Conjunto): Conjunto {
  const pub: Conjunto = { id: c.id, slug: c.slug, nombre: c.nombre };
  if (c.logoUrl) pub.logoUrl = c.logoUrl;
  if (c.paleta) pub.paleta = { ...c.paleta };
  return pub;
}

export function crearConjuntosMock(o: OpcionesConjuntosMock = {}): ConjuntosService {
  return {
    async listar(signal) {
      await esperar(o, signal);
      fallaRed(o);
      if (o.sinConjuntos) return [];
      const fuente = o.estado ? o.estado.conjuntos : CONJUNTOS_DEMO;
      return fuente.map(aConjuntoPublico);
    },
  };
}
