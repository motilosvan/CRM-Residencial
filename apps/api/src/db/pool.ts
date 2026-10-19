import sql from 'mssql';
import type { DbConfig } from '../config.js';

/**
 * Única fuente de opciones de conexión. `abortTransactionOnError: false` se fija explícitamente:
 * T1 depende de que un INSERT duplicado (2601/2627) aborte solo la sentencia, no la transacción.
 */
export function poolConfig(cfg: DbConfig, opts: { database?: string; max?: number; min?: number } = {}): sql.config {
  return {
    server: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: opts.database ?? cfg.database,
    options: {
      encrypt: cfg.encrypt,
      trustServerCertificate: cfg.trustServerCertificate,
      abortTransactionOnError: false,
    },
    pool: { max: opts.max ?? 10, min: opts.min ?? 0, idleTimeoutMillis: 600_000 },
    requestTimeout: 120_000,
  };
}

export async function crearPool(cfg: DbConfig, opts: { database?: string; max?: number } = {}): Promise<sql.ConnectionPool> {
  return new sql.ConnectionPool(poolConfig(cfg, opts)).connect();
}
