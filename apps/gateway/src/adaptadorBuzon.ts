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

function aErrorConexion(err: unknown): ErrorConexionBuzon {
  if (esErrorDeAutenticacion(err)) return new ErrorConexionBuzon('AUTENTICACION');
  if (esErrorDeCertificado(err)) return new ErrorConexionBuzon('CERTIFICADO');
  return new ErrorConexionBuzon('CONEXION');
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
     * Al vencer se responde CONEXION y la sesión se cierra (también si `abrir()` termina más tarde).
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
        throw aErrorConexion(err);
      } finally {
        clearTimeout(temporizador);
      }
      await fuente.cerrar().catch(() => undefined);
    },

    async ejecutarSincronizacion(pool: sql.ConnectionPool, b: BuzonActivo): Promise<ResultadoSincronizacionBuzon> {
      const cuenta = cuentaCheckpoint(b.idConjunto, b.usuario, b.buzon);
      let intentos = intentosPorCuenta.get(cuenta);
      if (!intentos) intentosPorCuenta.set(cuenta, (intentos = new Intentos()));
      try {
        return await sincronizar(
          pool,
          crearFuente(b, { marcarLeido: b.marcarLeido }),
          {
            cuenta,
            idConjunto: b.idConjunto,
            diasIniciales: b.diasIniciales,
            maxPorCiclo: o.maxPorCiclo,
            maxIntentos: o.maxIntentos,
            marcarLeido: b.marcarLeido,
            ahora: o.ahora,
            log: o.log,
          },
          intentos,
        );
      } catch (err) {
        // Un correo que no se pudo guardar o la BD caída no son fallos del buzón.
        if (err instanceof ErrorSincronizacion) throw err;
        const nombre = (err as { name?: string } | null)?.name;
        if (nombre !== undefined && ERRORES_NO_IMAP.has(nombre)) throw err;
        throw aErrorConexion(err);
      }
    },
  };
}
