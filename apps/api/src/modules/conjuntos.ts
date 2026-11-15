import sql from 'mssql';
import { NotFound } from '../errors.js';

/** Conjunto que crea la migración 0007; recibe los datos previos y la ingesta sin conjunto explícito. */
export const SLUG_CONJUNTO_INICIAL = 'parque-central-occidente';

/** Lo que el panel puede ver de un conjunto antes de iniciar sesión (`GET /api/conjuntos`). */
export interface ConjuntoPublico {
  /** El entero de la BD como texto (contrato de `apps/web`). */
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
