import type { AuthService, BuzonService, ConjuntosService, ResumenService, UsuariosService } from './contratos';
import { crearAuthHttp } from './http/authHttp';
import { crearBuzonHttp } from './http/buzonHttp';
import { crearConjuntosHttp } from './http/conjuntosHttp';
import { crearResumenHttp } from './http/resumenHttp';
import { crearUsuariosHttp } from './http/usuariosHttp';
import { crearAuthMock } from './mock/authMock';
import { crearBuzonMock } from './mock/buzonMock';
import { crearConjuntosMock } from './mock/conjuntosMock';
import { crearResumenMock } from './mock/resumenMock';
import { crearUsuariosMock } from './mock/usuariosMock';
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
export const resumenService: ResumenService = usaMock ? crearResumenMock(opciones) : crearResumenHttp();
export const buzonService: BuzonService = usaMock ? crearBuzonMock(opciones) : crearBuzonHttp();
export const usuariosService: UsuariosService = usaMock ? crearUsuariosMock(opciones) : crearUsuariosHttp();
