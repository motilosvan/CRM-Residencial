import 'dotenv/config';

const NOMBRE_BD_VALIDO = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ES_LOCAL = /^(localhost|127\.0\.0\.1|::1)$/i;

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  /** TLS hacia SQL Server. Por defecto activo salvo en localhost. */
  encrypt: boolean;
  trustServerCertificate: boolean;
}

function requerida(env: NodeJS.ProcessEnv, nombre: string): string {
  const v = env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre} (copie .env.example a .env y complétela)`);
  return v;
}

function base(env: NodeJS.ProcessEnv): Omit<DbConfig, 'user' | 'password'> {
  const host = env.DB_HOST ?? 'localhost';
  const local = ES_LOCAL.test(host);
  const cfg = {
    host,
    port: Number(env.DB_PORT ?? 1433),
    database: env.DB_NAME ?? 'CorreosCRM',
    encrypt: env.DB_ENCRYPT ? env.DB_ENCRYPT === 'true' : !local,
    trustServerCertificate: env.DB_TRUST_SERVER_CERT ? env.DB_TRUST_SERVER_CERT === 'true' : local,
  };
  if (!NOMBRE_BD_VALIDO.test(cfg.database)) throw new Error(`DB_NAME inválido: ${cfg.database}`);
  return cfg;
}

/**
 * Identidad de la APLICACIÓN (rol crm_app, mínimo privilegio). No hay valores por defecto
 * para usuario ni contraseña: sin configuración, la app no arranca.
 */
export function dbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  return { ...base(env), user: requerida(env, 'DB_USER'), password: requerida(env, 'DB_PASSWORD') };
}

/** Identidad del MIGRADOR (crea BD, aplica DDL, crea el login de la app). Solo para db:migrate, pruebas y demo. */
export function migratorConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  return {
    ...base(env),
    user: requerida(env, 'DB_MIGRATOR_USER'),
    password: requerida(env, 'DB_MIGRATOR_PASSWORD'),
  };
}

export { NOMBRE_BD_VALIDO };
