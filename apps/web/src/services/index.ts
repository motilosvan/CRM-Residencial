import type { AuthService, ConjuntosService } from './contratos';
import { crearAuthHttp } from './http/authHttp';
import { crearConjuntosHttp } from './http/conjuntosHttp';
import { crearAuthMock } from './mock/authMock';
import { crearConjuntosMock } from './mock/conjuntosMock';
import type { OpcionesMock } from './mock/tipos';

const latenciaEnv = import.meta.env.VITE_MOCK_LATENCIA;
const maxLatencia = latenciaEnv ? Number(latenciaEnv) : NaN;
const tasaError = Number(import.meta.env.VITE_MOCK_TASA_ERROR);

const opciones: OpcionesMock = {
  latenciaMs: Number.isFinite(maxLatencia)
    ? [Math.min(300, Math.max(0, maxLatencia)), Math.max(0, maxLatencia)]
    : [300, 900],
  tasaError: Number.isFinite(tasaError) ? Math.min(1, Math.max(0, tasaError)) : 0,
  sinConjuntos: import.meta.env.VITE_MOCK_SIN_CONJUNTOS === '1',
};

export { CODIGO_DEMO } from './mock/datos';

/** Servicios simulados en pruebas o con `VITE_USAR_MOCK=1`; si no, la API real por `/api`. */
export const usaMock = import.meta.env.MODE === 'test' || import.meta.env.VITE_USAR_MOCK === '1';

export const conjuntosService: ConjuntosService = usaMock ? crearConjuntosMock(opciones) : crearConjuntosHttp();
export const authService: AuthService = usaMock ? crearAuthMock(opciones) : crearAuthHttp();
