import { z } from 'zod';
import { MODELOS_GO_PERMITIDOS } from './opencodeGo.js';

/**
 * Configuración del worker de IA, leída de variables de entorno (ver .env.example).
 * Por defecto está apagado: sin IA el sistema funciona igual, con la clasificación por reglas.
 * Los mensajes de error nombran la variable, nunca su valor.
 */
const EsquemaConfig = z.object({
  IA_PROVEEDOR: z.enum(['ninguno', 'openrouter', 'opencode-go']).default('ninguno'),
  OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
  OPENCODE_API_KEY: z.string().trim().min(1).optional(),
  /** Debe aceptar esquema JSON. Sin definir, usa el predeterminado del proveedor. */
  IA_MODELO: z.string().trim().min(1).max(200).optional(),
  IA_INTERVALO_S: z.coerce.number().int().min(10).max(3600).default(60),
  /** Por ciclo. OpenRouter permite 20 solicitudes por minuto a modelos gratuitos, y 50 o 1.000 al día según los créditos. */
  IA_MAX_POR_CICLO: z.coerce.number().int().min(1).max(20).default(5),
  /** Segundos entre llamadas: el proveedor gratuito puede limitar ráfagas por debajo de lo que permite OpenRouter. */
  IA_PAUSA_ENTRE_S: z.coerce.number().int().min(0).max(120).default(10),
  /** Respuestas inválidas de un mismo correo antes de dejarlo con la clasificación por reglas. */
  IA_MAX_INTENTOS: z.coerce.number().int().min(1).max(20).default(3),
  IA_ESPERA_REINTENTO_MIN: z.coerce.number().int().min(1).max(1440).default(30),
  IA_TIMEOUT_S: z.coerce.number().int().min(5).max(300).default(60),
});

export interface ConfigIA {
  proveedor: 'ninguno' | 'openrouter' | 'opencode-go';
  apiKey: string;
  modelo: string;
  intervaloS: number;
  maxPorCiclo: number;
  pausaEntreLlamadasMs: number;
  maxIntentos: number;
  esperaReintentoMin: number;
  timeoutMs: number;
}

/**
 * En OpenRouter, varios modelos `:free` no cumplen data_collection=deny porque entrenan con los datos, y la
 * lista cambia con el tiempo. En OpenCode Go, solo se admiten los de MODELOS_GO_PERMITIDOS.
 */
const MODELO_POR_DEFECTO = {
  ninguno: '',
  openrouter: 'xingchen-agi/xing4.0-29b-a4b:free',
  'opencode-go': 'glm-5.3-flash',
} as const;

const invalida = (detalle: string) => new Error(`Configuración de IA inválida (revise .env):\n  - ${detalle}`);

export function cargarConfigIA(env: NodeJS.ProcessEnv = process.env): ConfigIA {
  // Una variable vacía cuenta como no definida: así aplican los valores por defecto.
  const limpio = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const r = EsquemaConfig.safeParse(limpio);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración de IA inválida (revise .env):\n${detalle}`);
  }
  const e = r.data;
  if (e.IA_PROVEEDOR === 'openrouter' && !e.OPENROUTER_API_KEY) {
    throw invalida('OPENROUTER_API_KEY: falta (se crea en https://openrouter.ai/keys)');
  }
  if (e.IA_PROVEEDOR === 'opencode-go' && !e.OPENCODE_API_KEY) {
    throw invalida('OPENCODE_API_KEY: falta (es la llave de la consola de OpenCode)');
  }
  const modelo = e.IA_MODELO ?? MODELO_POR_DEFECTO[e.IA_PROVEEDOR];
  if (e.IA_PROVEEDOR === 'opencode-go' && !MODELOS_GO_PERMITIDOS.has(modelo)) {
    throw invalida(
      `IA_MODELO: "${modelo}" no está permitido con OpenCode Go. Solo se admiten modelos sin entrenamiento, con 0 días ` +
        `de retención y esquema JSON: ${[...MODELOS_GO_PERMITIDOS].join(', ')}`,
    );
  }
  return {
    proveedor: e.IA_PROVEEDOR,
    apiKey: (e.IA_PROVEEDOR === 'opencode-go' ? e.OPENCODE_API_KEY : e.OPENROUTER_API_KEY) ?? '',
    modelo,
    intervaloS: e.IA_INTERVALO_S,
    maxPorCiclo: e.IA_MAX_POR_CICLO,
    pausaEntreLlamadasMs: e.IA_PAUSA_ENTRE_S * 1000,
    maxIntentos: e.IA_MAX_INTENTOS,
    esperaReintentoMin: e.IA_ESPERA_REINTENTO_MIN,
    timeoutMs: e.IA_TIMEOUT_S * 1000,
  };
}
