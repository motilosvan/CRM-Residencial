import type { AuthService, ConjuntosService } from './contratos';
import { crearAuthMock } from './mock/authMock';
import { crearConjuntosMock } from './mock/conjuntosMock';
import type { OpcionesMock } from './mock/tipos';

const maxLatencia = Number(import.meta.env.VITE_MOCK_LATENCIA);
const tasaError = Number(import.meta.env.VITE_MOCK_TASA_ERROR);

const opciones: OpcionesMock = {
  latenciaMs: Number.isFinite(maxLatencia) && import.meta.env.VITE_MOCK_LATENCIA
    ? [Math.min(300, maxLatencia), maxLatencia]
    : [300, 900],
  tasaError: Number.isFinite(tasaError) ? tasaError : 0,
  sinConjuntos: import.meta.env.VITE_MOCK_SIN_CONJUNTOS === '1',
};

export const conjuntosService: ConjuntosService = crearConjuntosMock(opciones);
export const authService: AuthService = crearAuthMock(opciones);
