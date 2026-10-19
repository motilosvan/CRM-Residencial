import { createHash } from 'node:crypto';
import sql from 'mssql';
import { z } from 'zod';
import { clasificar, type Categoria } from '../domain/clasificador.js';
import { priorizar, type Prioridad } from '../domain/priorizador.js';
import { sqlErrorNumber, withTx, type Tx } from '../db/withTx.js';
import { paso, type Hooks } from './hooks.js';

/** Remitente de reserva cuando el `From` no es una dirección utilizable: el correo se guarda igual. */
export const REMITENTE_DESCONOCIDO = 'desconocido@invalid';
const LIMITE_ASUNTO = 500; // = CORREOS.asunto NVARCHAR(500)
const LIMITE_CUERPO = 1_000_000; // tope defensivo (adjuntos en línea, correos gigantes)
const LIMITE_MESSAGE_ID = 255; // = CORREOS.messageId NVARCHAR(255)

/** Recorta a `n` unidades UTF-16 (lo que cuenta NVARCHAR) sin partir un emoji (par sustituto). */
export function truncarUtf16(s: string, n: number): string {
  if (s.length <= n) return s;
  const corte = s.slice(0, n);
  const ultimo = corte.charCodeAt(corte.length - 1);
  return ultimo >= 0xd800 && ultimo <= 0xdbff ? corte.slice(0, -1) : corte;
}

/** Un Message-ID más largo que la columna se reemplaza por un hash estable (sigue siendo idempotente). */
function normalizarMessageId(id: string): string {
  return id.length <= LIMITE_MESSAGE_ID ? id : `sha256:${createHash('sha256').update(id).digest('hex')}`;
}

