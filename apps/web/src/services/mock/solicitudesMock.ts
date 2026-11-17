import {
  ErrorApi,
  type CategoriaSolicitud,
  type DetalleSolicitud,
  type EstadoSolicitud,
  type FilaSolicitud,
  type PrioridadSolicitud,
  type SolicitudesService,
  type UsuarioConjunto,
} from '../contratos';
import type { Rol, Sesion } from '@/types/conjunto';
import { SOLICITUDES_DEMO, USUARIOS_CONJUNTO_DEMO } from './datos';
import { getSesionMock } from './sesionMockEstado';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface ActorSolicitudesMock {
  idUsuario: number;
  nombre?: string;
  rol: Rol;
}

export interface OpcionesSolicitudesMock extends OpcionesMock {
  iniciales?: DetalleSolicitud[];
  usuarios?: UsuarioConjunto[];
  actor?: ActorSolicitudesMock | (() => ActorSolicitudesMock);
}

const ESTADOS_VALIDOS = new Set<EstadoSolicitud>(['NUEVA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA']);
const CATEGORIAS_VALIDAS = new Set<CategoriaSolicitud>([
  'SEGURIDAD',
  'MANTENIMIENTO',
  'FACTURACION',
  'ADMINISTRATIVO',
  'SIN_CLASIFICAR',
]);
const PRIORIDADES_VALIDAS = new Set<PrioridadSolicitud>(['ALTA', 'MEDIA', 'BAJA']);

const PESO_PRIORIDAD: Record<PrioridadSolicitud, number> = { ALTA: 3, MEDIA: 2, BAJA: 1 };
const SLA_POR_PRIORIDAD: Record<PrioridadSolicitud, number> = { ALTA: 4, MEDIA: 24, BAJA: 72 };

const TRANSICIONES: ReadonlyArray<readonly [EstadoSolicitud, EstadoSolicitud]> = [
  ['NUEVA', 'ASIGNADA'],
  ['ASIGNADA', 'EN_PROCESO'],
  ['EN_PROCESO', 'RESUELTA'],
  ['RESUELTA', 'CERRADA'],
  ['RESUELTA', 'EN_PROCESO'],
  ['ASIGNADA', 'NUEVA'],
];

function destinosDesde(estado: EstadoSolicitud): EstadoSolicitud[] {
  return TRANSICIONES.filter(([o]) => o === estado)
    .map(([, d]) => d)
    .filter((d) => d !== 'ASIGNADA');
}

function puedeTransicionar(desde: EstadoSolicitud, hasta: EstadoSolicitud): boolean {
  return TRANSICIONES.some(([o, d]) => o === desde && d === hasta);
}

function prioridadPermitida(categoria: CategoriaSolicitud, prioridad: PrioridadSolicitud): PrioridadSolicitud {
  return categoria === 'SEGURIDAD' && prioridad === 'BAJA' ? 'ALTA' : prioridad;
}

function aFila(s: DetalleSolicitud): FilaSolicitud {
  return {
    id: s.id,
    codigo: s.codigo,
    asunto: s.asunto,
    remitente: s.remitente,
    estado: s.estado,
    categoria: s.categoria,
    prioridad: s.prioridad,
    slaHoras: s.slaHoras,
    version: s.version,
    fechaCreacion: s.fechaCreacion,
    primeraRespuesta: s.primeraRespuesta,
    fechaCierre: s.fechaCierre,
    responsable: s.responsable,
    idResponsable: s.idResponsable,
  };
}

const ACTOR_POR_DEFECTO: ActorSolicitudesMock = {
  idUsuario: 1,
  nombre: 'Administración Demo',
  rol: 'ADMIN',
};

/** Resuelve el actor desde `getSesionMock()` buscando su membresía numérica en `USUARIOS_CONJUNTO_DEMO`. */
export function actorDesdeSesionMock(sesion: Sesion | null = getSesionMock()): ActorSolicitudesMock {
  if (!sesion) return ACTOR_POR_DEFECTO;
  const correo = sesion.usuario.correo.trim().toLowerCase();
  const miembro = USUARIOS_CONJUNTO_DEMO.find((u) => u.correo.trim().toLowerCase() === correo);
  if (miembro) {
    return {
      idUsuario: miembro.id,
      nombre: miembro.nombre,
      rol: sesion.usuario.rol,
    };
  }
  const idNumerico = Number(sesion.usuario.id);
  return {
    idUsuario: Number.isInteger(idNumerico) && idNumerico > 0 ? idNumerico : 0,
    nombre: sesion.usuario.nombre,
    rol: sesion.usuario.rol,
  };
}

