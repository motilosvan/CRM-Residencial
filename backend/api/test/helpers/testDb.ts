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
export const baselinePath = path.join(repoRoot, 'backend', 'db', 'ScriptBaseDatosCRM.sql');
export const migrationsDir = path.join(repoRoot, 'backend', 'db', 'migrations');

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

/** Conjunto que la migración 0007 crea y al que asocia los datos previos. */
export const SLUG_INICIAL = 'parque-central-occidente';
/** Subconsulta para los INSERT crudos de las pruebas: no hay DEFAULT de idConjunto en la BD. */
export const CONJ_SQL = "(SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = 'parque-central-occidente')";

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

export async function idConjuntoInicial(db: TestDb): Promise<number> {
  const r = await db.pool
    .request()
    .input('slug', sql.VarChar(80), SLUG_INICIAL)
    .query<{ id: number }>('SELECT idConjunto AS id FROM dbo.CONJUNTOS WHERE slug = @slug');
  if (!r.recordset[0]) throw new Error('Falta el conjunto inicial (¿se aplicó 0007?)');
  return r.recordset[0].id;
}

export interface NuevoUsuario {
  nombre: string;
  correo: string;
  rol: 'ADMIN' | 'SOPORTE';
  /** Conjunto de la membresía; por defecto, el inicial. */
  slug?: string;
  /** Se aplica al usuario y a su membresía. */
  activo?: boolean;
}

/** Crea un usuario y su membresía (USUARIO_CONJUNTOS) en una transacción. Devuelve su id. */
export async function crearUsuario(db: TestDb, u: NuevoUsuario): Promise<number> {
  const tx = new sql.Transaction(db.pool);
  await tx.begin();
  try {
    const activo = u.activo ?? true;
    const r = await new sql.Request(tx)
      .input('nombre', sql.NVarChar(100), u.nombre)
      .input('rol', sql.VarChar(30), u.rol)
      .input('correo', sql.NVarChar(320), u.correo)
      .input('activo', sql.Bit, activo)
      .query<{ id: number }>(
        'INSERT INTO dbo.USUARIOS (nombre, rol, correo, activo) OUTPUT inserted.idUsuario AS id VALUES (@nombre, @rol, @correo, @activo)',
      );
    const id = r.recordset[0]!.id;
    const m = await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('slug', sql.VarChar(80), u.slug ?? SLUG_INICIAL)
      .input('rol', sql.VarChar(30), u.rol)
      .input('activo', sql.Bit, activo)
      .query(
        `INSERT INTO dbo.USUARIO_CONJUNTOS (idUsuario, idConjunto, rol, activo)
         SELECT @id, idConjunto, @rol, @activo FROM dbo.CONJUNTOS WHERE slug = @slug`,
      );
    if (m.rowsAffected[0] !== 1) throw new Error(`No existe el conjunto ${u.slug ?? SLUG_INICIAL}`);
    await tx.commit();
    return id;
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
}
