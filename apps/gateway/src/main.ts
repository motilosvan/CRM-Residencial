/**
 * EMAIL GATEWAY (S3). Proceso aparte que, cada IMAP_INTERVALO_S segundos, recorre los buzones activos de
 * dbo.BUZONES_CONJUNTO (uno por conjunto, conectados por el ADMIN desde el panel) y convierte cada correo
 * nuevo en una solicitud (T1 + checkpoint T6 en la misma transacción).
 *
 *   npm run gateway               # ciclo continuo (Ctrl+C para detener)
 *   npm run gateway -- --una-vez  # un solo ciclo (útil para probar los buzones); sale con 1 si alguno falló
 *
 * Usa la identidad de la APLICACIÓN (DB_USER, rol crm_app), nunca la del migrador. Necesita AUTH_SECRETO
 * (el mismo de la API) para descifrar las contraseñas de los buzones. Requiere la BD migrada.
 * Los logs identifican cada buzón por idConjunto: nunca muestran su dirección ni el contenido de los correos.
 */
import { dbConfigFromEnv } from '../../api/src/config.js';
import { crearPool } from '../../api/src/db/pool.js';
import { crearAdaptadorBuzon } from './adaptadorBuzon.js';
import { cicloBuzones } from './ciclo.js';
import { cargarConfig, type ConfigGateway } from './config.js';
import { describirError } from './sincronizar.js';

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
const adaptador = crearAdaptadorBuzon({ maxPorCiclo: cfg.maxPorCiclo, maxIntentos: cfg.maxIntentos, log });
const deps = { secreto: cfg.secreto, ejecutarSincronizacion: adaptador.ejecutarSincronizacion };

let detener = false;
let despertar: (() => void) | null = null;
for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    log('Deteniendo…');
    detener = true;
    despertar?.();
  });
}

log(`Recorriendo los buzones activos de la BD cada ${cfg.intervaloS}s`);
let avisadoSinBuzones = false;

while (!detener) {
  let hayMas = false;
  try {
    const r = await cicloBuzones(pool, deps, { log, detallado: unaVez });
    if (r.buzones === 0) {
      // Una sola vez hasta que aparezca alguno: no se llena el log cada 45 s.
      if (!avisadoSinBuzones || unaVez) {
        log('No hay buzones activos: el ADMIN de cada conjunto lo conecta desde el panel. Se revisa en cada ciclo.');
      }
      avisadoSinBuzones = true;
    } else {
      avisadoSinBuzones = false;
    }
    if (r.fallidos > 0 && unaVez) process.exitCode = 1;
    hayMas = r.pendientes;
  } catch (err) {
    // No se pudo leer la lista de buzones (BD caída...). Solo tipo y código.
    log(`Ciclo interrumpido: ${describirError(err)}.${unaVez ? '' : ` Se reintenta en ${cfg.intervaloS}s.`}`);
    if (unaVez) process.exitCode = 1;
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
