import { ErrorApi, type CorreosService, type DetalleCorreoBuzon, type FilaCorreoBuzon } from '../contratos';
import { CORREOS_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesCorreosMock extends OpcionesMock {
  iniciales?: DetalleCorreoBuzon[];
}

function aFila(c: DetalleCorreoBuzon): FilaCorreoBuzon {
  return {
    id: c.id,
    remitente: c.remitente,
    asunto: c.asunto,
    fechaRecepcion: c.fechaRecepcion,
    idResidente: c.idResidente,
    residente: c.residente,
    unidad: c.unidad,
    idSolicitud: c.idSolicitud,
    codigo: c.codigo,
    estado: c.estado,
    categoria: c.categoria,
    prioridad: c.prioridad,
    sugerenciaEstado: c.sugerenciaEstado,
    sugerenciaCategoria: c.sugerenciaCategoria,
    extracto: c.cuerpo.slice(0, 200),
  };
}

export function crearCorreosMock(o: OpcionesCorreosMock = {}): CorreosService {
  const correos: DetalleCorreoBuzon[] = structuredClone(o.iniciales ?? CORREOS_DEMO);

  return {
    async listar(filtro = {}, signal) {
      await esperar(o, signal);
      fallaRedApi(o);

      const limite = filtro.limite ?? 50;
      const desplazamiento = filtro.desplazamiento ?? 0;
      if (!Number.isInteger(limite) || limite < 1 || limite > 200 || !Number.isInteger(desplazamiento) || desplazamiento < 0) {
        throw new ErrorApi(422, 'Parámetros de paginación inválidos');
      }

      const consulta = filtro.q?.trim().toLowerCase() ?? '';
      const filtrados = correos
        .filter((c) => {
          if (!consulta) return true;
          return (
            (c.asunto ?? '').toLowerCase().includes(consulta) ||
            c.remitente.toLowerCase().includes(consulta) ||
            (c.residente ?? '').toLowerCase().includes(consulta)
          );
        })
        .slice()
        .sort((a, b) => {
          const dif = new Date(b.fechaRecepcion).getTime() - new Date(a.fechaRecepcion).getTime();
          return dif !== 0 ? dif : b.id - a.id;
        });

      const pagina = filtrados.slice(desplazamiento, desplazamiento + limite).map(aFila);
      return {
        total: filtrados.length,
        correos: structuredClone(pagina),
      };
    },

    async detalle(id, signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      if (!Number.isInteger(id) || id <= 0) {
        throw new ErrorApi(422, 'Identificador de correo inválido');
      }
      const encontrado = correos.find((c) => c.id === id);
      if (!encontrado) {
        throw new ErrorApi(404, `El correo ${id} no existe`);
      }
      return structuredClone(encontrado);
    },
  };
}
