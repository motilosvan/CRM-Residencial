import type sql from 'mssql';
import {
  cuentaCheckpoint,
  ErrorConexionBuzon,
  type BuzonActivo,
  type ConexionBuzon,
  type DepsBuzon,
  type ResultadoSincronizacionBuzon,
} from '../../api/src/modules/buzones.js';
import { esErrorDeAutenticacion, esErrorDeCertificado, FuenteImap, type FuenteCorreo } from './fuente.js';
import { ErrorSincronizacion, Intentos, sincronizar } from './sincronizar.js';

/**
 * Implementación IMAP de `DepsBuzon` (sin `secreto`): la usan la API (prueba al conectar y sincronización
 * manual, cableada en `server.ts`) y el ciclo del gateway. Traduce los fallos de conexión a
 * `ErrorConexionBuzon` con un código corto; nunca lleva la dirección ni la contraseña en el error.
 */
export interface OpcionesAdaptador {
  maxPorCiclo: number;
  maxIntentos: number;
  log?: (mensaje: string) => void;
  ahora?: () => Date;
  /** Tope de la prueba de conexión al conectar un buzón (por defecto 15 s). */
  esperaPruebaMs?: number;
  /** Inyectable para las pruebas; por defecto, una conexión IMAP real. */
  crearFuente?: (c: ConexionBuzon, o: { marcarLeido: boolean; esperaMs?: number }) => FuenteCorreo;
}

const ESPERA_PRUEBA_MS = 15_000;

/** Errores de la BD (mssql) o de validación: no son del buzón y se propagan tal cual. */
const ERRORES_NO_IMAP = new Set(['ConnectionError', 'RequestError', 'TransactionError', 'PreparedStatementError', 'ValidationError']);

/** Códigos de red/IMAP de imapflow y de node: el fallo es de la conexión, no un bug ni la BD. */
const CODIGOS_RED = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNABORTED', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN',
  'EPIPE', 'ESOCKET', 'ECONNCLOSED', 'ETIMEOUT', 'NoConnection',
]);

/** ¿Tiene forma de error de red o de servidor IMAP? (`code` de red, `responseStatus` o `authenticationFailed`). */
function esErrorDeRedOImap(err: unknown): boolean {
  const e = err as { code?: string; responseStatus?: string; authenticationFailed?: boolean } | null;
  if (!e || typeof e !== 'object') return false;
  return (e.code !== undefined && CODIGOS_RED.has(e.code)) || e.responseStatus !== undefined || e.authenticationFailed === true;
}

/**
 * `alAbrir`: el fallo ocurrió al abrir la fuente, así que cualquier error es de conexión. Si no, solo lo es
 * el que tiene forma de red/IMAP; lo demás (un TypeError, la BD) se devuelve `null` y el llamador lo propaga.
 */
function aErrorConexion(err: unknown, alAbrir: boolean): ErrorConexionBuzon | null {
  if (esErrorDeAutenticacion(err)) return new ErrorConexionBuzon('AUTENTICACION');
  if (esErrorDeCertificado(err)) return new ErrorConexionBuzon('CERTIFICADO');
  return alAbrir || esErrorDeRedOImap(err) ? new ErrorConexionBuzon('CONEXION') : null;
}

export function crearAdaptadorBuzon(o: OpcionesAdaptador): Omit<DepsBuzon, 'secreto' | 'hostsPermitidos'> {
  const crearFuente = o.crearFuente ?? ((c, op) => new FuenteImap(c, op));
  // Fallos por correo (escalada a SIN_CLASIFICAR), separados por buzón: la clave del checkpoint ya
  // identifica conjunto, cuenta y carpeta, así que un buzón reconectado a otra cuenta no hereda conteos.
  const intentosPorCuenta = new Map<string, Intentos>();

  return {
    /**
     * Las esperas de imapflow acotan conexión, saludo y socket a `esperaMs`, pero LOGIN y SELECT suman
     * cada uno la suya: un temporizador global garantiza que la petición HTTP no espere más de eso.
     * Al vencer se responde CONEXION y se pide `cerrar()`: `FuenteImap` corta entonces el socket aunque
     * `abrir()` siga en curso, y ese `abrir()` falla en vez de dejar la sesión viva.
     */
    async probarConexion(c: ConexionBuzon): Promise<void> {
      const espera = o.esperaPruebaMs ?? ESPERA_PRUEBA_MS;
      const fuente = crearFuente(c, { marcarLeido: false, esperaMs: espera });
      const apertura = fuente.abrir();
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const vencimiento = new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new ErrorConexionBuzon('CONEXION')), espera);
      });
      try {
        await Promise.race([apertura, vencimiento]);
      } catch (err) {
        if (err instanceof ErrorConexionBuzon) {
          // Venció: no se espera a un servidor que no responde; si la apertura termina después, se cierra.
          void apertura.then(() => fuente.cerrar(), () => undefined).catch(() => undefined);
          void fuente.cerrar().catch(() => undefined);
          throw err;
        }
        await fuente.cerrar().catch(() => undefined);
        throw aErrorConexion(err, true)!;
      } finally {
        clearTimeout(temporizador);
      }
      await fuente.cerrar().catch(() => undefined);
    },

    async ejecutarSincronizacion(pool: sql.ConnectionPool, b: BuzonActivo): Promise<ResultadoSincronizacionBuzon> {
      const cuenta = cuentaCheckpoint(b.idConjunto, b.usuario, b.buzon);
      let intentos = intentosPorCuenta.get(cuenta);
      if (!intentos) intentosPorCuenta.set(cuenta, (intentos = new Intentos()));
      const fuente = crearFuente(b, { marcarLeido: b.marcarLeido });
      let falloAlAbrir = false;
      const fuenteVigilada: FuenteCorreo = {
        abrir: async () => {
          try {
            return await fuente.abrir();
          } catch (err) {
            falloAlAbrir = true;
            throw err;
          }
        },
        uidsDesde: (f) => fuente.uidsDesde(f),
        uidsMayoresQue: (u) => fuente.uidsMayoresQue(u),
        descargar: (u) => fuente.descargar(u),
        marcarLeido: (u) => fuente.marcarLeido(u),
        cerrar: () => fuente.cerrar(),
      };
      // Los mensajes de sincronizar() no dicen de qué buzón son: se antepone el conjunto (nunca la dirección).
      const log = o.log ? (mensaje: string) => o.log!(`Conjunto ${b.idConjunto}: ${mensaje}`) : undefined;
      try {
        return await sincronizar(
          pool,
          fuenteVigilada,
          {
            cuenta,
            idConjunto: b.idConjunto,
            diasIniciales: b.diasIniciales,
            maxPorCiclo: o.maxPorCiclo,
            maxIntentos: o.maxIntentos,
            marcarLeido: b.marcarLeido,
            ahora: o.ahora,
            log,
          },
          intentos,
        );
      } catch (err) {
        // Un correo que no se pudo guardar o la BD caída no son fallos del buzón.
        if (err instanceof ErrorSincronizacion) throw err;
        const nombre = (err as { name?: string } | null)?.name;
        if (nombre !== undefined && ERRORES_NO_IMAP.has(nombre)) throw err;
        const conexion = aErrorConexion(err, falloAlAbrir);
        if (conexion) throw conexion;
        throw err; // bug o fallo interno: el llamador lo registra como INTERNO
      }
    },
  };
}
