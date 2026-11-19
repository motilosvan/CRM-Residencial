import type sql from 'mssql';
import { enmascarar } from '../../api/src/domain/enmascarar.js';
import { solicitudesParaSugerir } from '../../api/src/modules/consultas.js';
import { registrarFalloSugerencia, registrarSugerencia } from '../../api/src/modules/sugerencias.js';
import { ErrorCuota, ErrorRespuestaIA, type ProveedorIA } from './proveedor.js';

/** Tope de texto enviado por correo: basta para clasificar y reduce lo que sale del sistema. */
export const LIMITE_TEXTO = 4000;

export interface OpcionesProcesar {
  maxPorCiclo: number;
  maxIntentos: number;
  esperaReintentoMin: number;
  /** Espera entre llamadas: los proveedores gratuitos limitan las ráfagas, aunque quede cuota diaria. */
  pausaEntreLlamadasMs?: number;
}

export interface ResultadoCiclo {
  revisadas: number;
  sugeridas: number;
  fallidas: number;
  /** Si hay valor, el proveedor limitó las llamadas: no volver a llamarlo antes de esa hora. */
  pausa: { hasta: Date; motivo: string } | null;
}

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Un ciclo del worker: enmascara cada solicitud pendiente, pide la sugerencia y la guarda aparte.
 * La llamada al modelo va FUERA de toda transacción: tarda segundos y `withTx` puede repetir su función.
 * Nada de lo que ocurra aquí toca la solicitud ni su clasificación por reglas.
 */
export async function procesarPendientes(
  pool: sql.ConnectionPool,
  proveedor: ProveedorIA,
  opciones: OpcionesProcesar,
): Promise<ResultadoCiclo> {
  const res: ResultadoCiclo = { revisadas: 0, sugeridas: 0, fallidas: 0, pausa: null };
  let primera = true;

  for (const s of await solicitudesParaSugerir(pool, opciones.maxPorCiclo)) {
    if (!primera && opciones.pausaEntreLlamadasMs) await esperar(opciones.pausaEntreLlamadasMs);
    primera = false;
    const nombres = [s.residente];
    const entrada = {
      asunto: enmascarar(s.asunto, { nombres }),
      cuerpo: enmascarar(s.cuerpo, { nombres }).slice(0, LIMITE_TEXTO),
    };
    res.revisadas++;
    try {
      const { modelo, ...sugerencia } = await proveedor.sugerir(entrada);
      await registrarSugerencia(pool, { ...sugerencia, idSolicitud: s.idSolicitud, proveedor: proveedor.nombre, modelo });
      res.sugeridas++;
    } catch (err) {
      if (err instanceof ErrorCuota) {
        res.revisadas--; // no se le descuenta al correo: se reintenta tras la pausa
        res.pausa = { hasta: err.reanudarEn, motivo: err.message };
        break;
      }
      if (!(err instanceof ErrorRespuestaIA)) throw err; // no depende de este correo: detiene el ciclo
      await registrarFalloSugerencia(pool, {
        idSolicitud: s.idSolicitud,
        proveedor: proveedor.nombre,
        modelo: proveedor.modelo,
        causa: err.message,
        maxIntentos: opciones.maxIntentos,
        esperaMinutos: opciones.esperaReintentoMin,
      });
      res.fallidas++;
    }
  }
  return res;
}
