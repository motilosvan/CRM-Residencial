import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import sql from 'mssql';
import { NOMBRE_BD_VALIDO, type DbConfig } from '../config.js';
import { poolConfig } from './pool.js';
import { splitBatches } from './splitBatches.js';

export const BASELINE_NAME = '0001_baseline';
const MIGRATION_FILE = /^(\d{4})_[\w-]+\.sql$/;

export interface MigrateOptions {
  config: DbConfig;
  /** Script de línea base (ScriptBaseDatosCRM.sql). Se registra como 0001_baseline. */
  baselinePath: string;
  /** Carpeta con las migraciones 0002_*.sql, 0003_*.sql ... */
  migrationsDir: string;
  log?: (msg: string) => void;
}

export interface MigrateResult {
  aplicadas: string[];
  omitidas: string[];
  /** true si la BD ya tenía las tablas de la línea base y solo se registró. */
  baselineAdoptada: boolean;
}

interface Migration {
  name: string;
  batches: string[];
  checksum: string;
}

/** Un BOM (archivos guardados desde SSMS) rompe el primer lote: se elimina. */
const BOM = 0xfeff;
const sinBom = (s: string) => (s.charCodeAt(0) === BOM ? s.slice(1) : s);

/** Ni los fines de línea (git autocrlf) ni un BOM deben alterar el checksum. */
export function checksumOf(content: string): string {
  return createHash('sha256').update(sinBom(content).replace(/\r\n/g, '\n')).digest('hex');
}

/** Tablas que debe tener una BD para adoptar la línea base sin ejecutarla. */
const TABLAS_LINEA_BASE = [
  'RESIDENTES', 'CATEGORIAS', 'ESTADOS', 'USUARIOS', 'CORREOS', 'REPORTES', 'SOLICITUDES', 'NOTIFICACIONES', 'ASIGNACIONES',
];

