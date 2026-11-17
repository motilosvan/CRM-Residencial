import { z } from 'zod';
import { ErrorApi, type ConjuntoIdentidad, type IdentidadService } from '../contratos';
import { CONJUNTOS_DEMO } from './datos';
import type { EstadoPanelMock } from './estadoCompartido';
import { getSesionMock, setSesionMock } from './sesionMockEstado';
import type { OpcionesMock } from './tipos';
import { esperar, fallaRedApi } from './util';

export interface OpcionesIdentidadMock extends OpcionesMock {
  estado?: EstadoPanelMock;
  inicial?: ConjuntoIdentidad;
  conjuntoId?: string | (() => string);
}

const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

function tieneCaracterInvalidoUrl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127 || /\s/.test(s[i])) return true;
  }
  return false;
}

function validarLogoUrl(raw: string | null | undefined, ctx: z.RefinementCtx): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.length > 500 || tieneCaracterInvalidoUrl(s)) {
    ctx.addIssue({ code: 'custom', message: 'URL de logo inválida (máximo 500 caracteres, sin espacios)' });
    return z.NEVER;
  }
  if (s.startsWith('/')) {
    if (s.startsWith('//') || s.includes('\\')) {
      ctx.addIssue({ code: 'custom', message: 'la ruta relativa del logo debe iniciar con / simple' });
      return z.NEVER;
    }
    return s;
  }
  try {
    const u = new URL(s);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.length > 0) return s;
  } catch {
    // URL inválida: reporta debajo.
  }
  ctx.addIssue({ code: 'custom', message: 'el logo debe ser una URL http(s):// o una ruta relativa /...' });
  return z.NEVER;
}

const esquemaColorOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const s = v.trim();
    if (!COLOR_HEX.test(s)) {
      ctx.addIssue({ code: 'custom', message: 'debe ser un color hexadecimal #RRGGBB de 6 dígitos' });
      return z.NEVER;
    }
    return s.toUpperCase();
  });

const esquemaEntradaIdentidad = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    logoUrl: z.union([z.string(), z.null()]).optional().transform(validarLogoUrl),
    colorPrimario: esquemaColorOpcional,
    colorAcento: esquemaColorOpcional,
    colorSecundario: esquemaColorOpcional,
    versionEsperada: z.number().int().positive(),
  })
  .refine(
    (e) =>
      e.nombre !== undefined ||
      e.logoUrl !== undefined ||
      e.colorPrimario !== undefined ||
      e.colorAcento !== undefined ||
      e.colorSecundario !== undefined,
    { message: 'indica al menos un campo de identidad a actualizar' },
  );

function validar<T extends z.ZodType>(esquema: T, entrada: unknown): z.output<T> {
  const r = esquema.safeParse(entrada);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ');
    throw new ErrorApi(422, `Datos inválidos — ${detalle}`);
  }
  return r.data;
}

function clonarIdentidad(c: ConjuntoIdentidad): ConjuntoIdentidad {
  const res: ConjuntoIdentidad = {
    id: c.id,
    slug: c.slug,
    nombre: c.nombre,
    version: c.version,
  };
  if (c.logoUrl) res.logoUrl = c.logoUrl;
  if (c.paleta) res.paleta = { ...c.paleta };
  return res;
}

export function crearIdentidadMock(o: OpcionesIdentidadMock = {}): IdentidadService {
  const conjuntos: ConjuntoIdentidad[] = o.estado
    ? o.estado.conjuntos
    : o.inicial
      ? [structuredClone(o.inicial)]
      : CONJUNTOS_DEMO.map((c) => ({ ...structuredClone(c), version: 1 }));

  function obtenerActual(): ConjuntoIdentidad {
    const objetivoId =
      typeof o.conjuntoId === 'function'
        ? o.conjuntoId()
        : (o.conjuntoId ?? getSesionMock()?.conjuntoActivo.id ?? conjuntos[0]?.id ?? '');
    const encontrado = conjuntos.find((c) => c.id === objetivoId);
    if (!encontrado) {
      throw new ErrorApi(404, 'El conjunto no existe o está inactivo');
    }
    return encontrado;
  }

  return {
    async obtener(signal) {
      await esperar(o, signal);
      fallaRedApi(o);
      return clonarIdentidad(obtenerActual());
    },

    async actualizar(entrada) {
      await esperar(o);
      fallaRedApi(o);

      const e = validar(esquemaEntradaIdentidad, entrada);
      const actual = obtenerActual();
      if (actual.version !== e.versionEsperada) {
        throw new ErrorApi(
          409,
          `La identidad del conjunto cambió (versión ${actual.version}, se esperaba ${e.versionEsperada}). Recárguela.`,
        );
      }

      const nombre = e.nombre ?? actual.nombre;
      const logoUrlActual = actual.logoUrl ?? null;
      const logoUrl = e.logoUrl !== undefined ? e.logoUrl : logoUrlActual;
      const primarioActual = actual.paleta?.primario ?? null;
      const acentoActual = actual.paleta?.acento ?? null;
      const secundarioActual = actual.paleta?.secundario ?? null;

      const colorPrimario = e.colorPrimario !== undefined ? e.colorPrimario : primarioActual;
      const colorAcento = e.colorAcento !== undefined ? e.colorAcento : acentoActual;
      let colorSecundario = e.colorSecundario !== undefined ? e.colorSecundario : secundarioActual;

      if ((colorPrimario === null) !== (colorAcento === null)) {
        throw new ErrorApi(422, 'La paleta requiere colorPrimario y colorAcento juntos (o ambos en null)');
      }
      if (colorPrimario === null && colorAcento === null) {
        colorSecundario = null;
      }

      if (
        nombre === actual.nombre &&
        logoUrl === logoUrlActual &&
        colorPrimario === primarioActual &&
        colorAcento === acentoActual &&
        colorSecundario === secundarioActual
      ) {
        return clonarIdentidad(actual);
      }

      actual.nombre = nombre;
      if (logoUrl) {
        actual.logoUrl = logoUrl;
      } else {
        delete actual.logoUrl;
      }
      if (colorPrimario && colorAcento) {
        actual.paleta = {
          primario: colorPrimario,
          acento: colorAcento,
          ...(colorSecundario ? { secundario: colorSecundario } : {}),
        };
      } else {
        delete actual.paleta;
      }
      actual.version += 1;

      const sesion = getSesionMock();
      if (sesion) {
        const pub = {
          id: actual.id,
          slug: actual.slug,
          nombre: actual.nombre,
          ...(actual.logoUrl ? { logoUrl: actual.logoUrl } : {}),
          ...(actual.paleta ? { paleta: { ...actual.paleta } } : {}),
        };
        setSesionMock({
          ...sesion,
          conjuntoActivo: sesion.conjuntoActivo.id === pub.id ? pub : sesion.conjuntoActivo,
          conjuntos: sesion.conjuntos.map((c) => (c.id === pub.id ? pub : c)),
        });
      }

      return clonarIdentidad(actual);
    },
  };
}
