import type sql from 'mssql';
import { leerCheckpoint } from '../../api/src/modules/consultas.js';
import { ingestarCorreo, type CorreoEntrante, type ResultadoIngesta } from '../../api/src/modules/ingesta.js';
import { ErrorDescarga, type FuenteCorreo, type MensajeCrudo } from './fuente.js';
import { aCorreoEntrante, correoDeRespaldo, correoMinimo, correoNoDescargable, type Contexto } from './parseo.js';

export interface OpcionesSincronizacion {
  /** Clave del checkpoint (usuario/buzón). */
  cuenta: string;
  diasIniciales: number;
  maxPorCiclo: number;
  maxIntentos: number;
  marcarLeido: boolean;
  ahora?: () => Date;
  log?: (mensaje: string) => void;
  /** Inyectables para las pruebas; por defecto, T1 real y mailparser. */
  ingestar?: (pool: sql.ConnectionPool, c: CorreoEntrante) => Promise<ResultadoIngesta>;
  parsear?: (fuente: Buffer, ctx: Contexto) => Promise<CorreoEntrante>;
}

export interface ResultadoSincronizacion {
  revisados: number;
  nuevos: number;
  duplicados: number;
  /** Guardados SIN_CLASIFICAR por MIME ilegible o por superar el máximo de intentos (incluye registros mínimos y no descargables). */
  respaldos: number;
  /** Quedaron correos para el siguiente ciclo (se alcanzó maxPorCiclo). */
  pendientes: boolean;
}

/** Fallos por correo (clave uidValidity:uid). Vive en memoria del proceso, entre ciclos. */
export class Intentos {
  private readonly fallos = new Map<string, { n: number; causa: string }>();
  de(clave: string): number {
    return this.fallos.get(clave)?.n ?? 0;
  }
  /** Tipo y código del último fallo: se anota en el registro de último recurso. */
  causa(clave: string): string | undefined {
    return this.fallos.get(clave)?.causa;
  }
  sumar(clave: string, causa: string): void {
    this.fallos.set(clave, { n: this.de(clave) + 1, causa });
  }
  limpiar(clave: string): void {
    this.fallos.delete(clave);
  }
}

/** El ciclo se detuvo en un correo. El checkpoint quedó en el anterior: se reintenta desde ahí. */
export class ErrorSincronizacion extends Error {
  override name = 'ErrorSincronizacion';
  constructor(
    readonly uid: number,
    readonly causa: unknown,
  ) {
    super(`No se pudo guardar el correo UID ${uid}: ${describirError(causa)}`);
  }
}

const CODIGOS_INFRAESTRUCTURA = new Set(['ESOCKET', 'ECONNCLOSED', 'ECONNRESET', 'ETIMEOUT', 'ELOGIN', 'ENOTOPEN', 'EINSTLOOKUP']);

/**
 * BD inalcanzable, red caída, tiempo agotado: no es culpa del correo, así que no cuenta como intento
 * (si contara, una caída de la BD terminaría guardando correos válidos como SIN_CLASIFICAR).
 */
export function esFalloDeInfraestructura(err: unknown): boolean {
  const e = err as { name?: string; code?: string } | null;
  return e?.name === 'ConnectionError' || (e?.code !== undefined && CODIGOS_INFRAESTRUCTURA.has(e.code));
}

/**
 * Descripción para el log: tipo y código (y estado IMAP), nunca el mensaje completo ni el texto de la
 * respuesta del servidor (pueden traer datos del correo).
 */
export function describirError(err: unknown): string {
  if (err instanceof ErrorDescarga) return `${err.name} (${describirError(err.causa)})`;
  const e = err as { name?: string; code?: string; number?: number; responseStatus?: string; serverResponseCode?: string } | null;
  return [
    e?.name ?? 'Error',
    e?.code ?? e?.number,
    e?.responseStatus ? `IMAP ${e.responseStatus}` : undefined,
    e?.serverResponseCode ? `[${e.serverResponseCode}]` : undefined,
  ]
    .filter((x) => x !== undefined)
    .join(' ');
}

/** Descarga un mensaje. Si el servidor rechaza ESE mensaje, devuelve el error (cuenta como intento); un corte de conexión se propaga. */
async function descargar(fuente: FuenteCorreo, uid: number): Promise<MensajeCrudo | ErrorDescarga | null> {
  try {
    return await fuente.descargar(uid);
  } catch (err) {
    if (err instanceof ErrorDescarga) return err;
    throw err;
  }
}

/**
 * Un ciclo del gateway (S3): lee los correos nuevos del buzón en orden de UID y llama a T1 por cada uno.
 * T1 guarda el correo y avanza el checkpoint (T6) en la MISMA transacción, así que:
 * - si el proceso muere a mitad, el siguiente ciclo sigue justo después del último correo guardado;
 * - si un correo se relee (checkpoint perdido, UIDVALIDITY nuevo), T1 lo detecta por Message-ID y no lo duplica.
 * Un correo que falla detiene el ciclo (no se salta: el orden protege el checkpoint) y se reintenta en el
 * siguiente. Para no bloquear el buzón para siempre (regla 8), tras `maxIntentos` fallos propios del correo
 * se guarda SIN_CLASIFICAR; si tampoco, un registro mínimo. Un mensaje que el servidor no entrega se
 * registra sin contenido tras `maxIntentos` rechazos. Los fallos de conexión o de BD no cuentan.
 */
