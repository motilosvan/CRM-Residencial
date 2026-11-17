/**
 * API HTTP del SOC-CRM (`npm run api`). Usa la identidad de la APLICACIÓN (DB_USER, rol crm_app) contra
 * DB_NAME, la misma BD donde escribe el gateway. Requiere la BD migrada (`npm run db:migrate`).
 * Solo escucha en 127.0.0.1.
 *
 * Raíz de composición: es el único archivo de la API que importa el gateway (el adaptador IMAP del buzón
 * se inyecta en las rutas; `modules/` y `http/` nunca importan `apps/gateway` ni imapflow).
 */
import { crearAdaptadorBuzon } from '../../gateway/src/adaptadorBuzon.js';
import { accesoConfigFromEnv, dbConfigFromEnv, hostsImapPermitidosFromEnv, type AccesoConfig } from './config.js';
import { crearPool } from './db/pool.js';
import { construirApp } from './http/app.js';
import { EnviadorLocal, EnviadorSmtp } from './modules/enviador.js';
import { asegurarUsuariosIniciales } from './modules/semilla.js';

const PORT = Number(process.env.API_PORT ?? 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`API_PORT inválido: ${process.env.API_PORT}`);
  process.exit(1);
}

let acceso: AccesoConfig;
let hostsImap: ReadonlySet<string>;
try {
  acceso = accesoConfigFromEnv();
  hostsImap = hostsImapPermitidosFromEnv();
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Configuración de acceso inválida');
  process.exit(1);
}

const db = dbConfigFromEnv();
const pool = await crearPool(db);
await asegurarUsuariosIniciales(pool, { adminCorreo: acceso.adminInicialCorreo, demo: acceso.desarrollo });
if (!acceso.smtp) console.warn('SMTP_HOST sin configurar: los códigos de acceso se escriben en esta consola (solo desarrollo)');
const app = construirApp({
  pool,
  hostsPermitidos: new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]),
  acceso: {
    secreto: acceso.secreto,
    enviador: acceso.smtp ? new EnviadorSmtp(acceso.smtp) : new EnviadorLocal(),
    cookieSegura: acceso.cookieSegura,
    origenesPermitidos: acceso.origenes,
  },
  // Prueba IMAP al conectar y sincronización manual; mismos topes por defecto que el gateway.
  buzon: { secreto: acceso.secreto, hostsPermitidos: hostsImap, ...crearAdaptadorBuzon({ maxPorCiclo: 50, maxIntentos: 3 }) },
  limitePeticiones: { max: 30, ventanaMs: 60_000 },
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void app.close().then(() => pool.close()).finally(() => process.exit(0));
  });
}

await app.listen({ host: '127.0.0.1', port: PORT });
console.log(`API en http://127.0.0.1:${PORT}/api  (BD ${db.database}, usuario ${db.user})`);
