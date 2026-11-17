import sql from 'mssql';
import { z } from 'zod';
import { sqlErrorNumber, withTx, type Tx } from '../db/withTx.js';
import { ConflictError, NotFound, ValidationError } from '../errors.js';
import { registrarAuditoria } from './auditoria.js';
import { exigirRol } from './autorizacion.js';
import { bloquearConjunto } from './conjuntos.js';
import { detalleCorreo, patronLike } from './consultas.js';
import { REMITENTE_DESCONOCIDO } from './ingesta.js';
import { validar, type Actor } from './solicitudes.js';

export interface ResidenteConjunto {
  id: number;
  nombre: string;
  unidad: string;
  correo: string | null;
  telefono: string | null;
  activo: boolean;
  version: number;
  totalSolicitudes: number;
}

const ActorSchema = z.object({
  idUsuario: z.number().int().positive(),
  idConjunto: z.number().int().positive(),
});

const IdPositivoSchema = z.number().int().positive();

const FiltroResidentesSchema = z.object({
  q: z.string().trim().max(200).optional(),
  soloActivos: z.boolean().optional(),
});
export type FiltroResidentes = z.input<typeof FiltroResidentesSchema>;

const CorreoCambioSchema = z
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

const TelefonoCambioSchema = z
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

export const EntradaResidenteSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  unidad: z.string().trim().min(1).max(20),
  correo: CorreoCambioSchema.transform((v) => v ?? null),
  telefono: TelefonoCambioSchema.transform((v) => v ?? null),
});
export type EntradaResidente = z.input<typeof EntradaResidenteSchema>;