export async function sincronizar(
  pool: sql.ConnectionPool,
  fuente: FuenteCorreo,
  opts: OpcionesSincronizacion,
  intentos: Intentos = new Intentos(),
): Promise<ResultadoSincronizacion> {
  const ingestar = opts.ingestar ?? ingestarCorreo;
  const parsear = opts.parsear ?? aCorreoEntrante;
  const log = opts.log ?? (() => {});
  const res: ResultadoSincronizacion = { revisados: 0, nuevos: 0, duplicados: 0, respaldos: 0, pendientes: false };

  // abrir() va dentro del try: si falla a mitad (ya autenticado, pero sin buzón) la sesión se cierra igual.
  try {
    const buzon = await fuente.abrir();
    const cp = await leerCheckpoint(pool, opts.cuenta);
    let uids: number[];
    if (cp && cp.uidValidity === buzon.uidValidity) {
      uids = await fuente.uidsMayoresQue(cp.ultimoUid);
    } else {
      // Primera lectura de la cuenta, o el servidor renumeró el buzón: solo una ventana reciente,
      // nunca todo el historial. La idempotencia por Message-ID absorbe lo que ya estaba guardado.
      const ahora = opts.ahora?.() ?? new Date();
      const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - opts.diasIniciales));
      if (cp) log(`UIDVALIDITY cambió (${cp.uidValidity} → ${buzon.uidValidity}): se relee desde ${desde.toISOString().slice(0, 10)}`);
      uids = await fuente.uidsDesde(desde);
    }

    const lote = uids.slice(0, opts.maxPorCiclo);
    res.pendientes = uids.length > lote.length;

    for (const uid of lote) {
      const msg = await descargar(fuente, uid);
      if (msg === null) continue; // se borró entre la búsqueda y la descarga: no hay nada que guardar
      res.revisados++;
      const ctx: Contexto = {
        cuenta: opts.cuenta,
        uidValidity: buzon.uidValidity,
        uid,
        fechaInterna: msg instanceof ErrorDescarga ? undefined : msg.fechaInterna,
      };
      const clave = `${buzon.uidValidity}:${uid}`;
      const fallos = intentos.de(clave);

      // Escalada para un correo que falla siempre. Como se procesa en orden, no se puede saltar: cada
      // escalón quita algo de lo que podría estar fallando, hasta guardar solo valores del gateway.
      let correo: CorreoEntrante;
      let respaldo = false;
      if (msg instanceof ErrorDescarga) {
        if (fallos < opts.maxIntentos) {
          intentos.sumar(clave, describirError(msg));
          throw new ErrorSincronizacion(uid, msg);
        }
        log(`UID ${uid}: el servidor no lo entrega tras ${fallos} intentos; se registra sin contenido (SIN_CLASIFICAR)`);
        correo = correoNoDescargable(ctx, intentos.causa(clave));
        respaldo = true;
      } else {
        try {
          correo = await parsear(msg.fuente, ctx);
        } catch {
          correo = correoDeRespaldo(msg.fuente, ctx); // MIME ilegible: fallará igual siempre, no se reintenta
          respaldo = true;
        }
        if (fallos === opts.maxIntentos) {
          // 1) Sin clasificar, con todos los datos.
          log(`UID ${uid}: falló ${fallos} veces; se guarda SIN_CLASIFICAR`);
          correo = { ...correo, sinClasificar: true };
          respaldo = true;
        } else if (fallos > opts.maxIntentos) {
          // 2) Ni así: solo lo que genera el gateway; los datos originales van como texto en el cuerpo.
          log(`UID ${uid}: tampoco se pudo guardar SIN_CLASIFICAR; se guarda un registro mínimo`);
          correo = correoMinimo(correo, ctx, intentos.causa(clave));
          respaldo = true;
        }
      }

      let r: ResultadoIngesta;
      try {
        r = await ingestar(pool, correo);
      } catch (err) {
        if (!esFalloDeInfraestructura(err)) intentos.sumar(clave, describirError(err));
        throw new ErrorSincronizacion(uid, err);
      }
      intentos.limpiar(clave);

      if (r.duplicado) res.duplicados++;
      else if (respaldo) res.respaldos++;
      else res.nuevos++;

      // Después del COMMIT: si esto falla, el correo ya está guardado; marcarlo leído es cosmético.
      if (opts.marcarLeido) await fuente.marcarLeido(uid).catch((err) => log(`No se pudo marcar leído el UID ${uid}: ${describirError(err)}`));
    }
    return res;
  } finally {
    // Un fallo al cerrar no debe tapar el error del ciclo ni deshacer un ciclo exitoso (ya hubo COMMIT).
    await fuente.cerrar().catch((err: unknown) => log(`No se pudo cerrar la conexión: ${describirError(err)}`));
  }
}
