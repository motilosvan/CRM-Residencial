import type {
  FiltroReporte,
  ReporteSolicitudes,
  ReportesService,
} from '../contratos';
import { ErrorApi } from '../contratos';
import { CATALOGOS_DEMO, SOLICITUDES_DEMO, USUARIOS_CONJUNTO_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

function parsearLimiteFecha(valor: string | undefined, finDeDia: boolean): Date | null {
  if (!valor || !valor.trim()) return null;
  const texto = valor.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(texto)
    ? `${texto}T${finDeDia ? '23:59:59.999' : '00:00:00.000'}Z`
    : texto;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorApi(422, 'Fecha inválida en el filtro de reportes.');
  }
  return fecha;
}

function construirReporte(filtro?: FiltroReporte): ReporteSolicitudes {
  const desde = parsearLimiteFecha(filtro?.desde, false);
  const hasta = parsearLimiteFecha(filtro?.hasta, true);
  if (desde && hasta && desde > hasta) {
    throw new ErrorApi(422, 'La fecha inicial debe ser menor o igual a la final');
  }

  const solicitudes = SOLICITUDES_DEMO.filter((s) => {
    const fc = new Date(s.fechaCreacion);
    if (desde && fc < desde) return false;
    if (hasta && fc > hasta) return false;
    return true;
  });

  const estadosOrden = CATALOGOS_DEMO.estados.map((e) => e.nombre);
  const categoriasOrden = CATALOGOS_DEMO.categorias
    .map((c) => c.nombre)
    .sort((a, b) => a.localeCompare(b));
  const prioridadesOrden = ['ALTA', 'MEDIA', 'BAJA'];

  const conteoEstado = new Map<string, number>();
  const conteoCategoria = new Map<string, number>();
  const conteoPrioridad = new Map<string, number>();
  const respPorCat = new Map<string, { total: number; sumaMin: number; dentroSla: number }>();

  let totalConRespuesta = 0;
  let sumaMinGlobal = 0;
  let dentroSlaGlobal = 0;

  for (const s of solicitudes) {
    conteoEstado.set(s.estado, (conteoEstado.get(s.estado) ?? 0) + 1);
    conteoCategoria.set(s.categoria, (conteoCategoria.get(s.categoria) ?? 0) + 1);
    conteoPrioridad.set(s.prioridad, (conteoPrioridad.get(s.prioridad) ?? 0) + 1);

    if (s.primeraRespuesta) {
      const minutos = Math.max(
        0,
        Math.round((new Date(s.primeraRespuesta).getTime() - new Date(s.fechaCreacion).getTime()) / 60_000),
      );
      const enSla = minutos <= s.slaHoras * 60 ? 1 : 0;
      totalConRespuesta += 1;
      sumaMinGlobal += minutos;
      dentroSlaGlobal += enSla;

      const actual = respPorCat.get(s.categoria) ?? { total: 0, sumaMin: 0, dentroSla: 0 };
      actual.total += 1;
      actual.sumaMin += minutos;
      actual.dentroSla += enSla;
      respPorCat.set(s.categoria, actual);
    }
  }

  const porEstado = estadosOrden.map((estado) => ({ estado, n: conteoEstado.get(estado) ?? 0 }));
  const porCategoria = categoriasOrden.map((categoria) => ({ categoria, n: conteoCategoria.get(categoria) ?? 0 }));
  const porPrioridad = prioridadesOrden.map((prioridad) => ({ prioridad, n: conteoPrioridad.get(prioridad) ?? 0 }));

  const respuesta = Array.from(respPorCat.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([categoria, d]) => ({
      categoria,
      total: d.total,
      minutosPromedio: Math.round(d.sumaMin / d.total),
      dentroSla: d.dentroSla,
      porcentajeSla: Math.round((d.dentroSla * 1000) / d.total) / 10,
    }));

  const carga = USUARIOS_CONJUNTO_DEMO.filter((u) => u.rol === 'SOPORTE' && u.activo).map((u) => {
    const suyas = solicitudes.filter((s) => s.idResponsable === u.id);
    const resueltasEnPeriodo = suyas.filter((s) => s.estado === 'RESUELTA' || s.estado === 'CERRADA').length;
    const abiertas = suyas.length - resueltasEnPeriodo;
    return {
      idUsuario: u.id,
      nombre: u.nombre,
      abiertas,
      resueltasEnPeriodo,
    };
  });

  const total = solicitudes.length;
  const resueltas = conteoEstado.get('RESUELTA') ?? 0;
  const cerradas = conteoEstado.get('CERRADA') ?? 0;
  const abiertas = total - resueltas - cerradas;

  return {
    periodo: {
      desde: desde ? desde.toISOString() : null,
      hasta: hasta ? hasta.toISOString() : null,
    },
    totales: { total, abiertas, resueltas, cerradas },
    porEstado,
    porCategoria,
    porPrioridad,
    respuesta,
    global: {
      totalConRespuesta,
      minutosPromedio: totalConRespuesta > 0 ? Math.round(sumaMinGlobal / totalConRespuesta) : null,
      dentroSla: dentroSlaGlobal,
      porcentajeSla:
        totalConRespuesta > 0 ? Math.round((dentroSlaGlobal * 1000) / totalConRespuesta) / 10 : null,
    },
    carga,
  };
}

function aCsv(r: ReporteSolicitudes): string {
  const esc = (v: string | number | null) => {
    const txt = v === null ? '' : String(v);
    return /[",\n\r]/.test(txt) ? `"${txt.replace(/"/g, '""')}"` : txt;
  };
  const filas: string[] = ['seccion,concepto,cantidad,minutos_promedio,dentro_sla,porcentaje_sla'];
  for (const e of r.porEstado) filas.push(['estado', e.estado, e.n, '', '', ''].map(esc).join(','));
  for (const c of r.porCategoria) filas.push(['categoria', c.categoria, c.n, '', '', ''].map(esc).join(','));
  for (const p of r.porPrioridad) filas.push(['prioridad', p.prioridad, p.n, '', '', ''].map(esc).join(','));
  for (const s of r.respuesta) {
    filas.push(['sla', s.categoria, s.total, s.minutosPromedio, s.dentroSla, s.porcentajeSla].map(esc).join(','));
  }
  for (const u of r.carga) {
    filas.push(['carga_abiertas', u.nombre, u.abiertas, '', '', ''].map(esc).join(','));
  }
  return filas.join('\r\n') + '\r\n';
}

export interface OpcionesReportesMock extends OpcionesMock {
  reporte?: ReporteSolicitudes;
}

export function crearReportesMock(o: OpcionesReportesMock = {}): ReportesService {
  return {
    async obtener(filtro, signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      if (o.reporte) return structuredClone(o.reporte);
      return construirReporte(filtro);
    },
    async descargarCsv(filtro, signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      const reporte = o.reporte ? structuredClone(o.reporte) : construirReporte(filtro);
      return aCsv(reporte);
    },
  };
}