export const CambioResidenteSchema = z
  .object({
    nombre: z.string().trim().min(1).max(100).optional(),
    unidad: z.string().trim().min(1).max(20).optional(),
    correo: CorreoCambioSchema,
    telefono: TelefonoCambioSchema,
    activo: z.boolean().optional(),
    versionEsperada: IdPositivoSchema,
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
export type CambioResidente = z.input<typeof CambioResidenteSchema>;

export const VincularCorreoSchema = z
  .object({
    idResidente: IdPositivoSchema.optional(),
    residente: z
      .object({
        nombre: z.string().trim().min(1).max(100),
        unidad: z.string().trim().min(1).max(20),
        telefono: TelefonoCambioSchema.transform((v) => v ?? null),
        usarCorreoRemitente: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((e) => (e.idResidente !== undefined) !== (e.residente !== undefined), {
    message: 'indica exactamente uno de idResidente o residente',
  });
export type VincularCorreoEntrada = z.input<typeof VincularCorreoSchema>;

const SELECT_RESIDENTE = `
  SELECT r.idResidente AS id, r.nombre, r.unidad, r.correo, r.telefono, r.activo, r.version,
         COUNT(s.idSolicitud) AS totalSolicitudes
    FROM dbo.RESIDENTES r
    LEFT JOIN dbo.CORREOS c ON c.idResidente = r.idResidente AND c.idConjunto = r.idConjunto
    LEFT JOIN dbo.SOLICITUDES s ON s.idCorreo = c.idCorreo`;

const GROUP_BY_RESIDENTE = 'GROUP BY r.idResidente, r.nombre, r.unidad, r.correo, r.telefono, r.activo, r.version';

function esViolacionUnica(err: unknown): boolean {
  const n = sqlErrorNumber(err);
  return n === 2601 || n === 2627;
}

async function leerResidente(tx: Tx, idConjunto: number, idResidente: number): Promise<ResidenteConjunto> {
  const r = await tx
    .request()
    .input('c', sql.Int, idConjunto)
    .input('id', sql.Int, idResidente)
    .query<ResidenteConjunto>(
      `${SELECT_RESIDENTE}
        WHERE r.idConjunto = @c AND r.idResidente = @id
        ${GROUP_BY_RESIDENTE}`,
    );
  return r.recordset[0]!;
}

async function vincularHuerfanosPorCorreo(tx: Tx, idConjunto: number, idResidente: number, correo: string): Promise<number> {
  const r = await tx
    .request()
    .input('c', sql.Int, idConjunto)
    .input('idRes', sql.Int, idResidente)
    .input('correo', sql.NVarChar(320), correo.trim().toLowerCase())
    .query(
      `UPDATE dbo.CORREOS
          SET idResidente = @idRes
        WHERE idConjunto = @c
          AND idResidente IS NULL
          AND LOWER(LTRIM(RTRIM(remitente))) = @correo`,
    );
  return r.rowsAffected[0] ?? 0;
}

/** Lista los residentes del conjunto del actor (ADMIN) con conteo de solicitudes y búsqueda opcional. */
export async function listarResidentesConjunto(
  pool: sql.ConnectionPool,
  actor: Actor,
  filtro: FiltroResidentes = {},
): Promise<ResidenteConjunto[]> {
  const a = validar(ActorSchema, actor);
  const f = validar(FiltroResidentesSchema, filtro);
  const patron = patronLike(f.q);
  const soloActivos = f.soloActivos === true;
  return withTx(
    pool,
    async (tx) => {
      await exigirRol(tx, { ...actor, idUsuario: a.idUsuario, idConjunto: a.idConjunto }, ['ADMIN'], 'consultar los residentes del conjunto');
      const r = await tx
        .request()
        .input('c', sql.Int, a.idConjunto)
        .input('soloActivos', sql.Bit, soloActivos)
        .input('patron', sql.NVarChar(450), patron)
        .query<ResidenteConjunto>(
          `${SELECT_RESIDENTE}
            WHERE r.idConjunto = @c
              AND (@soloActivos = 0 OR r.activo = 1)
              AND (@patron IS NULL OR r.nombre LIKE @patron ESCAPE '\\'
                   OR r.unidad LIKE @patron ESCAPE '\\'
                   OR r.correo LIKE @patron ESCAPE '\\')
            ${GROUP_BY_RESIDENTE}
            ORDER BY r.unidad, r.nombre, r.idResidente`,
        );
      return r.recordset;
    },
    { isolation: 'SNAPSHOT' },
  );
}

/**
 * Registra un residente en el conjunto del actor (ADMIN). Si tiene `correo`, vincula automáticamente los
 * correos previos sin residente del mismo conjunto cuyo `remitente` coincida. Audita sin datos personales.
 */
export async function crearResidenteConjunto(
  pool: sql.ConnectionPool,
  actor: Actor,
  entrada: EntradaResidente,
): Promise<ResidenteConjunto> {
  const a = validar(ActorSchema, actor);
  const e = validar(EntradaResidenteSchema, entrada);
  try {
    return await withTx(pool, async (tx) => {
      await bloquearConjunto(tx, a.idConjunto);
      await exigirRol(tx, { ...actor, idUsuario: a.idUsuario, idConjunto: a.idConjunto }, ['ADMIN'], 'administrar los residentes del conjunto');

      const ins = await tx
        .request()
        .input('c', sql.Int, a.idConjunto)
        .input('nombre', sql.NVarChar(100), e.nombre)
        .input('unidad', sql.VarChar(20), e.unidad)
        .input('correo', sql.NVarChar(320), e.correo)
        .input('telefono', sql.VarChar(20), e.telefono)
        .query<{ id: number }>(
          `INSERT INTO dbo.RESIDENTES (idConjunto, nombre, unidad, correo, telefono)
           OUTPUT inserted.idResidente AS id
           VALUES (@c, @nombre, @unidad, @correo, @telefono)`,
        );
      const idResidente = ins.recordset[0]!.id;

      let vinculados = 0;
      if (e.correo !== null) {
        vinculados = await vincularHuerfanosPorCorreo(tx, a.idConjunto, idResidente, e.correo);
      }

      await registrarAuditoria(tx, {
        idConjunto: a.idConjunto,
        idUsuario: a.idUsuario,
        entidad: 'RESIDENTE',
        idEntidad: idResidente,
        accion: 'CREAR',
        detalle: vinculados > 0 ? `Residente registrado (${vinculados} correo(s) vinculados)` : 'Residente registrado',
      });

      return leerResidente(tx, a.idConjunto, idResidente);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw new ConflictError('Ya existe un residente con ese correo en el conjunto');
    throw err;
  }
}

/**
 * Actualiza datos y/o estado de un residente del conjunto con control optimista (`versionEsperada`).
 * Si queda activo y con correo, vincula correos huérfanos de ese remitente. Audita sin datos personales.
 */
export async function actualizarResidenteConjunto(
  pool: sql.ConnectionPool,
  actor: Actor,
  idResidente: number,
  cambio: CambioResidente,
): Promise<ResidenteConjunto> {
  const a = validar(ActorSchema, actor);
  const id = validar(IdPositivoSchema, idResidente);
  const c = validar(CambioResidenteSchema, cambio);
  try {
    return await withTx(pool, async (tx) => {
      await bloquearConjunto(tx, a.idConjunto);
      await exigirRol(tx, { ...actor, idUsuario: a.idUsuario, idConjunto: a.idConjunto }, ['ADMIN'], 'administrar los residentes del conjunto');

      const actual = (
        await tx
          .request()
          .input('id', sql.Int, id)
          .input('c', sql.Int, a.idConjunto)
          .query<{
            nombre: string;
            unidad: string;
            correo: string | null;
            telefono: string | null;
            activo: boolean;
            version: number;
          }>(
            `SELECT nombre, unidad, correo, telefono, activo, version
               FROM dbo.RESIDENTES WITH (UPDLOCK, HOLDLOCK)
              WHERE idResidente = @id AND idConjunto = @c`,
          )
      ).recordset[0];
      if (!actual) throw new NotFound('El residente no existe en el conjunto');
      if (actual.version !== c.versionEsperada) {
        throw new ConflictError(`El residente cambió (versión ${actual.version}, se esperaba ${c.versionEsperada}). Recárguelo.`);
      }

      const nombre = c.nombre ?? actual.nombre;
      const unidad = c.unidad ?? actual.unidad;
      const correo = c.correo !== undefined ? c.correo : actual.correo;
      const telefono = c.telefono !== undefined ? c.telefono : actual.telefono;
      const activo = c.activo ?? actual.activo;

      const camposCambiados: string[] = [];
      if (nombre !== actual.nombre) camposCambiados.push('nombre');
      if (unidad !== actual.unidad) camposCambiados.push('unidad');
      if (correo !== actual.correo) camposCambiados.push('correo');
      if (telefono !== actual.telefono) camposCambiados.push('telefono');
      const cambiaActivo = activo !== actual.activo;

      if (camposCambiados.length === 0 && !cambiaActivo) return leerResidente(tx, a.idConjunto, id);

      await tx
        .request()
        .input('id', sql.Int, id)
        .input('c', sql.Int, a.idConjunto)
        .input('nombre', sql.NVarChar(100), nombre)
        .input('unidad', sql.VarChar(20), unidad)
        .input('correo', sql.NVarChar(320), correo)
        .input('telefono', sql.VarChar(20), telefono)
        .input('activo', sql.Bit, activo)
        .query(
          `UPDATE dbo.RESIDENTES
              SET nombre = @nombre,
                  unidad = @unidad,
                  correo = @correo,
                  telefono = @telefono,
                  activo = @activo,
                  version = version + 1
            WHERE idResidente = @id AND idConjunto = @c`,
        );

      let vinculados = 0;
      if (activo && correo !== null) {
        vinculados = await vincularHuerfanosPorCorreo(tx, a.idConjunto, id, correo);
      }

      if (camposCambiados.length > 0) {
        await registrarAuditoria(tx, {
          idConjunto: a.idConjunto,
          idUsuario: a.idUsuario,
          entidad: 'RESIDENTE',
          idEntidad: id,
          accion: 'ACTUALIZAR',
          detalle: `Campos actualizados (${camposCambiados.join(', ')})${vinculados > 0 ? `; ${vinculados} correo(s) vinculados` : ''}`,
        });
      }
      if (cambiaActivo) {
        await registrarAuditoria(tx, {
          idConjunto: a.idConjunto,
          idUsuario: a.idUsuario,
          entidad: 'RESIDENTE',
          idEntidad: id,
          accion: activo ? 'ACTIVAR' : 'DESACTIVAR',
          detalle: activo
            ? `Residente reactivado${vinculados > 0 ? ` (${vinculados} correo(s) vinculados)` : ''}`
            : 'Residente desactivado',
        });
      }

      return leerResidente(tx, a.idConjunto, id);
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw new ConflictError('Ya existe un residente con ese correo en el conjunto');
    throw err;
  }
}

/**
 * Vincula un correo del conjunto a un residente existente (activo, mismo conjunto) o crea el residente
 * en la misma transacción usando el remitente del correo (salvo `usarCorreoRemitente === false`).
 */
export async function vincularCorreoResidente(
  pool: sql.ConnectionPool,
  actor: Actor,
  idCorreo: number,
  entrada: VincularCorreoEntrada,
) {
  const a = validar(ActorSchema, actor);
  const id = validar(IdPositivoSchema, idCorreo);
  const e = validar(VincularCorreoSchema, entrada);

  try {
    await withTx(pool, async (tx) => {
      await bloquearConjunto(tx, a.idConjunto);
      await exigirRol(tx, { ...actor, idUsuario: a.idUsuario, idConjunto: a.idConjunto }, ['ADMIN'], 'vincular correos a residentes');

      const correoFila = (
        await tx
          .request()
          .input('id', sql.Int, id)
          .input('c', sql.Int, a.idConjunto)
          .query<{ idCorreo: number; remitente: string; idResidente: number | null }>(
            'SELECT idCorreo, remitente, idResidente FROM dbo.CORREOS WITH (UPDLOCK, HOLDLOCK) WHERE idCorreo = @id AND idConjunto = @c',
          )
      ).recordset[0];
      if (!correoFila) throw new NotFound(`El correo ${id} no existe`);

      if (correoFila.idResidente !== null) {
        if (e.idResidente !== undefined && correoFila.idResidente === e.idResidente) {
          return;
        }
        throw new ConflictError('Este correo ya está vinculado a un residente. Recárguelo.');
      }

      if (e.idResidente !== undefined) {
        const res = (
          await tx
            .request()
            .input('idRes', sql.Int, e.idResidente)
            .input('c', sql.Int, a.idConjunto)
            .query<{ idResidente: number; activo: boolean }>(
              'SELECT idResidente, activo FROM dbo.RESIDENTES WITH (UPDLOCK, HOLDLOCK) WHERE idResidente = @idRes AND idConjunto = @c',
            )
        ).recordset[0];
        if (!res) throw new NotFound('El residente no pertenece al conjunto');
        if (!res.activo) throw new ValidationError('No se puede vincular un correo a un residente inactivo');

        await tx
          .request()
          .input('id', sql.Int, id)
          .input('c', sql.Int, a.idConjunto)
          .input('idRes', sql.Int, res.idResidente)
          .query('UPDATE dbo.CORREOS SET idResidente = @idRes WHERE idCorreo = @id AND idConjunto = @c');

        await registrarAuditoria(tx, {
          idConjunto: a.idConjunto,
          idUsuario: a.idUsuario,
          entidad: 'RESIDENTE',
          idEntidad: res.idResidente,
          accion: 'VINCULAR',
          detalle: `Correo #${id} vinculado a residente existente`,
        });
        return;
      }

      const nuevo = e.residente!;
      const remitenteNorm = correoFila.remitente.trim().toLowerCase();
      const usarCorreo = nuevo.usarCorreoRemitente !== false;
      if (nuevo.usarCorreoRemitente === true && remitenteNorm === REMITENTE_DESCONOCIDO) {
        throw new ValidationError('El remitente del correo no es válido para registrarse como correo del residente');
      }
      const correoResidente = usarCorreo && remitenteNorm !== REMITENTE_DESCONOCIDO ? remitenteNorm : null;

      const ins = await tx
        .request()
        .input('c', sql.Int, a.idConjunto)
        .input('nombre', sql.NVarChar(100), nuevo.nombre)
        .input('unidad', sql.VarChar(20), nuevo.unidad)
        .input('correo', sql.NVarChar(320), correoResidente)
        .input('telefono', sql.VarChar(20), nuevo.telefono)
        .query<{ id: number }>(
          `INSERT INTO dbo.RESIDENTES (idConjunto, nombre, unidad, correo, telefono)
           OUTPUT inserted.idResidente AS id
           VALUES (@c, @nombre, @unidad, @correo, @telefono)`,
        );
      const idResidenteCreado = ins.recordset[0]!.id;

      let totalVinculados = 0;
      if (correoResidente !== null) {
        const upd = await tx
          .request()
          .input('c', sql.Int, a.idConjunto)
          .input('id', sql.Int, id)
          .input('idRes', sql.Int, idResidenteCreado)
          .input('correo', sql.NVarChar(320), correoResidente)
          .query(
            `UPDATE dbo.CORREOS
                SET idResidente = @idRes
              WHERE idConjunto = @c
                AND (idCorreo = @id OR (idResidente IS NULL AND LOWER(LTRIM(RTRIM(remitente))) = @correo))`,
          );
        totalVinculados = upd.rowsAffected[0] ?? 0;
      } else {
        const upd = await tx
          .request()
          .input('c', sql.Int, a.idConjunto)
          .input('id', sql.Int, id)
          .input('idRes', sql.Int, idResidenteCreado)
          .query('UPDATE dbo.CORREOS SET idResidente = @idRes WHERE idCorreo = @id AND idConjunto = @c');
        totalVinculados = upd.rowsAffected[0] ?? 0;
      }

      await registrarAuditoria(tx, {
        idConjunto: a.idConjunto,
        idUsuario: a.idUsuario,
        entidad: 'RESIDENTE',
        idEntidad: idResidenteCreado,
        accion: 'CREAR',
        detalle: 'Residente registrado desde buzón',
      });
      await registrarAuditoria(tx, {
        idConjunto: a.idConjunto,
        idUsuario: a.idUsuario,
        entidad: 'RESIDENTE',
        idEntidad: idResidenteCreado,
        accion: 'VINCULAR',
        detalle: `Correo #${id} vinculado (${totalVinculados} correo(s) asociados)`,
      });
    });
  } catch (err) {
    if (esViolacionUnica(err)) throw new ConflictError('Ya existe un residente con ese correo en el conjunto');
    throw err;
  }

  return detalleCorreo(pool, a.idConjunto, id);
}
