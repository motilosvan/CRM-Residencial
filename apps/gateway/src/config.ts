import { z } from 'zod';

/**
 * Configuración del Email Gateway (S3), leída de variables de entorno (ver .env.example).
 * Los buzones (cuenta, contraseña de aplicación cifrada, carpeta, días iniciales, marcar leído) viven
 * por conjunto en dbo.BUZONES_CONJUNTO y los conecta el ADMIN desde el panel; aquí solo queda el ritmo
 * del ciclo y AUTH_SECRETO, del que se deriva la clave para descifrar esas contraseñas (el mismo que
 * usa la API). Los mensajes de error nombran la variable, nunca su valor.
 */
const EsquemaConfig = z.object({
  AUTH_SECRETO: z
    .string({ error: 'falta (el mismo secreto que usa la API; descifra las contraseñas de los buzones)' })
    .min(32, 'debe tener al menos 32 caracteres'),
  /** Segundos entre ciclos de lectura (el plan pide 30–60 s). */
  IMAP_INTERVALO_S: z.coerce.number().int().min(10).max(3600).default(45),
  /** Tope de correos por ciclo y buzón; el resto sigue en el ciclo siguiente (el checkpoint ya avanzó). */
  IMAP_MAX_POR_CICLO: z.coerce.number().int().min(1).max(1000).default(50),
  /** Fallos de un mismo correo antes de guardarlo SIN_CLASIFICAR para no bloquear el buzón. */
  IMAP_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(3),
});

export interface ConfigGateway {
  /** AUTH_SECRETO: de él se deriva la clave AES de las contraseñas de buzón. */
  secreto: string;
  intervaloS: number;
  maxPorCiclo: number;
  maxIntentos: number;
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): ConfigGateway {
  // Una variable vacía (IMAP_INTERVALO_S=) cuenta como no definida: así aplican los valores por defecto.
  const limpio = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const r = EsquemaConfig.safeParse(limpio);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración del gateway inválida (revise .env):\n${detalle}`);
  }
  const e = r.data;
  return {
    secreto: e.AUTH_SECRETO,
    intervaloS: e.IMAP_INTERVALO_S,
    maxPorCiclo: e.IMAP_MAX_POR_CICLO,
    maxIntentos: e.IMAP_MAX_INTENTOS,
  };
}