function normalizarRemitente(r: string | undefined): string {
  const limpio = (r ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+$/.test(limpio) && limpio.length <= 320 ? limpio : REMITENTE_DESCONOCIDO;
}

/**
 * Entrada de T1. Regla 8: un correo nunca se descarta por su contenido. Lo que no cabe se recorta
 * y lo que no es válido se normaliza. Lo único obligatorio es un messageId (el gateway sintetiza uno
 * estable si el correo no trae cabecera Message-ID).
 */
export const CorreoEntranteSchema = z.object({
  messageId: z.string().trim().min(1).transform(normalizarMessageId),
  imapUid: z.number().int().nonnegative().optional(),
  remitente: z.string().optional().transform(normalizarRemitente),
  asunto: z.string().default('').transform((s) => truncarUtf16(s, LIMITE_ASUNTO)),
  cuerpo: z.string().default('').transform((s) => truncarUtf16(s, LIMITE_CUERPO)),
  recibidoEn: z.date().optional(),
  /** T6: avance del checkpoint IMAP, en la MISMA transacción que el correo. */
  checkpoint: z
    .object({
      cuenta: z.string().min(1).max(255),
      uidValidity: z.number().int().positive(),
      uid: z.number().int().nonnegative(),
    })
    .optional(),
});
export type CorreoEntrante = z.input<typeof CorreoEntranteSchema>;

export type ResultadoIngesta =
  | { duplicado: true }
  | {
      duplicado: false;
      idCorreo: number;
      idSolicitud: number;
      categoria: Categoria;
      prioridad: Prioridad;
      idResidente: number | null;
    };

/** 2601 = índice único; 2627 = restricción UNIQUE/PK. */
const esDuplicado = (err: unknown) => [2601, 2627].includes(sqlErrorNumber(err) ?? 0);

/** Un correo nunca se descarta: si el clasificador falla, queda SIN_CLASIFICAR. */
function clasificarSeguro(asunto: string, cuerpo: string): { categoria: Categoria; prioridad: Prioridad } {
  try {
    const categoria = clasificar(asunto, cuerpo);
    return { categoria, prioridad: priorizar(categoria, asunto, cuerpo) };
  } catch {
    return { categoria: 'SIN_CLASIFICAR', prioridad: 'MEDIA' };
  }
}

/**
 * Upsert del checkpoint. UPDLOCK+HOLDLOCK cierra la carrera de la primera inserción de una cuenta
 * (sin ellos, dos T1 simultáneas podían chocar en la PK y perder el correo). Si cambia UIDVALIDITY
 * los UID del buzón se reinician: se reinicia también ultimoUid (la idempotencia absorbe relecturas).
 */
async function avanzarCheckpoint(tx: Tx, c: NonNullable<z.output<typeof CorreoEntranteSchema>['checkpoint']>) {
  await tx
    .request()
    .input('cuenta', sql.NVarChar(255), c.cuenta)
    .input('validity', sql.BigInt, c.uidValidity)
    .input('uid', sql.BigInt, c.uid)
    .query(
      `UPDATE GATEWAY_CHECKPOINT WITH (UPDLOCK, HOLDLOCK)
          SET ultimoUid = CASE WHEN uidValidity <> @validity THEN @uid
                               WHEN @uid > ultimoUid THEN @uid
                               ELSE ultimoUid END,
              uidValidity = @validity, actualizadoEn = SYSUTCDATETIME()
        WHERE cuenta = @cuenta;
       IF @@ROWCOUNT = 0
         INSERT INTO GATEWAY_CHECKPOINT (cuenta, uidValidity, ultimoUid) VALUES (@cuenta, @validity, @uid);`,
    );
}

/**
 * T1 — Ingesta idempotente: correo → solicitud NUEVA + historial inicial (+ checkpoint).
 * Todo en una transacción. Reprocesar el mismo messageId (reinicio, reintento, carrera) devuelve
 * `{ duplicado: true }` sin crear nada: la unicidad la garantiza la BD, no el código.
 */
export async function ingestarCorreo(
  pool: sql.ConnectionPool,
  entrada: CorreoEntrante,
  hooks?: Hooks,
): Promise<ResultadoIngesta> {
  const c = CorreoEntranteSchema.parse(entrada);
  const { categoria, prioridad } = clasificarSeguro(c.asunto, c.cuerpo);

  return withTx(pool, async (tx) => {
    let insertado;
    try {
      insertado = await tx
        .request()
        .input('messageId', sql.NVarChar(255), c.messageId)
        .input('imapUid', sql.BigInt, c.imapUid ?? null)
        .input('remitente', sql.NVarChar(320), c.remitente)
        .input('asunto', sql.NVarChar(LIMITE_ASUNTO), c.asunto)
        .input('cuerpo', sql.NVarChar(sql.MAX), c.cuerpo)
        .input('recibidoEn', sql.DateTime2, c.recibidoEn ?? new Date())
        .query<{ idCorreo: number; idResidente: number | null }>(
          `INSERT INTO CORREOS (idResidente, remitente, asunto, cuerpo, fechaRecepcion, messageId, imapUid)
           OUTPUT inserted.idCorreo, inserted.idResidente
           VALUES ((SELECT idResidente FROM RESIDENTES WHERE correo = @remitente),
                   @remitente, @asunto, @cuerpo, @recibidoEn, @messageId, @imapUid)`,
        );
    } catch (err) {
      if (!esDuplicado(err)) throw err;
      // Ya existía: el INSERT fallido no dejó nada; solo se avanza el checkpoint.
      if (c.checkpoint) await avanzarCheckpoint(tx, c.checkpoint);
      return { duplicado: true } as const;
    }
    const { idCorreo, idResidente } = insertado.recordset[0]!;
    await paso(hooks, 'correo');

    // Si el catálogo no tuviera la categoría/prioridad calculada, se cae a SIN_CLASIFICAR/MEDIA
    // en vez de perder el correo por un NULL. SOLICITUDES tiene trigger: SQL Server exige OUTPUT ... INTO.
    const sol = await tx
      .request()
      .input('idCorreo', sql.Int, idCorreo)
      .input('categoria', sql.VarChar(50), categoria)
      .input('prioridad', sql.VarChar(20), prioridad)
      .input('descripcion', sql.NVarChar(sql.MAX), c.asunto)
      .query<{ idSolicitud: number }>(
        `DECLARE @ids TABLE (idSolicitud INT);
         INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad, descripcion)
         OUTPUT inserted.idSolicitud INTO @ids
         SELECT @idCorreo,
                COALESCE((SELECT idCategoria FROM CATEGORIAS WHERE nombre = @categoria),
                         (SELECT idCategoria FROM CATEGORIAS WHERE nombre = 'SIN_CLASIFICAR')),
                (SELECT idEstado FROM ESTADOS WHERE nombre = 'NUEVA'),
                COALESCE((SELECT idPrioridad FROM PRIORIDADES WHERE nombre = @prioridad),
                         (SELECT idPrioridad FROM PRIORIDADES WHERE nombre = 'MEDIA')),
                @descripcion;
         SELECT idSolicitud FROM @ids;`,
      );
    const idSolicitud = sol.recordset[0]!.idSolicitud;
    await paso(hooks, 'solicitud');

    await tx
      .request()
      .input('idSolicitud', sql.Int, idSolicitud)
      .query(
        `INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoAnterior, idEstadoNuevo, idUsuario, comentario)
         SELECT @idSolicitud, NULL, idEstado, NULL, N'Creada automáticamente desde correo'
           FROM ESTADOS WHERE nombre = 'NUEVA'`,
      );
    await paso(hooks, 'historial');

    if (c.checkpoint) await avanzarCheckpoint(tx, c.checkpoint);
    await paso(hooks, 'checkpoint');

    return { duplicado: false, idCorreo, idSolicitud, categoria, prioridad, idResidente } as const;
  });
}
