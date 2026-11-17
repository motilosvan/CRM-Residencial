import type sql from 'mssql';
import {
  ErrorConexionBuzon,
  listarBuzonesActivos,
  MENSAJES_ERROR_BUZON,
  registrarResultadoSincronizacion,
  type DepsBuzon,
} from '../../api/src/modules/buzones.js';
import { describirError, ErrorSincronizacion } from './sincronizar.js';

export interface OpcionesCiclo {
  log: (mensaje: string) => void;
  /** Escribe el resumen de cada buzón aunque no haya correos nuevos (p. ej. con `--una-vez`). */
  detallado?: boolean;
}

export interface ResultadoCiclo {
  /** Buzones activos (y descifrables) recorridos en este ciclo. */
  buzones: number;
  fallidos: number;
  /** Algún buzón dejó correos para el siguiente ciclo. */
  pendientes: boolean;
}

/**
 * Un ciclo del gateway sobre TODOS los buzones activos de la BD, uno tras otro. El fallo de un buzón no
 * detiene a los demás: se registra (`ultimoError`, telemetría) y se sigue. Los logs identifican el buzón
 * por `idConjunto`; nunca muestran la dirección, la contraseña ni el contenido de los correos.
 * Un fallo al LISTAR los buzones (BD caída) se propaga: el proceso lo reintenta en el siguiente ciclo.
 */
export async function cicloBuzones(
  pool: sql.ConnectionPool,
  deps: Pick<DepsBuzon, 'secreto' | 'ejecutarSincronizacion'>,
  opciones: OpcionesCiclo,
): Promise<ResultadoCiclo> {
  const { log } = opciones;
  const buzones = await listarBuzonesActivos(pool, deps.secreto);
  const res: ResultadoCiclo = { buzones: buzones.length, fallidos: 0, pendientes: false };

  // Telemetría: si la BD también falla aquí, se anota en el log y se sigue con el siguiente buzón.
  const registrar = (idConjunto: number, codigo: Parameters<typeof registrarResultadoSincronizacion>[2]) =>
    registrarResultadoSincronizacion(pool, idConjunto, codigo).catch((err: unknown) =>
      log(`Conjunto ${idConjunto}: no se pudo registrar el resultado (${describirError(err)})`),
    );

  for (const b of buzones) {
    try {
      const r = await deps.ejecutarSincronizacion(pool, b);
      await registrar(b.idConjunto, null);
      if (r.revisados > 0 || opciones.detallado) {
        log(
          `Buzón del conjunto ${b.idConjunto}: revisados ${r.revisados}: ${r.nuevos} nuevos, ${r.duplicados} ya estaban, ` +
            `${r.respaldos} sin clasificar${r.pendientes ? ' (quedan más, sigue de inmediato)' : ''}`,
        );
      }
      res.pendientes ||= r.pendientes;
    } catch (err) {
      res.fallidos++;
      if (err instanceof ErrorConexionBuzon) {
        await registrar(b.idConjunto, err.codigo);
        log(`Buzón del conjunto ${b.idConjunto}: ${MENSAJES_ERROR_BUZON[err.codigo]}`);
        continue;
      }
      // Un correo que no se pudo guardar (se reintenta en el siguiente ciclo) o la BD caída: queda INTERNO.
      // Solo tipo y código en el log: el mensaje completo de un error SQL puede traer datos del correo.
      await registrar(b.idConjunto, 'INTERNO');
      const detalle = err instanceof ErrorSincronizacion ? err.message : describirError(err);
      log(`Buzón del conjunto ${b.idConjunto}: ciclo interrumpido: ${detalle}`);
    }
  }
  return res;
}
