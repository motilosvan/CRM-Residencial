import sql from 'mssql';
import { z } from 'zod';
import { withTx, type Tx } from '../db/withTx.js';
import { ConflictError, NotFound, ValidationError } from '../errors.js';
import { registrarAuditoria } from './auditoria.js';
import { exigirRol } from './autorizacion.js';
import { validar, type Actor } from './solicitudes.js';

/** Conjunto que crea la migración 0007; recibe los datos previos y la ingesta sin conjunto explícito. */
export const SLUG_CONJUNTO_INICIAL = 'parque-central-occidente';

/** Lo que el panel puede ver de un conjunto antes de iniciar sesión (`GET /api/conjuntos`). */
export interface ConjuntoPublico {
  /** El entero de la BD como texto (contrato de `frontend`). */
  id: string;
  slug: string;
  nombre: string;
  logoUrl?: string;
  paleta?: { primario: string; acento: string; secundario?: string };
}

export interface FilaConjunto {
  idConjunto: number;
  slug: string;
  nombre: string;
  logoUrl: string | null;
  colorPrimario: string | null;
  colorAcento: string | null;
  colorSecundario: string | null;
}

export function aPublico(f: FilaConjunto): ConjuntoPublico {
  const c: ConjuntoPublico = { id: String(f.idConjunto), slug: f.slug, nombre: f.nombre };
  if (f.logoUrl) c.logoUrl = f.logoUrl;
  // Una paleta a medias no se envía: el panel usa la de MailFlow.
  if (f.colorPrimario && f.colorAcento) {
    c.paleta = { primario: f.colorPrimario, acento: f.colorAcento };
    if (f.colorSecundario) c.paleta.secundario = f.colorSecundario;
  }
  return c;
}

/** Conjuntos activos, por nombre. */
export async function listarConjuntos(pool: sql.ConnectionPool): Promise<ConjuntoPublico[]> {
  const r = await pool.request().query<FilaConjunto>(
    `SELECT idConjunto, slug, nombre, logoUrl, colorPrimario, colorAcento, colorSecundario
       FROM dbo.CONJUNTOS WHERE activo = 1 ORDER BY nombre, idConjunto`,
  );
  return r.recordset.map(aPublico);
}

/** Id de un conjunto activo por su slug. Lanza NotFound si no existe o está inactivo. */
export async function idConjuntoPorSlug(pool: sql.ConnectionPool, slug: string): Promise<number> {
  const r = await pool
    .request()
    .input('slug', sql.VarChar(80), slug)
    .query<{ idConjunto: number }>('SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = @slug AND activo = 1');
  const fila = r.recordset[0];
  if (!fila) throw new NotFound(`No existe un conjunto activo con slug "${slug}"`);
  return fila.idConjunto;
}

export type ConjuntoIdentidad = ConjuntoPublico & { version: number };

interface FilaConjuntoIdentidad extends FilaConjunto {
  activo: boolean;
  version: number;
}

const ActorSchema = z.object({
  idUsuario: z.number().int().positive(),
  idConjunto: z.number().int().positive(),
});

const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

function tieneCaracterInvalidoUrl(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 32 || code === 127 || /\s/.test(s[i]!)) return true;
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

const ColorOpcionalSchema = z
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

