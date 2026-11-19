import type {
  AuditoriaService,
  AuthService,
  BuzonService,
  CatalogosService,
  ConjuntosService,
  CorreosService,
  IdentidadService,
  LaboratorioService,
  ReportesService,
  ResidentesService,
  ResumenService,
  SolicitudesService,
  UsuariosService,
  ValidacionService,
} from './contratos';
import { crearAuditoriaHttp } from './http/auditoriaHttp';
import { crearAuthHttp } from './http/authHttp';
import { crearBuzonHttp } from './http/buzonHttp';
import { crearCatalogosHttp } from './http/catalogosHttp';
import { crearConjuntosHttp } from './http/conjuntosHttp';
import { crearCorreosHttp } from './http/correosHttp';
import { crearIdentidadHttp } from './http/identidadHttp';
import { crearLaboratorioHttp } from './http/laboratorioHttp';
import { crearReportesHttp } from './http/reportesHttp';
import { crearResidentesHttp } from './http/residentesHttp';
import { crearResumenHttp } from './http/resumenHttp';
import { crearSolicitudesHttp } from './http/solicitudesHttp';
import { crearUsuariosHttp } from './http/usuariosHttp';
import { crearValidacionHttp } from './http/validacionHttp';
import { crearAuditoriaMock } from './mock/auditoriaMock';
import { crearAuthMock } from './mock/authMock';
import { crearBuzonMock } from './mock/buzonMock';
import { crearCatalogosMock } from './mock/catalogosMock';
import { crearConjuntosMock } from './mock/conjuntosMock';
import { crearCorreosMock } from './mock/correosMock';
import { crearEstadoPanelMock } from './mock/estadoCompartido';
import { crearIdentidadMock } from './mock/identidadMock';
import { crearLaboratorioMock } from './mock/laboratorioMock';
import { crearReportesMock } from './mock/reportesMock';
import { crearResidentesMock } from './mock/residentesMock';
import { crearResumenMock } from './mock/resumenMock';
import { actorDesdeSesionMock, crearSolicitudesMock } from './mock/solicitudesMock';
import { crearUsuariosMock } from './mock/usuariosMock';
import { crearValidacionMock } from './mock/validacionMock';
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
export const usaMock = import.meta.env.MODE === 'test' || import.meta.env.VITE_USAR_MOCK === '0';

const estadoPanelMock = usaMock ? crearEstadoPanelMock() : undefined;

export const conjuntosService: ConjuntosService = usaMock
  ? crearConjuntosMock({ ...opciones, estado: estadoPanelMock })
  : crearConjuntosHttp();
export const authService: AuthService = usaMock
  ? crearAuthMock({ ...opciones, estado: estadoPanelMock })
  : crearAuthHttp();
export const resumenService: ResumenService = usaMock ? crearResumenMock(opciones) : crearResumenHttp();
export const buzonService: BuzonService = usaMock ? crearBuzonMock(opciones) : crearBuzonHttp();
export const correosService: CorreosService = usaMock
  ? crearCorreosMock({ ...opciones, estado: estadoPanelMock })
  : crearCorreosHttp();
export const solicitudesService: SolicitudesService = usaMock
  ? crearSolicitudesMock({ ...opciones, estado: estadoPanelMock, actor: () => actorDesdeSesionMock() })
  : crearSolicitudesHttp();
export const usuariosService: UsuariosService = usaMock ? crearUsuariosMock(opciones) : crearUsuariosHttp();
export const residentesService: ResidentesService = usaMock
  ? crearResidentesMock({ ...opciones, estado: estadoPanelMock })
  : crearResidentesHttp();
export const validacionService: ValidacionService = usaMock
  ? crearValidacionMock({ ...opciones, estado: estadoPanelMock })
  : crearValidacionHttp();
export const identidadService: IdentidadService = usaMock
  ? crearIdentidadMock({ ...opciones, estado: estadoPanelMock })
  : crearIdentidadHttp();
export const catalogosService: CatalogosService = usaMock ? crearCatalogosMock(opciones) : crearCatalogosHttp();
export const reportesService: ReportesService = usaMock ? crearReportesMock(opciones) : crearReportesHttp();
export const auditoriaService: AuditoriaService = usaMock ? crearAuditoriaMock(opciones) : crearAuditoriaHttp();
export const laboratorioService: LaboratorioService = usaMock ? crearLaboratorioMock(opciones) : crearLaboratorioHttp();
