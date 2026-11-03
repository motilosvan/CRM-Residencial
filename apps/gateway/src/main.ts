/**
 * EMAIL GATEWAY (S3). Proceso aparte que lee el buzón de Gmail por IMAP cada IMAP_INTERVALO_S segundos
 * y convierte cada correo nuevo en una solicitud (T1 + checkpoint T6 en la misma transacción).
 *
 *   npm run gateway               # ciclo continuo (Ctrl+C para detener)
 *   npm run gateway -- --una-vez  # un solo ciclo (útil para probar las credenciales)
 *
 * Usa la identidad de la APLICACIÓN (DB_USER, rol crm_app), nunca la del migrador.
 * Requiere la BD migrada (`npm run db:migrate`).
 */
import { dbConfigFromEnv } from '../../api/src/config.js';
import { crearPool } from '../../api/src/db/pool.js';
import { cargarConfig, type ConfigGateway } from './config.js';
import { esErrorDeAutenticacion, FuenteImap } from './fuente.js';
import { describirError, ErrorSincronizacion, Intentos, sincronizar } from './sincronizar.js';

const unaVez = process.argv.includes('--una-vez');
const hora = () => new Date().toISOString().slice(11, 19);
const log = (m: string) => console.log(`[gateway ${hora()}] ${m}`);

let cfg: ConfigGateway;
try {
  cfg = cargarConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const pool = await crearPool(dbConfigFromEnv(), { max: 2 });
const intentos = new Intentos();
let detener = false;
let despertar: (() => void) | null = null;
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    log('Deteniendo…');
    detener = true;
    despertar?.();
  });
}

log(`Leyendo ${cfg.cuenta} en ${cfg.host}:${cfg.port} cada ${cfg.intervaloS}s` +
  ` (primera lectura: últimos ${cfg.diasIniciales} días; marcar leídos: ${cfg.marcarLeido ? 'sí' : 'no'})`);

while (!detener) {
  let hayMas = false;
  try {
    const r = await sincronizar(pool, new FuenteImap(cfg), {
      cuenta: cfg.cuenta,
      diasIniciales: cfg.diasIniciales,
      maxPorCiclo: cfg.maxPorCiclo,
      maxIntentos: cfg.maxIntentos,
      marcarLeido: cfg.marcarLeido,
      log,
    }, intentos);
    if (r.revisados > 0 || unaVez) {
      log(`Revisados ${r.revisados}: ${r.nuevos} nuevos, ${r.duplicados} ya estaban, ${r.respaldos} sin clasificar` +
        (r.pendientes ? ' (quedan más, sigue de inmediato)' : ''));
    }
    hayMas = r.pendientes;
  } catch (err) {
    if (esErrorDeAutenticacion(err)) {
      console.error('Gmail rechazó el inicio de sesión. Revise IMAP_USER e IMAP_APP_PASSWORD en .env: debe ser una ' +
        '"contraseña de aplicación" (https://myaccount.google.com/apppasswords), no la contraseña normal de la cuenta.');
      process.exitCode = 1;
      break;
    }
    // Solo tipo y código: el mensaje completo de un error SQL puede traer datos del correo.
    const detalle = err instanceof ErrorSincronizacion ? err.message : describirError(err);
    log(`Ciclo interrumpido: ${detalle}. Se reintenta en ${cfg.intervaloS}s.`);
  }
  if (unaVez && !hayMas) break;
  if (!hayMas && !detener) {
    await new Promise<void>((listo) => {
      const t = setTimeout(listo, cfg.intervaloS * 1000);
      despertar = () => {
        clearTimeout(t);
        listo();
      };
    });
  }
}

await pool.close();