export const EntradaIdentidadConjuntoSchema = z
  .object({
    nombre: z.string().trim().min(1).max(120).optional(),
    logoUrl: z.union([z.string(), z.null()]).optional().transform(validarLogoUrl),
    colorPrimario: ColorOpcionalSchema,
    colorAcento: ColorOpcionalSchema,
    colorSecundario: ColorOpcionalSchema,
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
export type EntradaIdentidadConjunto = z.input<typeof EntradaIdentidadConjuntoSchema>;

const aIdentidad = (f: FilaConjunto & { version: number }): ConjuntoIdentidad => ({
  ...aPublico(f),
  version: f.version,
});

/**
 * Serializa escrituras administrativas dentro de un conjunto tomando `UPDLOCK, HOLDLOCK` en `CONJUNTOS`
 * antes de comprobar `exigirRol`.
 */
export async function bloquearConjunto(tx: Tx, idConjunto: number): Promise<void> {
  await tx
    .request()
    .input('c', sql.Int, idConjunto)
    .query('SELECT idConjunto FROM dbo.CONJUNTOS WITH (UPDLOCK, HOLDLOCK) WHERE idConjunto = @c');
}

/** Identidad vigente del conjunto del actor (incluye `version` para concurrencia optimista). Solo ADMIN. */
export async function obtenerIdentidadConjunto(pool: sql.ConnectionPool, actor: Actor): Promise<ConjuntoIdentidad> {
  const a = validar(ActorSchema, actor);
  return withTx(
    pool,
    async (tx) => {
      await exigirRol(tx, { ...actor, idUsuario: a.idUsuario, idConjunto: a.idConjunto }, ['ADMIN'], 'consultar la identidad del conjunto');
      const r = await tx
        .request()
        .input('c', sql.Int, a.idConjunto)
        .query<FilaConjuntoIdentidad>(
          `SELECT idConjunto, slug, nombre, logoUrl, colorPrimario, colorAcento, colorSecundario, activo, version
             FROM dbo.CONJUNTOS
            WHERE idConjunto = @c`,
        );
      const fila = r.recordset[0];
      if (!fila || !fila.activo) throw new NotFound('El conjunto no existe o está inactivo');
      return aIdentidad(fila);
    },
    { isolation: 'SNAPSHOT' },
  );
}

/**
 * Actualiza nombre, logo y paleta del conjunto del actor. Solo ADMIN.
 * Nunca toca `slug`, `activo` ni `fechaCreacion` (respeta los grants por columna de `crm_app`).
 */
export async function actualizarIdentidadConjunto(
  pool: sql.ConnectionPool,
  actor: Actor,
  entrada: EntradaIdentidadConjunto,
): Promise<ConjuntoIdentidad> {
  const a = validar(ActorSchema, actor);
  const e = validar(EntradaIdentidadConjuntoSchema, entrada);
  return withTx(pool, async (tx) => {
    const actual = (
      await tx
        .request()
        .input('c', sql.Int, a.idConjunto)
        .query<FilaConjuntoIdentidad>(
          `SELECT idConjunto, slug, nombre, logoUrl, colorPrimario, colorAcento, colorSecundario, activo, version
             FROM dbo.CONJUNTOS WITH (UPDLOCK, HOLDLOCK)
            WHERE idConjunto = @c`,
        )
    ).recordset[0];
    await exigirRol(tx, { ...actor, idUsuario: a.idUsuario, idConjunto: a.idConjunto }, ['ADMIN'], 'actualizar la identidad del conjunto');
    if (!actual || !actual.activo) throw new NotFound('El conjunto no existe o está inactivo');
    if (actual.version !== e.versionEsperada) {
      throw new ConflictError(
        `La identidad del conjunto cambió (versión ${actual.version}, se esperaba ${e.versionEsperada}). Recárguela.`,
      );
    }

    const nombre = e.nombre ?? actual.nombre;
    const logoUrl = e.logoUrl !== undefined ? e.logoUrl : actual.logoUrl;
    const colorPrimario = e.colorPrimario !== undefined ? e.colorPrimario : actual.colorPrimario;
    const colorAcento = e.colorAcento !== undefined ? e.colorAcento : actual.colorAcento;
    let colorSecundario = e.colorSecundario !== undefined ? e.colorSecundario : actual.colorSecundario;

    if ((colorPrimario === null) !== (colorAcento === null)) {
      throw new ValidationError('La paleta requiere colorPrimario y colorAcento juntos (o ambos en null)');
    }
    if (colorPrimario === null && colorAcento === null) {
      colorSecundario = null;
    }

    const cambios: string[] = [];
    if (nombre !== actual.nombre) cambios.push('nombre');
    if (logoUrl !== actual.logoUrl) cambios.push('logoUrl');
    if (colorPrimario !== actual.colorPrimario) cambios.push('colorPrimario');
    if (colorAcento !== actual.colorAcento) cambios.push('colorAcento');
    if (colorSecundario !== actual.colorSecundario) cambios.push('colorSecundario');
    if (cambios.length === 0) return aIdentidad(actual);

    await tx
      .request()
      .input('c', sql.Int, a.idConjunto)
      .input('nombre', sql.NVarChar(120), nombre)
      .input('logoUrl', sql.NVarChar(500), logoUrl)
      .input('primario', sql.Char(7), colorPrimario)
      .input('acento', sql.Char(7), colorAcento)
      .input('secundario', sql.Char(7), colorSecundario)
      .query(
        `UPDATE dbo.CONJUNTOS
            SET nombre = @nombre,
                logoUrl = @logoUrl,
                colorPrimario = @primario,
                colorAcento = @acento,
                colorSecundario = @secundario,
                version = version + 1
          WHERE idConjunto = @c`,
      );

    await registrarAuditoria(tx, {
      idConjunto: a.idConjunto,
      idUsuario: a.idUsuario,
      entidad: 'CONJUNTO',
      idEntidad: a.idConjunto,
      accion: 'ACTUALIZAR',
      detalle: `Identidad actualizada (${cambios.join(', ')})`,
    });

    return aIdentidad({
      ...actual,
      nombre,
      logoUrl,
      colorPrimario,
      colorAcento,
      colorSecundario,
      version: actual.version + 1,
    });
  });
}
