import { z } from 'zod';
import {
  ErrorApi,
  type DetalleCorreoBuzon,
  type ResidenteConjunto,
  type ResidentesService,
} from '../contratos';
import { CORREOS_DEMO, RESIDENTES_DEMO } from './datos';
import type { EstadoPanelMock } from './estadoCompartido';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

const REMITENTE_DESCONOCIDO = 'desconocido@invalid';

export interface OpcionesResidentesMock extends OpcionesMock {
  iniciales?: ResidenteConjunto[];
  correos?: DetalleCorreoBuzon[];
  estado?: EstadoPanelMock;
}

const idPositivo = z.number().int().positive();

const esquemaCorreoOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const limpio = v.trim().toLowerCase();
    if (!limpio) return null;
    const r = z.email().max(320).safeParse(limpio);
    if (!r.success) {
      for (const issue of r.error.issues) ctx.addIssue({ ...issue });
      return z.NEVER;
    }
    return r.data;
  });

const esquemaTelefonoOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const limpio = v.trim();
    if (!limpio) return null;
    if (limpio.length > 20) {
      ctx.addIssue({ code: 'custom', message: 'máximo 20 caracteres' });
      return z.NEVER;
    }
    return limpio;
  });

const esquemaEntradaResidente = z.object({
  nombre: z.string().trim().min(1).max(100),
  unidad: z.string().trim().min(1).max(20),
  correo: esquemaCorreoOpcional.transform((v) => v ?? null),
  telefono: esquemaTelefonoOpcional.transform((v) => v ?? null),
});

const esquemaCambioResidente = z
  .object({
    nombre: z.string().trim().min(1).max(100).optional(),
    unidad: z.string().trim().min(1).max(20).optional(),
    correo: esquemaCorreoOpcional,
    telefono: esquemaTelefonoOpcional,
    activo: z.boolean().optional(),
    versionEsperada: idPositivo,
  })
  .refine(
    (c) =>
      c.nombre !== undefined ||
      c.unidad !== undefined ||
      c.correo !== undefined ||
      c.telefono !== undefined ||
      c.activo !== undefined,
    { message: 'indica al menos un campo a actualizar' },
  );