function stripLeadingComments(batch: string): string {
  return batch.replace(/^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
}

/**
 * El script de línea base crea y selecciona su propia BD. El runner ya lo hace
 * (conexión directa a la BD destino), así que se omiten esos dos lotes.
 */
export function baselineBatches(script: string): string[] {
  return splitBatches(script).filter((b) => {
    const head = stripLeadingComments(b);
    return !/^IF NOT EXISTS\s*\(SELECT name FROM sys\.databases/i.test(head) && !/^USE\s/i.test(head);
  });
}

/** Una sola conexión: el applock de sesión debe vivir en la misma conexión que migra. */
const unaConexion = (cfg: DbConfig, database: string) =>
  new sql.ConnectionPool(poolConfig(cfg, { database, max: 1, min: 1 }));

async function loadMigrations(opts: MigrateOptions): Promise<Migration[]> {
  const baseline = await readFile(opts.baselinePath, 'utf8');
  const out: Migration[] = [
    { name: BASELINE_NAME, batches: baselineBatches(sinBom(baseline)), checksum: checksumOf(baseline) },
  ];

  const files = (await readdir(opts.migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const m = MIGRATION_FILE.exec(file);
    if (!m) throw new Error(`Nombre de migración inválido: ${file} (use NNNN_descripcion.sql)`);
    if (m[1] === '0001') throw new Error(`0001 está reservado para la línea base: ${file}`);
    const content = await readFile(path.join(opts.migrationsDir, file), 'utf8');
    out.push({
      name: file.replace(/\.sql$/, ''),
      batches: splitBatches(sinBom(content)),
      checksum: checksumOf(content),
    });
  }
  return out;
}

async function ensureDatabase(cfg: DbConfig): Promise<void> {
  if (!NOMBRE_BD_VALIDO.test(cfg.database)) throw new Error(`Nombre de BD inválido: ${cfg.database}`);
  const master = await unaConexion(cfg, 'master').connect();
  try {
    // Dos migradores a la vez sobre una BD nueva competirían en CREATE/ALTER DATABASE.
    const lock = await master
      .request()
      .input('recurso', sql.NVarChar(255), `crm_migrate_db_${cfg.database}`)
      .output('res', sql.Int)
      .query(
        `DECLARE @r INT;
         EXEC @r = sp_getapplock @Resource = @recurso, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 60000;
         SELECT @res = @r;`,
      );
    if ((lock.output.res as number) < 0) throw new Error('No se pudo obtener el bloqueo de creación de BD');

    // El nombre fue validado contra una lista blanca estricta; QUOTENAME lo escapa igualmente.
    try {
      await master
        .request()
        .input('db', sql.NVarChar, cfg.database)
        .query(
          `IF DB_ID(@db) IS NULL
           BEGIN
             DECLARE @stmt NVARCHAR(200) = N'CREATE DATABASE ' + QUOTENAME(@db);
             EXEC (@stmt);
           END`,
        );
    } catch (err) {
      if ((err as { number?: number }).number !== 1801) throw err; // 1801 = ya existe (la creó otro proceso)
    }

    // ALTER DATABASE no puede ir dentro de la transacción de una migración, por eso vive aquí.
    // RCSI: los lectores no bloquean a los escritores. SNAPSHOT: lecturas consistentes para reportes (T5).
    // Solo se ejecuta si falta alguna opción (RCSI exige cerrar otras conexiones a la BD).
    await master
      .request()
      .input('db', sql.NVarChar, cfg.database)
      .query(
        `DECLARE @stmt NVARCHAR(400);
         IF EXISTS (SELECT 1 FROM sys.databases WHERE name = @db
                      AND (is_read_committed_snapshot_on = 0 OR snapshot_isolation_state = 0))
         BEGIN
           SET @stmt = N'ALTER DATABASE ' + QUOTENAME(@db)
                     + N' SET ALLOW_SNAPSHOT_ISOLATION ON; ALTER DATABASE ' + QUOTENAME(@db)
                     + N' SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;';
           EXEC (@stmt);
         END`,
      );
  } finally {
    await master.close();
  }
}

async function applyMigration(pool: sql.ConnectionPool, m: Migration): Promise<void> {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // Cualquier error aborta el lote y la transacción: nunca "seguir ejecutando tras un fallo".
    await new sql.Request(tx).batch('SET XACT_ABORT ON');
    for (const batch of m.batches) {
      await new sql.Request(tx).batch(batch);
    }
    await new sql.Request(tx)
      .input('nombre', sql.NVarChar(200), m.name)
      .input('checksum', sql.Char(64), m.checksum)
      .query('INSERT INTO dbo.__MIGRACIONES (nombre, checksum) VALUES (@nombre, @checksum)');
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
}

export async function migrate(opts: MigrateOptions): Promise<MigrateResult> {
  const log = opts.log ?? (() => undefined);
  const result: MigrateResult = { aplicadas: [], omitidas: [], baselineAdoptada: false };

  const migrations = await loadMigrations(opts);
  await ensureDatabase(opts.config);

  const pool = await unaConexion(opts.config, opts.config.database).connect();
  try {
    // Evita que dos procesos migren a la vez (el lock se libera al cerrar la conexión).
    const lock = await pool
      .request()
      .output('res', sql.Int)
      .query(
        `DECLARE @r INT;
         EXEC @r = sp_getapplock @Resource = 'crm_migrate', @LockMode = 'Exclusive',
                                 @LockOwner = 'Session', @LockTimeout = 60000;
         SELECT @res = @r;`,
      );
    if ((lock.output.res as number) < 0) throw new Error('No se pudo obtener el bloqueo de migración');

    await pool.request().batch(
      `IF OBJECT_ID('dbo.__MIGRACIONES', 'U') IS NULL
       CREATE TABLE dbo.__MIGRACIONES (
         nombre     NVARCHAR(200) NOT NULL PRIMARY KEY,
         checksum   CHAR(64)      NOT NULL,
         aplicadaEn DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
       )`,
    );

    const rows = await pool.request().query<{ nombre: string; checksum: string }>(
      'SELECT nombre, checksum FROM dbo.__MIGRACIONES',
    );
    const applied = new Map(rows.recordset.map((r) => [r.nombre, r.checksum]));

    for (const m of migrations) {
      const previous = applied.get(m.name);
      if (previous !== undefined) {
        if (previous !== m.checksum) {
          throw new Error(
            `La migración ${m.name} ya se aplicó pero su contenido cambió. ` +
              'No se editan migraciones aplicadas: cree una nueva.',
          );
        }
        result.omitidas.push(m.name);
        continue;
      }

      if (m.name === BASELINE_NAME) {
        const presentes = await pool
          .request()
          .query<{ name: string }>(`SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('dbo')`);
        const nombres = new Set(presentes.recordset.map((r) => r.name.toUpperCase()));
        const faltan = TABLAS_LINEA_BASE.filter((t) => !nombres.has(t));
        if (faltan.length > 0 && faltan.length < TABLAS_LINEA_BASE.length) {
          throw new Error(`La BD tiene una línea base incompleta (faltan: ${faltan.join(', ')}). Revísela antes de migrar.`);
        }
        if (faltan.length === 0) {
          await pool
            .request()
            .input('nombre', sql.NVarChar(200), m.name)
            .input('checksum', sql.Char(64), m.checksum)
            .query('INSERT INTO dbo.__MIGRACIONES (nombre, checksum) VALUES (@nombre, @checksum)');
          result.baselineAdoptada = true;
          result.omitidas.push(m.name);
          log(`${m.name}: la BD ya tenía las tablas; se registró sin ejecutar`);
          continue;
        }
      }

      log(`Aplicando ${m.name} ...`);
      await applyMigration(pool, m);
      result.aplicadas.push(m.name);
    }

    await pool
      .request()
      .query(`EXEC sp_releaseapplock @Resource = 'crm_migrate', @LockOwner = 'Session'`);
  } finally {
    await pool.close();
  }
  return result;
}
