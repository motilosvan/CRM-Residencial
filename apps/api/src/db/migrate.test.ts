import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migratorConfigFromEnv } from '../config.js';
import { BASELINE_NAME, baselineBatches, checksumOf, migrate } from './migrate.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const baselinePath = path.join(repoRoot, 'ScriptBaseDatosCRM.sql');

const base = migratorConfigFromEnv();
const config = { ...base, database: `CorreosCRM_test_${randomBytes(4).toString('hex')}` };
let tmpDir: string;

async function query<T>(q: string): Promise<T[]> {
  const pool = await new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  try {
    return (await pool.request().query<T>(q)).recordset;
  } finally {
    await pool.close();
  }
}

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'crm-mig-'));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  const master = await new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
  }).connect();
  try {
    await master
      .request()
      .batch(
        `IF DB_ID('${config.database}') IS NOT NULL BEGIN
           ALTER DATABASE [${config.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
           DROP DATABASE [${config.database}];
         END`,
      );
  } finally {
    await master.close();
  }
});

describe('checksumOf', () => {
  it('ignora el BOM y los fines de línea CRLF (no deben "cambiar" una migración aplicada)', () => {
    const bom = String.fromCharCode(0xfeff);
    expect(checksumOf(`${bom}SELECT 1;\r\nGO\r\n`)).toBe(checksumOf('SELECT 1;\nGO\n'));
    expect(checksumOf('SELECT 1;')).not.toBe(checksumOf('SELECT 2;'));
  });
});

describe('baselineBatches', () => {
  it('omite CREATE DATABASE y USE de la línea base, pero conserva las tablas', async () => {
    const { readFile } = await import('node:fs/promises');
    const batches = baselineBatches(await readFile(baselinePath, 'utf8'));
    const all = batches.join('\n');
    expect(all).not.toMatch(/CREATE DATABASE/i);
    expect(all).not.toMatch(/^\s*USE\s/im);
    expect(all).toMatch(/CREATE TABLE SOLICITUDES/i);
  });
});

describe('migrate (integración con SQL Server)', () => {
  it('aplica la línea base en una BD nueva y es idempotente', async () => {
    const opts = { config, baselinePath, migrationsDir: tmpDir };

    const first = await migrate(opts);
    expect(first.aplicadas).toEqual([BASELINE_NAME]);

    const tablas = await query<{ name: string }>(
      `SELECT name FROM sys.tables WHERE name <> '__MIGRACIONES' ORDER BY name`,
    );
    expect(tablas.map((t) => t.name)).toEqual([
      'ASIGNACIONES',
      'CATEGORIAS',
      'CORREOS',
      'ESTADOS',
      'NOTIFICACIONES',
      'REPORTES',
      'RESIDENTES',
      'SOLICITUDES',
      'USUARIOS',
    ]);

    const second = await migrate(opts);
    expect(second.aplicadas).toEqual([]);
    expect(second.omitidas).toEqual([BASELINE_NAME]);

    const registros = await query<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.__MIGRACIONES');
    expect(registros[0]?.n).toBe(1);
  });

  it('aplica migraciones nuevas en orden, una sola vez', async () => {
    await writeFile(path.join(tmpDir, '0002_prueba.sql'), 'CREATE TABLE PRUEBA_A (id INT);\nGO\n');
    await writeFile(path.join(tmpDir, '0003_prueba.sql'), 'CREATE TABLE PRUEBA_B (id INT);\nGO\n');
    const opts = { config, baselinePath, migrationsDir: tmpDir };

    const res = await migrate(opts);
    expect(res.aplicadas).toEqual(['0002_prueba', '0003_prueba']);
    expect((await migrate(opts)).aplicadas).toEqual([]);
  });

  it('revierte por completo una migración que falla a la mitad', async () => {
    await writeFile(
      path.join(tmpDir, '0004_rota.sql'),
      'CREATE TABLE PRUEBA_C (id INT);\nGO\nINSERT INTO NO_EXISTE VALUES (1);\nGO\n',
    );
    await expect(
      migrate({ config, baselinePath, migrationsDir: tmpDir }),
    ).rejects.toThrow();

    const c = await query<{ id: number | null }>(`SELECT OBJECT_ID('dbo.PRUEBA_C', 'U') AS id`);
    expect(c[0]?.id).toBeNull();
    const reg = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM dbo.__MIGRACIONES WHERE nombre = '0004_rota'`,
    );
    expect(reg[0]?.n).toBe(0);

    await rm(path.join(tmpDir, '0004_rota.sql'));
  });

  it('rechaza editar una migración ya aplicada', async () => {
    await writeFile(path.join(tmpDir, '0002_prueba.sql'), 'CREATE TABLE PRUEBA_A (id INT, x INT);\nGO\n');
    await expect(
      migrate({ config, baselinePath, migrationsDir: tmpDir }),
    ).rejects.toThrow(/ya se aplicó pero su contenido cambió/);
  });

  it('adopta una BD que ya tiene las tablas de la línea base sin ejecutarla otra vez', async () => {
    await query('DELETE FROM dbo.__MIGRACIONES');
    await rm(path.join(tmpDir, '0002_prueba.sql'));
    await rm(path.join(tmpDir, '0003_prueba.sql'));

    const res = await migrate({ config, baselinePath, migrationsDir: tmpDir });
    expect(res.baselineAdoptada).toBe(true);
    expect(res.aplicadas).toEqual([]);
  });
});
