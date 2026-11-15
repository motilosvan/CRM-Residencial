import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import sql from 'mssql';
import { z } from 'zod';
import { withTx, type Tx } from '../db/withTx.js';
import { ErrorAcceso, ValidationError } from '../errors.js';
import type { EnviadorCodigo } from './enviador.js';
import { validar } from './solicitudes.js';

/** Valores del spec (los mismos de `apps/web/src/services/mock/authMock.ts`). */
const VIGENCIA_MS = 10 * 60_000;
const REENVIO_MS = 60_000;
const BLOQUEO_MS = 15 * 60_000;
const MAX_INTENTOS = 5;

export interface DepsAcceso {
  /** Clave del HMAC del código (AUTH_SECRETO). */
  secreto: string;
  enviador: EnviadorCodigo;
  ahora?: () => Date;
  generarCodigo?: () => string;
  /** Recibe solo el tipo de error del envío: nunca el correo ni el código. */
  registrarError?: (d: string) => void;
}

const conjuntoId = z.string().regex(/^\d{1,9}$/, 'conjunto inválido').transform(Number);
const correo = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.email('correo inválido').max(320));

const SolicitudSchema = z.object({ conjuntoId, correo });
const VerificacionSchema = z.object({
  conjuntoId,
  correo,
  codigo: z
    .string()
    .transform((s) => s.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'el código tiene 6 dígitos')),
});

export type SolicitudCodigo = z.input<typeof SolicitudSchema>;
export type VerificacionCodigo = z.input<typeof VerificacionSchema>;

/** HMAC-SHA256 de `idConjunto|correo|codigo`: lo único que se guarda del código. */
export function hashCodigo(secreto: string, idConjunto: number, correo: string, codigo: string): Buffer {
  return createHmac('sha256', secreto).update(`${idConjunto}|${correo}|${codigo}`).digest();
}

const codigoAleatorio = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/** La transacción devuelve el error en vez de lanzarlo: un throw revertiría el contador de intentos. */
type Resultado<T> = { ok: true; valor: T } | { ok: false; error: ErrorAcceso };
const fallo = (error: ErrorAcceso) => ({ ok: false, error }) as const;

const bloqueado = (hasta: Date) => new ErrorAcceso(429, 'BLOQUEADO', { intentosRestantes: 0, desbloqueoEn: hasta.getTime() });

interface FilaReto {
  idReto: string;
  codigoHash: Buffer;
  existeUsuario: boolean;
  venceEn: Date;
  reenvioDisponibleEn: Date;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
  consumidoEn: Date | null;
}

/** Nombre del conjunto si existe y está activo; si no, ValidationError (no se distingue cuál de los dos). */
async function nombreConjuntoActivo(tx: Tx, idConjunto: number): Promise<string> {
  const r = await tx
    .request()
    .input('c', sql.Int, idConjunto)
    .query<{ nombre: string }>('SELECT nombre FROM dbo.CONJUNTOS WHERE idConjunto = @c AND activo = 1');
  const fila = r.recordset[0];
  if (!fila) throw new ValidationError('Datos inválidos — conjuntoId: el conjunto no existe o no está activo');
  return fila.nombre;
}

/** Usuario activo con membresía activa en el conjunto, o null. */
async function miembroActivo(tx: Tx, idConjunto: number, correo: string): Promise<number | null> {
  const r = await tx
    .request()
    .input('c', sql.Int, idConjunto)
    .input('correo', sql.NVarChar(320), correo)
    .query<{ idUsuario: number }>(
      `SELECT u.idUsuario
         FROM dbo.USUARIOS u
         JOIN dbo.USUARIO_CONJUNTOS m ON m.idUsuario = u.idUsuario AND m.idConjunto = @c
        WHERE u.correo = @correo AND u.activo = 1 AND m.activo = 1`,
    );
  return r.recordset[0]?.idUsuario ?? null;
}

