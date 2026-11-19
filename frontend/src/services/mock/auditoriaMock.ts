import type { AuditoriaService, EventoAuditoria, FiltroAuditoria } from '../contratos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export const AUDITORIA_DEMO: EventoAuditoria[] = [
  {
    tipo: 'ESTADO',
    entidad: 'SOLICITUD',
    codigo: 'SOL-000001',
    accion: 'Creada en NUEVA',
    actor: 'Sistema',
    detalle: null,
    fecha: '2026-11-16T15:20:00.000Z',
  },
  {
    tipo: 'ASIGNACION',
    entidad: 'SOLICITUD',
    codigo: 'SOL-000002',
    accion: 'Asignación',
    actor: 'Administración Demo',
    detalle: 'Responsable: Soporte Demo',
    fecha: '2026-11-16T14:45:00.000Z',
  },
  {
    tipo: 'ESTADO',
    entidad: 'SOLICITUD',
    codigo: 'SOL-000003',
    accion: 'ASIGNADA → EN_PROCESO',
    actor: 'Soporte Demo',
    detalle: 'Técnico revisando tablero eléctrico',
    fecha: '2026-11-16T13:10:00.000Z',
  },
  {
    tipo: 'ADMIN',
    entidad: 'RESIDENTE',
    codigo: 'RESIDENTE#1',
    accion: 'CREAR',
    actor: 'Administración Demo',
    detalle: 'unidad T1-101 (residente.t101@demo.mailflow.test)',
    fecha: '2026-11-15T18:30:00.000Z',
  },
  {
    tipo: 'ADMIN',
    entidad: 'CONJUNTO',
    codigo: 'CONJUNTO#1',
    accion: 'ACTUALIZAR_IDENTIDAD',
    actor: 'Administración Demo',
    detalle: 'Actualización de paleta institucional',
    fecha: '2026-11-15T16:00:00.000Z',
  },
  {
    tipo: 'ESTADO',
    entidad: 'SOLICITUD',
    codigo: 'SOL-000004',
    accion: 'EN_PROCESO → RESUELTA',
    actor: 'Soporte Demo',
    detalle: 'Se envió paz y salvo al residente',
    fecha: '2026-11-14T11:15:00.000Z',
  },
  {
    tipo: 'ASIGNACION',
    entidad: 'SOLICITUD',
    codigo: 'SOL-000005',
    accion: 'Asignación (liberada)',
    actor: 'Administración Demo',
    detalle: 'Responsable: Soporte Demo',
    fecha: '2026-11-13T09:05:00.000Z',
  },
];

export interface OpcionesAuditoriaMock extends OpcionesMock {
  eventos?: EventoAuditoria[];
}

export function crearAuditoriaMock(o: OpcionesAuditoriaMock = {}): AuditoriaService {
  const fuente = [...(o.eventos ?? AUDITORIA_DEMO)].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
  );

  return {
    async listar(filtro: FiltroAuditoria = {}, signal?: AbortSignal) {
      await esperar(o, signal);
      fallaRedApi(o);

      const q = filtro.q?.trim().toLowerCase() ?? '';
      const filtrados = q
        ? fuente.filter((ev) =>
            [ev.codigo, ev.actor, ev.accion, ev.detalle ?? '', ev.entidad]
              .some((campo) => campo.toLowerCase().includes(q)),
          )
        : fuente;

      const limite = Math.min(200, Math.max(1, filtro.limite ?? 20));
      const desplazamiento = Math.max(0, filtro.desplazamiento ?? 0);

      return {
        total: filtrados.length,
        eventos: structuredClone(filtrados.slice(desplazamiento, desplazamiento + limite)),
      };
    },
  };
}
