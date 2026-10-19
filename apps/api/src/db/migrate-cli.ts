import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dbConfigFromEnv, migratorConfigFromEnv } from '../config.js';
import { migrate } from './migrate.js';
import { asegurarUsuarioApp } from './usuarioApp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

try {
  const migrador = migratorConfigFromEnv();
  const res = await migrate({
    config: migrador,
    baselinePath: path.join(root, 'ScriptBaseDatosCRM.sql'),
    migrationsDir: path.join(root, 'db', 'migrations'),
    log: (m) => console.log(m),
  });
  console.log(
    `BD ${migrador.database}: ${res.aplicadas.length} aplicada(s), ${res.omitidas.length} ya al día` +
      (res.baselineAdoptada ? ' (línea base adoptada)' : ''),
  );

  // La aplicación se conecta con su propio login (rol crm_app), nunca como administrador.
  const app = dbConfigFromEnv();
  await asegurarUsuarioApp(migrador, migrador.database, app.user, app.password);
  console.log(`Login de aplicación "${app.user}" listo con el rol crm_app.`);
} catch (err) {
  console.error('Migración fallida:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