/** Lee y bloquea el reto de (conjunto, correo); HOLDLOCK también protege el hueco si aún no existe. */
async function bloquearReto(tx: Tx, idConjunto: number, correo: string): Promise<FilaReto | undefined> {
  const r = await tx
    .request()
    .input('c', sql.Int, idConjunto)
    .input('correo', sql.NVarChar(320), correo)
    .query<FilaReto>(
      `SELECT idReto, codigoHash, existeUsuario, venceEn, reenvioDisponibleEn, intentosFallidos, bloqueadoHasta, consumidoEn
         FROM dbo.RETOS_ACCESO WITH (UPDLOCK, HOLDLOCK)
        WHERE idConjunto = @c AND correo = @correo`,
    );
  return r.recordset[0];
}

/** Solo el tipo de error (nombre o código del driver), saneado: nunca el mensaje, que puede traer el correo. */
function tipoDeError(err: unknown): string {
  const e = err as { code?: unknown; name?: unknown } | null;
  const tipo = typeof e?.code === 'string' ? e.code : typeof e?.name === 'string' ? e.name : typeof err;
  return tipo.replace(/[^\w.-]/g, '').slice(0, 60) || 'desconocido';
}

/**
 * Pide un código para (conjunto, correo). La respuesta es la misma exista o no el usuario (no enumeración):
 * siempre se crea o renueva el reto, pero solo se envía el correo si `existeUsuario`. El envío ocurre tras
 * el COMMIT y sin esperarlo (`withTx` puede reejecutar la transacción y el tiempo delataría al usuario).
 */
export async function solicitarCodigo(
  pool: sql.ConnectionPool,
  deps: DepsAcceso,
  entrada: SolicitudCodigo,
): Promise<{ venceEn: number; reenvioDisponibleEn: number }> {
  const p = validar(SolicitudSchema, entrada);
  const ahora = deps.ahora?.() ?? new Date();
  const t = ahora.getTime();
  const venceEn = new Date(t + VIGENCIA_MS);
  const reenvioDisponibleEn = new Date(t + REENVIO_MS);

  const r = await withTx(pool, async (tx): Promise<Resultado<{ conjunto: string; codigo: string; existe: boolean }>> => {
    const conjunto = await nombreConjuntoActivo(tx, p.conjuntoId);
    const idUsuario = await miembroActivo(tx, p.conjuntoId, p.correo);
    const reto = await bloquearReto(tx, p.conjuntoId, p.correo);

    let desbloquear = false;
    if (reto?.bloqueadoHasta) {
      if (t < reto.bloqueadoHasta.getTime()) return fallo(bloqueado(reto.bloqueadoHasta));
      desbloquear = true;
    }
    if (reto && t < reto.reenvioDisponibleEn.getTime()) return fallo(new ErrorAcceso(429, 'REENVIO_PRONTO'));

    const codigo = (deps.generarCodigo ?? codigoAleatorio)();
    const req = tx
      .request()
      .input('c', sql.Int, p.conjuntoId)
      .input('correo', sql.NVarChar(320), p.correo)
      .input('hash', sql.VarBinary(32), hashCodigo(deps.secreto, p.conjuntoId, p.correo, codigo))
      .input('existe', sql.Bit, idUsuario !== null)
      .input('vence', sql.DateTime2, venceEn)
      .input('reenvio', sql.DateTime2, reenvioDisponibleEn);
    if (reto) {
      // intentosFallidos se conserva: pedir otro código no reinicia el contador (solo un bloqueo vencido).
      await req.input('id', sql.BigInt, reto.idReto).input('desbloquear', sql.Bit, desbloquear).query(
        `UPDATE dbo.RETOS_ACCESO
            SET codigoHash = @hash, existeUsuario = @existe, venceEn = @vence, reenvioDisponibleEn = @reenvio,
                consumidoEn = NULL,
                intentosFallidos = CASE WHEN @desbloquear = 1 THEN 0 ELSE intentosFallidos END,
                bloqueadoHasta = CASE WHEN @desbloquear = 1 THEN NULL ELSE bloqueadoHasta END
          WHERE idReto = @id`,
      );
    } else {
      await req.query(
        `INSERT INTO dbo.RETOS_ACCESO (idConjunto, correo, codigoHash, existeUsuario, venceEn, reenvioDisponibleEn)
         VALUES (@c, @correo, @hash, @existe, @vence, @reenvio)`,
      );
    }
    return { ok: true, valor: { conjunto, codigo, existe: idUsuario !== null } };
  });

  if (!r.ok) throw r.error;
  if (r.valor.existe) {
    const registrar = deps.registrarError ?? ((d: string) => console.error(d));
    const mensaje = { correo: p.correo, codigo: r.valor.codigo, conjunto: r.valor.conjunto, venceEn };
    void Promise.resolve()
      .then(() => deps.enviador.enviar(mensaje))
      .catch((err: unknown) => registrar(`acceso: no se pudo enviar el código (${tipoDeError(err)})`));
  }
  return { venceEn: venceEn.getTime(), reenvioDisponibleEn: reenvioDisponibleEn.getTime() };
}

