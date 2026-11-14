import type { AuthService, ConjuntosService } from './contratos';
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

export const conjuntosService: ConjuntosService = crearConjuntosMock(opciones);
export const authService: AuthService = crearAuthMock(opciones);
