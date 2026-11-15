/**
 * API HTTP del SOC-CRM (`npm run api`). Usa la identidad de la APLICACIÓN (DB_USER, rol crm_app) contra
 * DB_NAME, la misma BD donde escribe el gateway. Requiere la BD migrada (`npm run db:migrate`).
 * Solo escucha en 127.0.0.1.
 */
import { dbConfigFromEnv } from './config.js';
import { crearPool } from './db/pool.js';
import { construirApp } from './http/app.js';
import { EnviadorLocal } from './modules/enviador.js';

const PORT = Number(process.env.API_PORT ?? 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`API_PORT inválido: ${process.env.API_PORT}`);
  process.exit(1);
}

const AUTH_SECRETO = process.env.AUTH_SECRETO ?? '';
if (AUTH_SECRETO.length < 32) {
  console.error('AUTH_SECRETO es obligatorio y debe tener al menos 32 caracteres');
  process.exit(1);
}

const db = dbConfigFromEnv();
const pool = await crearPool(db);
// Provisional hasta la Tarea 7 (config real: AUTH_SECRETO, SMTP, WEB_ORIGENES, COOKIE_SEGURA): enviador local y valores fijos de desarrollo.
const app = construirApp({
  pool,
  hostsPermitidos: new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]),
  acceso: {
    secreto: AUTH_SECRETO,
    enviador: new EnviadorLocal(),
    cookieSegura: false,
    origenesPermitidos: new Set(['http://localhost:5173', 'http://127.0.0.1:5173']),
  },
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    void app.close().then(() => pool.close()).finally(() => process.exit(0));
  });
}

await app.listen({ host: '127.0.0.1', port: PORT });
console.log(`API en http://127.0.0.1:${PORT}/api  (BD ${db.database}, usuario ${db.user})`);
