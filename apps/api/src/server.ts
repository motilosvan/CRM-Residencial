/**
 * API HTTP del SOC-CRM (`npm run api`). Usa la identidad de la APLICACIÓN (DB_USER, rol crm_app) contra
 * DB_NAME, la misma BD donde escribe el gateway. Requiere la BD migrada (`npm run db:migrate`).
 * Solo escucha en 127.0.0.1.
 */
import { accesoConfigFromEnv, dbConfigFromEnv, type AccesoConfig } from './config.js';
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
try {
  acceso = accesoConfigFromEnv();
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
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void app.close().then(() => pool.close()).finally(() => process.exit(0));
  });
}

await app.listen({ host: '127.0.0.1', port: PORT });
console.log(`API en http://127.0.0.1:${PORT}/api  (BD ${db.database}, usuario ${db.user})`);
