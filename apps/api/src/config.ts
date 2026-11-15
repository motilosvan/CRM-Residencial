import 'dotenv/config';
import type { ConfigSmtp } from './modules/enviador.js';

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

export interface AccesoConfig {
  secreto: string;
  /** `null` si falta SMTP_HOST: solo válido en desarrollo (el código se escribe en la consola de la API). */
  smtp: ConfigSmtp | null;
  adminInicialCorreo: string | null;
  cookieSegura: boolean;
  origenes: Set<string>;
  desarrollo: boolean;
}

const ORIGENES_POR_DEFECTO = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Una variable vacía cuenta como no definida. Devuelve el valor sin espacios, o undefined. */
function opcional(env: NodeJS.ProcessEnv, nombre: string): string | undefined {
  const v = env[nombre]?.trim();
  return v ? v : undefined;
}

function origenValido(valor: string): string | null {
  try {
    const u = new URL(valor);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Configuración del acceso (OTP, sesión, SMTP, orígenes). Los errores nombran la variable, nunca su valor.
 * Sin SMTP_HOST en producción lanza: no habría forma de entregar el código.
 */
export function accesoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AccesoConfig {
  const secreto = env.AUTH_SECRETO ?? '';
  if (secreto.length < 32) throw new Error('AUTH_SECRETO es obligatorio y debe tener al menos 32 caracteres');
  const desarrollo = env.NODE_ENV !== 'production';

  let smtp: ConfigSmtp | null = null;
  const host = opcional(env, 'SMTP_HOST');
  if (host) {
    const port = Number(opcional(env, 'SMTP_PORT') ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT inválido (debe ser un puerto entre 1 y 65535)');
    const user = opcional(env, 'SMTP_USER');
    if (!user) throw new Error('Falta la variable de entorno SMTP_USER (obligatoria con SMTP_HOST)');
    // La contraseña no se recorta: los espacios pueden ser parte de ella.
    const password = env.SMTP_PASSWORD;
    if (!password) throw new Error('Falta la variable de entorno SMTP_PASSWORD (obligatoria con SMTP_HOST)');
    const remitente = opcional(env, 'SMTP_FROM');
    if (!remitente) throw new Error('Falta la variable de entorno SMTP_FROM (obligatoria con SMTP_HOST)');
    smtp = { host, port, user, password, remitente };
  } else if (!desarrollo) {
    throw new Error('Falta la variable de entorno SMTP_HOST: en producción el código de acceso solo se puede entregar por correo');
  }

  let adminInicialCorreo: string | null = null;
  const admin = opcional(env, 'ADMIN_INICIAL_CORREO');
  if (admin) {
    if (!CORREO_VALIDO.test(admin) || admin.length > 320) throw new Error('ADMIN_INICIAL_CORREO inválido (debe ser un correo)');
    adminInicialCorreo = admin.toLowerCase();
  }

  const crudos = opcional(env, 'WEB_ORIGENES')?.split(',').map((o) => o.trim()).filter(Boolean) ?? ORIGENES_POR_DEFECTO;
  const origenes = new Set<string>();
  for (const o of crudos) {
    const normal = origenValido(o);
    if (!normal) throw new Error('WEB_ORIGENES inválido (lista de orígenes http(s) separados por comas)');
    origenes.add(normal);
  }

  return { secreto, smtp, adminInicialCorreo, cookieSegura: env.COOKIE_SEGURA === 'true', origenes, desarrollo };
}

export { NOMBRE_BD_VALIDO };
