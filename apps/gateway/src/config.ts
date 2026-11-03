import { z } from 'zod';

/**
 * Configuración del Email Gateway (S3), leída de variables de entorno (ver .env.example).
 * Gmail: IMAP con "contraseña de aplicación" (requiere verificación en 2 pasos en la cuenta).
 * Los mensajes de error nombran la variable, nunca su valor.
 */
const booleano = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const EsquemaConfig = z.object({
  IMAP_HOST: z.string().trim().min(1).default('imap.gmail.com'),
  IMAP_PORT: z.coerce.number().int().min(1).max(65535).default(993),
  IMAP_USER: z.string({ error: 'falta (la dirección de la cuenta de Gmail)' }).trim().min(3),
  // Google muestra la contraseña de aplicación en grupos ("abcd efgh ijkl mnop"): se quitan los espacios.
  IMAP_APP_PASSWORD: z
    .string({ error: 'falta (contraseña de aplicación de Google)' })
    .transform((s) => s.replace(/\s+/g, ''))
    .pipe(z.string().min(1)),
  IMAP_MAILBOX: z.string().trim().min(1).max(200).default('INBOX'),
  /** Segundos entre ciclos de lectura (el plan pide 30–60 s). */
  IMAP_INTERVALO_S: z.coerce.number().int().min(10).max(3600).default(45),
  /** Primera lectura de una cuenta: solo los correos de los últimos N días (0 = solo los de hoy), no todo el historial. */
  IMAP_DIAS_INICIALES: z.coerce.number().int().min(0).max(365).default(7),
  /** Tope de correos por ciclo; el resto sigue en el ciclo siguiente (el checkpoint ya avanzó). */
  IMAP_MAX_POR_CICLO: z.coerce.number().int().min(1).max(1000).default(50),
  /** Fallos de un mismo correo antes de guardarlo SIN_CLASIFICAR para no bloquear el buzón. */
  IMAP_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(3),
  /** Marcar como leído en Gmail después del COMMIT. Por defecto no se toca el buzón (se abre en solo lectura). */
  IMAP_MARCAR_LEIDO: booleano,
});

export interface ConfigGateway {
  host: string;
  port: number;
  usuario: string;
  contrasena: string;
  buzon: string;
  /** Clave del checkpoint (T6): los UID son por buzón, así que la cuenta incluye la carpeta. */
  cuenta: string;
  intervaloS: number;
  diasIniciales: number;
  maxPorCiclo: number;
  maxIntentos: number;
  marcarLeido: boolean;
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): ConfigGateway {
  // Una variable vacía (IMAP_USER=) cuenta como no definida: así aplican los valores por defecto.
  const limpio = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const r = EsquemaConfig.safeParse(limpio);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración del gateway inválida (revise .env):\n${detalle}`);
  }
  const e = r.data;
  const usuario = e.IMAP_USER.toLowerCase();
  return {
    host: e.IMAP_HOST,
    port: e.IMAP_PORT,
    usuario,
    contrasena: e.IMAP_APP_PASSWORD,
    buzon: e.IMAP_MAILBOX,
    cuenta: `${usuario}/${e.IMAP_MAILBOX}`.slice(0, 255),
    intervaloS: e.IMAP_INTERVALO_S,
    diasIniciales: e.IMAP_DIAS_INICIALES,
    maxPorCiclo: e.IMAP_MAX_POR_CICLO,
    maxIntentos: e.IMAP_MAX_INTENTOS,
    marcarLeido: e.IMAP_MARCAR_LEIDO,
  };
}
