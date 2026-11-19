import sql from 'mssql';

export type Isolation = 'READ_COMMITTED' | 'REPEATABLE_READ' | 'SERIALIZABLE' | 'SNAPSHOT';

const LEVELS: Record<Isolation, number> = {
  READ_COMMITTED: sql.ISOLATION_LEVEL.READ_COMMITTED,
  REPEATABLE_READ: sql.ISOLATION_LEVEL.REPEATABLE_READ,
  SERIALIZABLE: sql.ISOLATION_LEVEL.SERIALIZABLE,
  SNAPSHOT: sql.ISOLATION_LEVEL.SNAPSHOT,
};

/** 1205 = víctima de deadlock; 3960 = conflicto de actualización en aislamiento SNAPSHOT. */
const TRANSIENT_ERRORS = new Set([1205, 3960]);

export interface WithTxOptions {
  isolation?: Isolation;
  /** Intentos totales (incluye el primero). */
  maxAttempts?: number;
  /** Se invoca antes de cada reintento; útil para métricas y pruebas. */
  onRetry?: (attempt: number, err: unknown) => void;
}

/** Contexto que recibe el callback: toda consulta debe nacer de `request()` para quedar dentro de la transacción. */
export interface Tx {
  request(): sql.Request;
}

export function sqlErrorNumber(err: unknown): number | undefined {
  const e = err as { number?: number; originalError?: { number?: number; info?: { number?: number } } };
  return e?.number ?? e?.originalError?.info?.number ?? e?.originalError?.number;
}

export function isTransient(err: unknown): boolean {
  const n = sqlErrorNumber(err);
  return n !== undefined && TRANSIENT_ERRORS.has(n);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ejecuta `fn` dentro de una transacción: COMMIT si termina, ROLLBACK si lanza.
 * Reintenta toda la transacción (no solo la consulta) ante deadlock (1205) o
 * conflicto de snapshot (3960). Cualquier otro error se propaga sin reintentar.
 * `fn` puede ejecutarse más de una vez: no debe tener efectos fuera de la BD.
 */
export async function withTx<T>(
  pool: sql.ConnectionPool,
  fn: (tx: Tx) => Promise<T>,
  opts: WithTxOptions = {},
): Promise<T> {
  const { isolation = 'READ_COMMITTED', maxAttempts = 3, onRetry } = opts;

  for (let attempt = 1; ; attempt++) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin(LEVELS[isolation]);
    try {
      const result = await fn({ request: () => new sql.Request(transaction) });
      await transaction.commit();
      return result;
    } catch (err) {
      // Tras un deadlock o un THROW en un trigger el servidor ya revirtió la transacción: el rollback
      // falla con EABORT/ENOTBEGUN y es benigno. Cualquier otro fallo se registra (sin datos) y el
      // error original se propaga igual. Regla: nunca lanzar consultas en paralelo dentro de `fn`.
      await transaction.rollback().catch((rbErr: { code?: string; message?: string }) => {
        if (rbErr?.code !== 'EABORT' && rbErr?.code !== 'ENOTBEGUN') {
          console.error(`withTx: fallo inesperado en ROLLBACK (${rbErr?.code ?? 'sin código'})`);
        }
      });
      if (isTransient(err) && attempt < maxAttempts) {
        onRetry?.(attempt, err);
        await sleep(10 * attempt + Math.floor(Math.random() * 40));
        continue;
      }
      throw err;
    }
  }
}