/**
 * Verifica el código. Éxito solo si el hash coincide, el reto no está consumido ni vencido y el usuario
 * sigue siendo miembro activo; cualquier otro caso cuenta un intento fallido y al quinto bloquea 15 min.
 * Los errores se lanzan después del COMMIT para que el contador quede guardado.
 */
export async function verificarCodigo(
  pool: sql.ConnectionPool,
  deps: DepsAcceso,
  entrada: VerificacionCodigo,
): Promise<{ idUsuario: number; idConjunto: number }> {
  const p = validar(VerificacionSchema, entrada);
  const ahora = deps.ahora?.() ?? new Date();
  const t = ahora.getTime();

  const r = await withTx(pool, async (tx): Promise<Resultado<{ idUsuario: number; idConjunto: number }>> => {
    await nombreConjuntoActivo(tx, p.conjuntoId);
    const reto = await bloquearReto(tx, p.conjuntoId, p.correo);
    if (!reto) return fallo(new ErrorAcceso(400, 'CODIGO_INCORRECTO', { intentosRestantes: MAX_INTENTOS }));

    let fallidos = reto.intentosFallidos;
    if (reto.bloqueadoHasta) {
      if (t < reto.bloqueadoHasta.getTime()) return fallo(bloqueado(reto.bloqueadoHasta));
      fallidos = 0; // bloqueo vencido: el contador vuelve a empezar (como en el mock)
    }
    if (reto.consumidoEn === null && t > reto.venceEn.getTime()) return fallo(new ErrorAcceso(410, 'CODIGO_VENCIDO'));

    const coincide = timingSafeEqual(reto.codigoHash, hashCodigo(deps.secreto, p.conjuntoId, p.correo, p.codigo));
    if (coincide && reto.consumidoEn === null && reto.existeUsuario) {
      const idUsuario = await miembroActivo(tx, p.conjuntoId, p.correo);
      if (idUsuario !== null) {
        await tx
          .request()
          .input('id', sql.BigInt, reto.idReto)
          .input('ahora', sql.DateTime2, ahora)
          .query('UPDATE dbo.RETOS_ACCESO SET consumidoEn = @ahora, intentosFallidos = 0, bloqueadoHasta = NULL WHERE idReto = @id');
        return { ok: true, valor: { idUsuario, idConjunto: p.conjuntoId } };
      }
    }

    fallidos += 1;
    const bloquea = fallidos >= MAX_INTENTOS;
    const hasta = bloquea ? new Date(t + BLOQUEO_MS) : null;
    await tx
      .request()
      .input('id', sql.BigInt, reto.idReto)
      .input('fallidos', sql.TinyInt, fallidos)
      .input('hasta', sql.DateTime2, hasta)
      .input('ahora', sql.DateTime2, ahora)
      .input('bloquea', sql.Bit, bloquea)
      .query(
        `UPDATE dbo.RETOS_ACCESO
            SET intentosFallidos = @fallidos, bloqueadoHasta = @hasta,
                consumidoEn = CASE WHEN @bloquea = 1 THEN @ahora ELSE consumidoEn END
          WHERE idReto = @id`,
      );
    if (hasta) return fallo(bloqueado(hasta));
    return fallo(new ErrorAcceso(400, 'CODIGO_INCORRECTO', { intentosRestantes: MAX_INTENTOS - fallidos }));
  });

  if (!r.ok) throw r.error;
  return r.valor;
}
