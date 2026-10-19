import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';
import { dropTempDb, runSql, tempDbConfig } from '../../test/helpers/testDb.js';
import { isTransient, withTx } from './withTx.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const baselinePath = path.join(root, 'ScriptBaseDatosCRM.sql');
const config = tempDbConfig('CorreosCRM_tx');

let pool: sql.ConnectionPool;
let emptyDir: string;

const q = <T = Record<string, unknown>>(s: string) => runSql<T>(config, s);

beforeAll(async () => {
  emptyDir = await mkdtemp(path.join(os.tmpdir(), 'crm-tx-'));
  await migrate({ config, baselinePath, migrationsDir: emptyDir });
  await q(`CREATE TABLE T (id INT PRIMARY KEY, v INT NOT NULL); INSERT INTO T VALUES (1, 0), (2, 0);`);
  pool = await new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    options: { encrypt: false, trustServerCertificate: true },
    pool: { max: 10 },
  }).connect();
});

afterAll(async () => {
  await pool?.close();
  await rm(emptyDir, { recursive: true, force: true });
  await dropTempDb(config);
});

const transientError = () => Object.assign(new Error('simulado'), { number: 1205 });

describe('isTransient', () => {
  it('reconoce deadlock (1205) y conflicto de snapshot (3960), y nada más', () => {
    expect(isTransient({ number: 1205 })).toBe(true);
    expect(isTransient({ number: 3960 })).toBe(true);
    expect(isTransient({ originalError: { info: { number: 1205 } } })).toBe(true);
    expect(isTransient({ number: 2627 })).toBe(false);
    expect(isTransient(new Error('x'))).toBe(false);
  });
});

describe('withTx', () => {
  it('hace COMMIT y devuelve el resultado de fn', async () => {
    const out = await withTx(pool, async (tx) => {
      await tx.request().query('UPDATE T SET v = 10 WHERE id = 1');
      return 'ok';
    });
    expect(out).toBe('ok');
    expect((await q<{ v: number }>('SELECT v FROM T WHERE id = 1'))[0]?.v).toBe(10);
  });

  it('hace ROLLBACK completo si fn lanza a mitad y no reintenta errores no transitorios', async () => {
    let calls = 0;
    await expect(
      withTx(pool, async (tx) => {
        calls++;
        await tx.request().query('UPDATE T SET v = 99 WHERE id = 1');
        await tx.request().query('INSERT INTO T VALUES (1, 0)'); // PK duplicada
      }),
    ).rejects.toThrow(/PRIMARY KEY|duplicate/i);
    expect(calls).toBe(1);
    expect((await q<{ v: number }>('SELECT v FROM T WHERE id = 1'))[0]?.v).toBe(10);
  });

  it('reintenta un error transitorio y termina con éxito', async () => {
    let calls = 0;
    const retries: number[] = [];
    const out = await withTx(
      pool,
      async (tx) => {
        calls++;
        await tx.request().query('UPDATE T SET v = v + 1 WHERE id = 2');
        if (calls < 3) throw transientError();
        return calls;
      },
      { maxAttempts: 3, onRetry: (a) => retries.push(a) },
    );
    expect(out).toBe(3);
    expect(retries).toEqual([1, 2]);
    // Los dos intentos fallidos se revirtieron: solo cuenta el tercero.
    expect((await q<{ v: number }>('SELECT v FROM T WHERE id = 2'))[0]?.v).toBe(1);
  });

  it('se rinde tras maxAttempts y propaga el error', async () => {
    let calls = 0;
    await expect(
      withTx(
        pool,
        async () => {
          calls++;
          throw transientError();
        },
        { maxAttempts: 3 },
      ),
    ).rejects.toThrow('simulado');
    expect(calls).toBe(3);
  });

  it('aplica el nivel de aislamiento pedido', async () => {
    const level = async (isolation: 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE' | 'SNAPSHOT') =>
      withTx(
        pool,
        async (tx) => {
          const r = await tx
            .request()
            .query<{ l: number }>('SELECT transaction_isolation_level AS l FROM sys.dm_exec_sessions WHERE session_id = @@SPID');
          return r.recordset[0]?.l;
        },
        { isolation },
      );
    expect(await level('READ_COMMITTED')).toBe(2);
    expect(await level('REPEATABLE_READ')).toBe(3);
    expect(await level('SERIALIZABLE')).toBe(4);
    expect(await level('SNAPSHOT')).toBe(5);
  });

  it('la BD tiene RCSI y SNAPSHOT habilitados por el runner', async () => {
    const r = await runSql<{ rcsi: boolean; snap: number }>(
      { ...config, database: 'master' },
      `SELECT is_read_committed_snapshot_on AS rcsi, snapshot_isolation_state AS snap FROM sys.databases WHERE name = '${config.database}'`,
    );
    expect(r[0]).toEqual({ rcsi: true, snap: 1 });
  });

  it('se recupera de un deadlock real: una víctima reintenta y ambas transacciones terminan', async () => {
    await q('UPDATE T SET v = 0');

    // Barrera: ambas transacciones deben tener su primer bloqueo antes de pedir el segundo.
    let arrived = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const barrier = async () => {
      if (++arrived === 2) release();
      await gate;
    };

    const retries: number[] = [];
    const worker = (first: number, second: number) => {
      let attempt = 0;
      return withTx(
        pool,
        async (tx) => {
          attempt++;
          await tx.request().input('id', sql.Int, first).query('SELECT v FROM T WITH (UPDLOCK, ROWLOCK) WHERE id = @id');
          if (attempt === 1) await barrier();
          await tx.request().input('id', sql.Int, second).query('UPDATE T SET v = v + 1 WHERE id = @id');
          await tx.request().input('id', sql.Int, first).query('UPDATE T SET v = v + 1 WHERE id = @id');
        },
        { maxAttempts: 5, onRetry: (a) => retries.push(a) },
      );
    };

    await Promise.all([worker(1, 2), worker(2, 1)]);

    expect(retries.length).toBeGreaterThanOrEqual(1); // hubo al menos una víctima de deadlock
    const rows = await q<{ id: number; v: number }>('SELECT id, v FROM T ORDER BY id');
    expect(rows).toEqual([
      { id: 1, v: 2 },
      { id: 2, v: 2 },
    ]);
  });

  it('serializa escritores concurrentes con UPDLOCK: no se pierden actualizaciones', async () => {
    await q('UPDATE T SET v = 0 WHERE id = 1');
    await Promise.all(
      Array.from({ length: 20 }, () =>
        withTx(pool, async (tx) => {
          const r = await tx.request().query<{ v: number }>('SELECT v FROM T WITH (UPDLOCK, ROWLOCK) WHERE id = 1');
          await tx.request().input('v', sql.Int, (r.recordset[0]?.v ?? 0) + 1).query('UPDATE T SET v = @v WHERE id = 1');
        }),
      ),
    );
    expect((await q<{ v: number }>('SELECT v FROM T WHERE id = 1'))[0]?.v).toBe(20);
  });
});