const esquemaVincularCorreo = z
  .object({
    idResidente: idPositivo.optional(),
    residente: z
      .object({
        nombre: z.string().trim().min(1).max(100),
        unidad: z.string().trim().min(1).max(20),
        telefono: esquemaTelefonoOpcional.transform((v) => v ?? null),
        usarCorreoRemitente: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((e) => (e.idResidente !== undefined) !== (e.residente !== undefined), {
    message: 'indica exactamente uno de idResidente o residente',
  });

function validar<T extends z.ZodType>(esquema: T, entrada: unknown): z.output<T> {
  const r = esquema.safeParse(entrada);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ');
    throw new ErrorApi(422, `Datos inválidos — ${detalle}`);
  }
  return r.data;
}

export function crearResidentesMock(o: OpcionesResidentesMock = {}): ResidentesService {
  const residentes: ResidenteConjunto[] = o.estado
    ? o.estado.residentes
    : structuredClone(o.iniciales ?? RESIDENTES_DEMO);
  const correos: DetalleCorreoBuzon[] = o.estado
    ? o.estado.correos
    : (o.correos ?? (o.iniciales ? [] : structuredClone(CORREOS_DEMO)));
  let siguienteId = Math.max(100, ...residentes.map((r) => r.id)) + 1;

  function asignarCorreoAResidente(c: DetalleCorreoBuzon, destino: ResidenteConjunto) {
    if (c.idResidente === destino.id) return;
    if (c.idResidente !== null && c.idSolicitud !== null) {
      const anterior = residentes.find((r) => r.id === c.idResidente);
      if (anterior && anterior.totalSolicitudes > 0) anterior.totalSolicitudes -= 1;
    }
    if (c.idSolicitud !== null) {
      destino.totalSolicitudes += 1;
    }
    c.idResidente = destino.id;
    c.residente = destino.nombre;
    c.unidad = destino.unidad;
  }

  function vincularHuerfanosPorCorreo(res: ResidenteConjunto, correo: string) {
    const norm = correo.trim().toLowerCase();
    for (const c of correos) {
      if (c.idResidente === null && c.remitente.trim().toLowerCase() === norm) {
        asignarCorreoAResidente(c, res);
      }
    }
  }

  function sincronizarDatosEnCorreos(res: ResidenteConjunto) {
    for (const c of correos) {
      if (c.idResidente === res.id) {
        c.residente = res.nombre;
        c.unidad = res.unidad;
      }
    }
  }

  return {
    async listar(filtro = {}, signal) {
      await esperar(o, signal);
      fallaRedApi(o);

      const q = filtro.q?.trim().toLowerCase() ?? '';
      const soloActivos = filtro.soloActivos === true;

      const filtrados = residentes
        .filter((r) => (!soloActivos || r.activo))
        .filter((r) => {
          if (!q) return true;
          return (
            r.nombre.toLowerCase().includes(q) ||
            r.unidad.toLowerCase().includes(q) ||
            (r.correo ?? '').toLowerCase().includes(q)
          );
        })
        .slice()
        .sort((a, b) => {
          const cmpU = a.unidad.localeCompare(b.unidad, 'es');
          if (cmpU !== 0) return cmpU;
          const cmpN = a.nombre.localeCompare(b.nombre, 'es');
          return cmpN !== 0 ? cmpN : a.id - b.id;
        });

      return structuredClone(filtrados);
    },

    async crear(entrada) {
      await esperar(o);
      fallaRedApi(o);

      const e = validar(esquemaEntradaResidente, entrada);
      if (
        e.correo !== null &&
        residentes.some((r) => r.correo !== null && r.correo.trim().toLowerCase() === e.correo)
      ) {
        throw new ErrorApi(409, 'Ya existe un residente con ese correo en el conjunto');
      }

      const nuevo: ResidenteConjunto = {
        id: siguienteId++,
        nombre: e.nombre,
        unidad: e.unidad,
        correo: e.correo,
        telefono: e.telefono,
        activo: true,
        version: 1,
        totalSolicitudes: 0,
      };
      residentes.push(nuevo);
      if (nuevo.correo !== null) {
        vincularHuerfanosPorCorreo(nuevo, nuevo.correo);
      }
      return structuredClone(nuevo);
    },

    async actualizar(id, cambio) {
      await esperar(o);
      fallaRedApi(o);

      const idValido = validar(idPositivo, id);
      const c = validar(esquemaCambioResidente, cambio);
      const actual = residentes.find((r) => r.id === idValido);
      if (!actual) {
        throw new ErrorApi(404, 'El residente no existe en el conjunto');
      }
      if (actual.version !== c.versionEsperada) {
        throw new ErrorApi(
          409,
          `El residente cambió (versión ${actual.version}, se esperaba ${c.versionEsperada}). Recárguelo.`,
        );
      }

      const nombre = c.nombre ?? actual.nombre;
      const unidad = c.unidad ?? actual.unidad;
      const correo = c.correo !== undefined ? c.correo : actual.correo;
      const telefono = c.telefono !== undefined ? c.telefono : actual.telefono;
      const activo = c.activo ?? actual.activo;

      if (
        nombre === actual.nombre &&
        unidad === actual.unidad &&
        correo === actual.correo &&
        telefono === actual.telefono &&
        activo === actual.activo
      ) {
        return structuredClone(actual);
      }

      if (
        correo !== null &&
        residentes.some(
          (otro) => otro.id !== actual.id && otro.correo !== null && otro.correo.trim().toLowerCase() === correo,
        )
      ) {
        throw new ErrorApi(409, 'Ya existe un residente con ese correo en el conjunto');
      }

      actual.nombre = nombre;
      actual.unidad = unidad;
      actual.correo = correo;
      actual.telefono = telefono;
      actual.activo = activo;
      actual.version += 1;

      sincronizarDatosEnCorreos(actual);
      if (actual.activo && actual.correo !== null) {
        vincularHuerfanosPorCorreo(actual, actual.correo);
      }

      return structuredClone(actual);
    },

    async vincularCorreo(idCorreo, entrada) {
      await esperar(o);
      fallaRedApi(o);

      const id = validar(idPositivo, idCorreo);
      const e = validar(esquemaVincularCorreo, entrada);
      const correoFila = correos.find((c) => c.id === id);
      if (!correoFila) {
        throw new ErrorApi(404, `El correo ${id} no existe`);
      }

      if (correoFila.idResidente !== null) {
        if (e.idResidente !== undefined && correoFila.idResidente === e.idResidente) {
          return structuredClone(correoFila);
        }
        throw new ErrorApi(409, 'Este correo ya está vinculado a un residente. Recárguelo.');
      }

      if (e.idResidente !== undefined) {
        const res = residentes.find((r) => r.id === e.idResidente);
        if (!res) {
          throw new ErrorApi(404, 'El residente no pertenece al conjunto');
        }
        if (!res.activo) {
          throw new ErrorApi(422, 'No se puede vincular un correo a un residente inactivo');
        }
        asignarCorreoAResidente(correoFila, res);
        return structuredClone(correoFila);
      }

      const nuevoDatos = e.residente!;
      const remitenteNorm = correoFila.remitente.trim().toLowerCase();
      const usarCorreo = nuevoDatos.usarCorreoRemitente !== false;
      if (nuevoDatos.usarCorreoRemitente === true && remitenteNorm === REMITENTE_DESCONOCIDO) {
        throw new ErrorApi(422, 'El remitente del correo no es válido para registrarse como correo del residente');
      }
      const correoResidente = usarCorreo && remitenteNorm !== REMITENTE_DESCONOCIDO ? remitenteNorm : null;

      if (
        correoResidente !== null &&
        residentes.some((r) => r.correo !== null && r.correo.trim().toLowerCase() === correoResidente)
      ) {
        throw new ErrorApi(409, 'Ya existe un residente con ese correo en el conjunto');
      }

      const nuevoResidente: ResidenteConjunto = {
        id: siguienteId++,
        nombre: nuevoDatos.nombre,
        unidad: nuevoDatos.unidad,
        correo: correoResidente,
        telefono: nuevoDatos.telefono,
        activo: true,
        version: 1,
        totalSolicitudes: 0,
      };
      residentes.push(nuevoResidente);

      if (correoResidente !== null) {
        for (const c of correos) {
          if (c.id === id || (c.idResidente === null && c.remitente.trim().toLowerCase() === correoResidente)) {
            asignarCorreoAResidente(c, nuevoResidente);
          }
        }
      } else {
        asignarCorreoAResidente(correoFila, nuevoResidente);
      }

      return structuredClone(correoFila);
    },
  };
}
