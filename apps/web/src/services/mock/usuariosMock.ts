import { ErrorApi, type UsuarioConjunto, type UsuariosService } from '../contratos';
import { CUENTAS_DESHABILITADAS_DEMO, USUARIOS_CONJUNTO_DEMO } from './datos';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesUsuariosMock extends OpcionesMock {
  iniciales?: UsuarioConjunto[];
  cuentasDeshabilitadas?: readonly string[];
}

export function crearUsuariosMock(o: OpcionesUsuariosMock = {}): UsuariosService {
  const lista: UsuarioConjunto[] = structuredClone(o.iniciales ?? USUARIOS_CONJUNTO_DEMO);
  const deshabilitadas = new Set(
    (o.cuentasDeshabilitadas ?? CUENTAS_DESHABILITADAS_DEMO).map((c) => c.trim().toLowerCase()),
  );
  for (const u of lista) {
    if (!u.cuentaActiva) deshabilitadas.add(u.correo.trim().toLowerCase());
  }
  let siguienteId = lista.reduce((max, u) => Math.max(max, u.id), 0) + 1;

  return {
    async listar(filtro = {}, signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      return lista
        .filter((u) => (filtro.incluirInactivos ? true : u.activo && u.cuentaActiva))
        .filter((u) => (!filtro.rol ? true : u.rol === filtro.rol))
        .slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id)
        .map((u) => ({ ...u }));
    },

    async agregar(entrada) {
      await esperar(o);
      fallaRedApi(o);
      const nombre = entrada.nombre.trim();
      const correo = entrada.correo.trim().toLowerCase();
      if (!nombre || !correo) {
        throw new ErrorApi(422, 'Datos inválidos — indica nombre y correo');
      }
      if (deshabilitadas.has(correo)) {
        throw new ErrorApi(422, 'Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto');
      }
      const existente = lista.find((u) => u.correo.toLowerCase() === correo);
      if (existente) {
        if (!existente.cuentaActiva) {
          throw new ErrorApi(422, 'Esa cuenta está deshabilitada en la plataforma; no se puede agregar al conjunto');
        }
        if (existente.activo) {
          throw new ErrorApi(409, 'Ese usuario ya pertenece al conjunto');
        }
        existente.rol = entrada.rol;
        existente.activo = true;
        existente.version += 1;
        return { ...existente };
      }
      const nuevo: UsuarioConjunto = {
        id: siguienteId++,
        nombre,
        correo,
        rol: entrada.rol,
        activo: true,
        version: 1,
        cuentaActiva: true,
      };
      lista.push(nuevo);
      return { ...nuevo };
    },

    async actualizar(id, cambio) {
      await esperar(o);
      fallaRedApi(o);
      const actual = lista.find((u) => u.id === id);
      if (!actual) {
        throw new ErrorApi(404, 'El usuario no pertenece al conjunto');
      }
      if (cambio.rol === undefined && cambio.activo === undefined) {
        throw new ErrorApi(422, 'Datos inválidos — entidad: indica rol o activo');
      }
      if (actual.version !== cambio.versionEsperada) {
        throw new ErrorApi(
          409,
          `La membresía cambió (versión ${actual.version}, se esperaba ${cambio.versionEsperada}). Recárguela.`,
        );
      }
      const rol = cambio.rol ?? actual.rol;
      const activo = cambio.activo ?? actual.activo;
      if (rol === actual.rol && activo === actual.activo) {
        return { ...actual };
      }
      if (actual.rol === 'ADMIN' && actual.activo && (rol !== 'ADMIN' || !activo)) {
        const otrosAdmin = lista.filter(
          (u) => u.id !== id && u.rol === 'ADMIN' && u.activo && u.cuentaActiva,
        ).length;
        if (otrosAdmin === 0) {
          throw new ErrorApi(422, 'El conjunto debe conservar al menos un administrador activo');
        }
      }
      actual.rol = rol;
      actual.activo = activo;
      actual.version += 1;
      return { ...actual };
    },
  };
}