function resolverActor(actor?: ActorSolicitudesMock | (() => ActorSolicitudesMock)): ActorSolicitudesMock {
  if (!actor) return ACTOR_POR_DEFECTO;
  return typeof actor === 'function' ? actor() : actor;
}

function validarIdPositivo(valor: unknown, nombre: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor <= 0) {
    throw new ErrorApi(422, `Datos inválidos — ${nombre} debe ser un entero positivo`);
  }
  return valor;
}

export function crearSolicitudesMock(o: OpcionesSolicitudesMock = {}): SolicitudesService {
  const lista: DetalleSolicitud[] = structuredClone(o.iniciales ?? SOLICITUDES_DEMO).map((s) => ({
    ...s,
    destinos: destinosDesde(s.estado),
  }));
  const usuarios: UsuarioConjunto[] = structuredClone(o.usuarios ?? USUARIOS_CONJUNTO_DEMO);
  const ahora = o.ahora ?? Date.now;
  let siguienteAsignacion = 100;

  function buscarSolicitud(id: number): DetalleSolicitud {
    validarIdPositivo(id, 'idSolicitud');
    const encontrada = lista.find((s) => s.id === id);
    if (!encontrada) {
      throw new ErrorApi(404, `La solicitud ${id} no existe`);
    }
    return encontrada;
  }

  function exigirVersion(sol: DetalleSolicitud, versionEsperada: number) {
    validarIdPositivo(versionEsperada, 'versionEsperada');
    if (sol.version !== versionEsperada) {
      throw new ErrorApi(
        409,
        `La solicitud ${sol.id} cambió (versión ${sol.version}, se esperaba ${versionEsperada}). Recárguela.`,
      );
    }
  }

  function liberarAsignacionVigente(sol: DetalleSolicitud, fechaIso: string) {
    for (const a of sol.asignaciones) {
      if (a.liberadaEn === null) a.liberadaEn = fechaIso;
    }
  }

  return {
    async listar(filtro = {}, signal) {
      await esperar(o, signal);
      fallaRedApi(o);

      const limite = filtro.limite ?? 100;
      const desplazamiento = filtro.desplazamiento ?? 0;
      if (
        !Number.isInteger(limite) ||
        limite < 1 ||
        limite > 200 ||
        !Number.isInteger(desplazamiento) ||
        desplazamiento < 0
      ) {
        throw new ErrorApi(422, 'Parámetros de paginación inválidos');
      }
      if (filtro.estado !== undefined && !ESTADOS_VALIDOS.has(filtro.estado)) {
        throw new ErrorApi(422, 'Estado inválido');
      }
      if (filtro.categoria !== undefined && !CATEGORIAS_VALIDAS.has(filtro.categoria)) {
        throw new ErrorApi(422, 'Categoría inválida');
      }
      if (filtro.prioridad !== undefined && !PRIORIDADES_VALIDAS.has(filtro.prioridad)) {
        throw new ErrorApi(422, 'Prioridad inválida');
      }

      const actor = resolverActor(o.actor);
      const filtradas = lista
        .filter((s) => (actor.rol === 'SOPORTE' ? s.idResponsable === actor.idUsuario : true))
        .filter((s) => (filtro.estado ? s.estado === filtro.estado : true))
        .filter((s) => (filtro.categoria ? s.categoria === filtro.categoria : true))
        .filter((s) => (filtro.prioridad ? s.prioridad === filtro.prioridad : true))
        .filter((s) => (filtro.idResponsable !== undefined ? s.idResponsable === filtro.idResponsable : true))
        .slice()
        .sort((a, b) => {
          const difPeso = PESO_PRIORIDAD[b.prioridad] - PESO_PRIORIDAD[a.prioridad];
          if (difPeso !== 0) return difPeso;
          const difFecha = new Date(b.fechaCreacion).getTime() - new Date(a.fechaCreacion).getTime();
          return difFecha !== 0 ? difFecha : b.id - a.id;
        })
        .slice(desplazamiento, desplazamiento + limite)
        .map(aFila);

      return structuredClone(filtradas);
    },

    async detalle(id, signal) {
      await esperar(o, signal);
      fallaRedApi(o);

      const actor = resolverActor(o.actor);
      const sol = buscarSolicitud(id);
      if (actor.rol === 'SOPORTE' && sol.idResponsable !== actor.idUsuario) {
        throw new ErrorApi(403, 'Solo puedes consultar tus solicitudes asignadas');
      }
      return structuredClone({ ...sol, destinos: destinosDesde(sol.estado) });
    },

    async asignar(id, entrada) {
      await esperar(o);
      fallaRedApi(o);

      const actor = resolverActor(o.actor);
      validarIdPositivo(entrada.idResponsable, 'idResponsable');
      const sol = buscarSolicitud(id);
      exigirVersion(sol, entrada.versionEsperada);

      if (actor.rol !== 'ADMIN') {
        throw new ErrorApi(403, 'Solo un administrador puede asignar solicitudes');
      }
      if (!['NUEVA', 'ASIGNADA', 'EN_PROCESO'].includes(sol.estado)) {
        throw new ErrorApi(422, `No se puede asignar una solicitud en estado ${sol.estado}`);
      }

      const responsable = usuarios.find(
        (u) => u.id === entrada.idResponsable && u.activo && u.cuentaActiva,
      );
      if (!responsable) {
        throw new ErrorApi(422, `El responsable ${entrada.idResponsable} no pertenece a este conjunto o está inactivo`);
      }

      if (sol.idResponsable === responsable.id) {
        return { sinCambios: true, version: sol.version };
      }

      const ahoraIso = new Date(ahora()).toISOString();
      const anteriorId = sol.idResponsable;
      const estadoAnterior = sol.estado;
      liberarAsignacionVigente(sol, ahoraIso);

      sol.asignaciones.push({
        nombre: responsable.nombre,
        fechaAsignacion: ahoraIso,
        liberadaEn: null,
      });
      sol.idResponsable = responsable.id;
      sol.responsable = responsable.nombre;
      if (sol.estado === 'NUEVA') {
        sol.estado = 'ASIGNADA';
      }
      sol.destinos = destinosDesde(sol.estado);
      sol.historial.push({
        anterior: estadoAnterior,
        nuevo: sol.estado,
        usuario: actor.nombre ?? 'Administración Demo',
        comentario:
          anteriorId === null ? `Asignada a ${responsable.nombre}` : `Reasignada a ${responsable.nombre}`,
        fecha: ahoraIso,
      });
      sol.version += 1;

      return {
        sinCambios: false,
        version: sol.version,
        estado: sol.estado,
        idAsignacion: siguienteAsignacion++,
      };
    },

    async cambiarEstado(id, entrada) {
      await esperar(o);
      fallaRedApi(o);

      const actor = resolverActor(o.actor);
      if (!ESTADOS_VALIDOS.has(entrada.nuevoEstado)) {
        throw new ErrorApi(422, `El estado "${entrada.nuevoEstado}" no existe en el catálogo`);
      }
      if (entrada.comentario !== undefined && entrada.comentario.length > 500) {
        throw new ErrorApi(422, 'El comentario no puede superar 500 caracteres');
      }
      const sol = buscarSolicitud(id);
      exigirVersion(sol, entrada.versionEsperada);

      if (actor.rol !== 'ADMIN' && sol.idResponsable !== actor.idUsuario) {
        throw new ErrorApi(403, 'Solo puedes cambiar el estado de tus solicitudes asignadas');
      }
      if (!puedeTransicionar(sol.estado, entrada.nuevoEstado)) {
        throw new ErrorApi(422, `Transición inválida de ${sol.estado} a ${entrada.nuevoEstado}`);
      }
      if (entrada.nuevoEstado === 'ASIGNADA') {
        throw new ErrorApi(
          422,
          `Transición inválida de ${sol.estado} a ASIGNADA: use la operación de asignar un responsable`,
        );
      }

      const ahoraIso = new Date(ahora()).toISOString();
      const anterior = sol.estado;
      if (entrada.nuevoEstado === 'NUEVA' || entrada.nuevoEstado === 'CERRADA') {
        liberarAsignacionVigente(sol, ahoraIso);
        sol.idResponsable = null;
        sol.responsable = null;
      }
      if (sol.primeraRespuesta === null && (entrada.nuevoEstado === 'EN_PROCESO' || entrada.nuevoEstado === 'RESUELTA')) {
        sol.primeraRespuesta = ahoraIso;
      }
      if (entrada.nuevoEstado === 'CERRADA') {
        sol.fechaCierre = ahoraIso;
      }

      sol.estado = entrada.nuevoEstado;
      sol.destinos = destinosDesde(sol.estado);
      sol.version += 1;
      sol.historial.push({
        anterior,
        nuevo: sol.estado,
        usuario: actor.nombre ?? 'Administración Demo',
        comentario: entrada.comentario ?? null,
        fecha: ahoraIso,
      });

      return { idSolicitud: sol.id, estado: sol.estado, version: sol.version };
    },

    async reclasificar(id, entrada) {
      await esperar(o);
      fallaRedApi(o);

      const actor = resolverActor(o.actor);
      if (entrada.categoria === undefined && entrada.prioridad === undefined) {
        throw new ErrorApi(422, 'Indique una categoría o una prioridad nueva');
      }
      if (entrada.categoria !== undefined && !CATEGORIAS_VALIDAS.has(entrada.categoria)) {
        throw new ErrorApi(422, 'Categoría inválida');
      }
      if (entrada.prioridad !== undefined && !PRIORIDADES_VALIDAS.has(entrada.prioridad)) {
        throw new ErrorApi(422, 'Prioridad inválida');
      }
      if (entrada.comentario !== undefined && entrada.comentario.length > 300) {
        throw new ErrorApi(422, 'El comentario no puede superar 300 caracteres');
      }

      const sol = buscarSolicitud(id);
      exigirVersion(sol, entrada.versionEsperada);

      if (actor.rol !== 'ADMIN') {
        throw new ErrorApi(403, 'Solo un administrador puede reclasificar solicitudes');
      }
      if (sol.estado === 'CERRADA') {
        throw new ErrorApi(422, 'Una solicitud CERRADA no se reclasifica');
      }

      const categoria = entrada.categoria ?? sol.categoria;
      const prioridad = entrada.prioridad ?? sol.prioridad;
      if (categoria === sol.categoria && prioridad === sol.prioridad) {
        return { idSolicitud: sol.id, categoria, prioridad, version: sol.version, sinCambios: true };
      }

      const cambios = [
        categoria !== sol.categoria ? `categoría ${sol.categoria} → ${categoria}` : null,
        prioridad !== sol.prioridad ? `prioridad ${sol.prioridad} → ${prioridad}` : null,
      ].filter(Boolean);

      sol.categoria = categoria;
      sol.prioridad = prioridad;
      sol.slaHoras = SLA_POR_PRIORIDAD[prioridad];
      sol.version += 1;
      sol.historial.push({
        anterior: sol.estado,
        nuevo: sol.estado,
        usuario: actor.nombre ?? 'Administración Demo',
        comentario: `Reclasificada: ${cambios.join('; ')}${entrada.comentario ? `. ${entrada.comentario}` : ''}`,
        fecha: new Date(ahora()).toISOString(),
      });

      return { idSolicitud: sol.id, categoria, prioridad, version: sol.version, sinCambios: false };
    },

    async aceptarSugerencia(id, entrada) {
      await esperar(o);
      fallaRedApi(o);

      const actor = resolverActor(o.actor);
      if (entrada.comentario !== undefined && entrada.comentario.length > 300) {
        throw new ErrorApi(422, 'El comentario no puede superar 300 caracteres');
      }

      const sol = buscarSolicitud(id);
      exigirVersion(sol, entrada.versionEsperada);

      if (actor.rol !== 'ADMIN') {
        throw new ErrorApi(403, 'Solo un administrador puede aceptar sugerencias');
      }
      if (sol.estado === 'CERRADA') {
        throw new ErrorApi(422, 'Una solicitud CERRADA no se reclasifica');
      }

      const sug = sol.sugerencia;
      if (
        !sug ||
        sug.estado !== 'LISTA' ||
        !sug.categoria ||
        !sug.prioridad ||
        !CATEGORIAS_VALIDAS.has(sug.categoria as CategoriaSolicitud) ||
        !PRIORIDADES_VALIDAS.has(sug.prioridad as PrioridadSolicitud)
      ) {
        throw new ErrorApi(422, 'No hay una sugerencia lista para aceptar en esta solicitud');
      }

      const categoria = sug.categoria as CategoriaSolicitud;
      const prioridad = prioridadPermitida(categoria, sug.prioridad as PrioridadSolicitud);
      if (categoria === sol.categoria && prioridad === sol.prioridad) {
        return { idSolicitud: sol.id, categoria, prioridad, version: sol.version, sinCambios: true };
      }

      const cambios = [
        categoria !== sol.categoria ? `categoría ${sol.categoria} → ${categoria}` : null,
        prioridad !== sol.prioridad ? `prioridad ${sol.prioridad} → ${prioridad}` : null,
      ].filter(Boolean);

      sol.categoria = categoria;
      sol.prioridad = prioridad;
      sol.slaHoras = SLA_POR_PRIORIDAD[prioridad];
      sol.version += 1;
      sol.historial.push({
        anterior: sol.estado,
        nuevo: sol.estado,
        usuario: actor.nombre ?? 'Administración Demo',
        comentario: `Sugerencia IA aceptada: ${cambios.join('; ')}${entrada.comentario ? `. ${entrada.comentario}` : ''}`,
        fecha: new Date(ahora()).toISOString(),
      });

      return { idSolicitud: sol.id, categoria, prioridad, version: sol.version, sinCambios: false };
    },
  };
}
