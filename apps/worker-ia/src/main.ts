/**
 * WORKER DE IA. Proceso aparte que toma las solicitudes NUEVAS, enmascara su texto, pide una sugerencia
 * de clasificación al modelo configurado y la guarda en SUGERENCIAS_IA. Solo sugiere: nunca cambia una
 * solicitud. Si se apaga o el modelo falla, el sistema sigue con la clasificación por reglas.
 *
 *   npm run ia               # ciclo continuo (Ctrl+C para detener)
 *   npm run ia -- --una-vez  # un solo ciclo (útil para probar la llave)
 *
 * Usa la identidad de la APLICACIÓN (DB_USER, rol crm_app). Requiere la BD migrada.
 */
import { dbConfigFromEnv } from '../../api/src/config.js';
import { crearPool } from '../../api/src/db/pool.js';
import { cargarConfigIA, type ConfigIA } from './config.js';
import { ProveedorOpencodeGo } from './opencodeGo.js';
import { ProveedorOpenRouter } from './openrouter.js';
import { procesarPendientes } from './procesar.js';
import { ErrorConfiguracionIA, ErrorTemporalIA } from './proveedor.js';

const unaVez = process.argv.includes('--una-vez');
const hora = () => new Date().toISOString().slice(11, 19);
const log = (m: string) => console.log(`[ia ${hora()}] ${m}`);

let cfg: ConfigIA;
try {
  cfg = cargarConfigIA();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

if (cfg.proveedor === 'ninguno') {
  log('IA apagada (IA_PROVEEDOR=ninguno). Para activarla, revise .env.example.');
  process.exit(0);
}

const opciones = { apiKey: cfg.apiKey, modelo: cfg.modelo, timeoutMs: cfg.timeoutMs };
const proveedor = cfg.proveedor === 'opencode-go' ? new ProveedorOpencodeGo(opciones) : new ProveedorOpenRouter(opciones);
const pool = await crearPool(dbConfigFromEnv(), { max: 2 });
let detener = false;
let despertar: (() => void) | null = null;
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    log('Deteniendo…');
    detener = true;
    despertar?.();
  });
}

const esperar = (ms: number) =>
  new Promise<void>((listo) => {
    const t = setTimeout(listo, ms);
    despertar = () => {
      clearTimeout(t);
      listo();
    };
  });

log(`Modelo ${cfg.modelo} vía ${cfg.proveedor}, cada ${cfg.intervaloS}s, hasta ${cfg.maxPorCiclo} correos por ciclo`);

while (!detener) {
  let esperaMs = cfg.intervaloS * 1000;
  try {
    const r = await procesarPendientes(pool, proveedor, cfg);
    if (r.revisadas > 0 || unaVez) log(`Revisadas ${r.revisadas}: ${r.sugeridas} con sugerencia, ${r.fallidas} con respuesta inválida`);
    if (r.pausa) {
      log(`${r.pausa.motivo}. Se puede reanudar a las ${r.pausa.hasta.toISOString().slice(11, 19)} UTC.`);
      esperaMs = Math.max(esperaMs, r.pausa.hasta.getTime() - Date.now());
    }
  } catch (err) {
    if (err instanceof ErrorConfiguracionIA) {
      console.error((err as Error).message);
      process.exitCode = 1;
      break;
    }
    // Solo el mensaje de nuestros errores: uno de la BD podría traer datos del correo.
    const detalle = err instanceof ErrorTemporalIA ? err.message : (err as { name?: string }).name ?? 'Error';
    log(`Ciclo interrumpido: ${detalle}.${unaVez ? '' : ` Se reintenta en ${cfg.intervaloS}s.`}`);
    if (unaVez) process.exitCode = 1;
  }
  if (unaVez) break;
  if (!detener) await esperar(esperaMs);
}

await pool.close();
