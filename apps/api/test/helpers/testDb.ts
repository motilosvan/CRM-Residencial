import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { migratorConfigFromEnv, type DbConfig } from '../../src/config.js';
import { migrate } from '../../src/db/migrate.js';
import { crearPool } from '../../src/db/pool.js';

/** Solo se pueden borrar BDs con esta forma: un error de import nunca puede borrar la BD real. */
const NOMBRE_TEMPORAL = /^CorreosCRM_[A-Za-z0-9]+_[0-9a-f]{8}$/;

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const baselinePath = path.join(repoRoot, 'ScriptBaseDatosCRM.sql');
export const migrationsDir = path.join(repoRoot, 'db', 'migrations');

/** BD temporal con la identidad del migrador (puede crear y borrar BDs). */
export function tempDbConfig(prefix = 'CorreosCRM_test'): DbConfig {
  const config = { ...migratorConfigFromEnv(), database: `${prefix}_${randomBytes(4).toString('hex')}` };
  if (!NOMBRE_TEMPORAL.test(config.database)) throw new Error(`Prefijo de BD temporal inválido: ${prefix}`);
  return config;
}

/** Ejecuta un script T-SQL (un solo lote) contra la BD de pruebas y devuelve las filas. */
export async function runSql<T = Record<string, unknown>>(cfg: DbConfig, script: string): Promise<T[]> {
  const pool = await crearPool(cfg, { max: 1 });
  try {
    const res = await pool.request().query<T>(script);
    return res.recordset ?? [];
  } finally {
    await pool.close();
  }
}

export async function dropTempDb(cfg: DbConfig): Promise<void> {
  if (!NOMBRE_TEMPORAL.test(cfg.database)) {
    throw new Error(`dropTempDb se niega a borrar "${cfg.database}": no es una BD temporal de pruebas`);
  }
  const master = await crearPool(cfg, { database: 'master', max: 1 });
  try {
    await master
      .request()
      .input('db', sql.NVarChar, cfg.database)
      .query(
        `IF DB_ID(@db) IS NOT NULL
         BEGIN
           DECLARE @s NVARCHAR(400) = N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ' + QUOTENAME(@db);
           EXEC (@s);
         END`,
      );
  } finally {
    await master.close();
  }
}

export interface TestDb {
  config: DbConfig;
  pool: sql.ConnectionPool;
  q: <T = Record<string, unknown>>(script: string) => Promise<T[]>;
  close: () => Promise<void>;
}

/**
 * BD temporal con el esquema real (línea base + todas las migraciones) y un pool listo.
 * Las pruebas de módulos usan esto para ejercitar las transacciones contra SQL Server de verdad.
 */
export async function setupTestDb(prefix: string): Promise<TestDb> {
  const config = tempDbConfig(prefix);
  await migrate({ config, baselinePath, migrationsDir });
  const pool = await crearPool(config, { max: 20 });
  return {
    config,
    pool,
    q: (script) => runSql(config, script),
    close: async () => {
      await pool.close();
      await dropTempDb(config);
    },
  };
}
