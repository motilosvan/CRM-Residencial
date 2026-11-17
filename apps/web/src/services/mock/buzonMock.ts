import type { BuzonService, EstadoGateway } from '../contratos';
import { ESTADO_GATEWAY_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesBuzonMock extends OpcionesMock {
  estadoInicial?: EstadoGateway;
}

export function crearBuzonMock(o: OpcionesBuzonMock = {}): BuzonService {
  const estadoActual = o.estadoInicial ?? ESTADO_GATEWAY_DEMO;
  return {
    async estado(signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      return structuredClone(estadoActual);
    },
  };
}
