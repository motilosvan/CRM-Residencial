import type { z } from 'zod';
import { ErrorApi, ErrorAuth, type CodigoErrorAuth } from '../contratos';

export interface OpcionesPedido {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  cuerpo?: unknown;
  signal?: AbortSignal;
  /** Query string: se omiten `undefined` y cadenas vacías. */
  consulta?: ConsultaApi;
}

export type ConsultaApi = Record<string, string | number | boolean | undefined>;

const CODIGOS: readonly CodigoErrorAuth[] = [
  'CODIGO_INCORRECTO',
  'CODIGO_VENCIDO',
  'BLOQUEADO',
  'REENVIO_PRONTO',
  'SIN_MEMBRESIA',
  'RED',
];

const esCodigo = (c: unknown): c is CodigoErrorAuth => typeof c === 'string' && (CODIGOS as readonly string[]).includes(c);
const esAbort = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
const numero = (v: unknown) => (typeof v === 'number' ? v : undefined);

async function ejecutar(ruta: string, init: OpcionesPedido): Promise<{ estado: number; json: unknown }> {
  const conCuerpo = init.cuerpo !== undefined;
  let res: Response;
  try {
    res = await fetch('/api' + ruta + construirConsulta(init.consulta), {
      method: init.metodo ?? 'GET',
      credentials: 'same-origin',
      headers: conCuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: conCuerpo ? JSON.stringify(init.cuerpo) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (esAbort(e)) throw e;
    throw new ErrorAuth('RED');
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Cuerpo vacío o no JSON: se trata según el estado.
  }
  return { estado: res.status, json };
}

function aError(json: unknown): ErrorAuth {
  if (json && typeof json === 'object') {
    const c = json as Record<string, unknown>;
    if (esCodigo(c.codigo)) {
      return new ErrorAuth(c.codigo, {
        intentosRestantes: numero(c.intentosRestantes),
        desbloqueoEn: numero(c.desbloqueoEn),
      });
    }
  }
  return new ErrorAuth('RED');
}

function leer<T>(esquema: z.ZodType<T>, json: unknown): T {
  const r = esquema.safeParse(json);
  if (!r.success) throw new ErrorAuth('RED');
  return r.data;
}

/** Llama a `/api` + ruta. Errores de red o de forma → 'RED'; errores con código conocido → `ErrorAuth(codigo)`. */
export async function pedir<T>(ruta: string, esquema: z.ZodType<T>, init: OpcionesPedido = {}): Promise<T> {
  const { estado, json } = await ejecutar(ruta, init);
  if (estado < 200 || estado >= 300) throw aError(json);
  return leer(esquema, json);
}

/** Como `pedir`, pero devuelve `null` ante 401 (no hay sesión). */
export async function pedirOpcional<T>(ruta: string, esquema: z.ZodType<T>, init: OpcionesPedido = {}): Promise<T | null> {
  const { estado, json } = await ejecutar(ruta, init);
  if (estado === 401) return null;
  if (estado < 200 || estado >= 300) throw aError(json);
  return leer(esquema, json);
}

/** Objeto → `?a=1&b=2`; omite `undefined` y cadenas vacías. Cadena vacía si no queda nada. */
export function construirConsulta(consulta?: ConsultaApi): string {
  if (!consulta) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta)) {
    if (v === undefined || v === '') continue;
    q.set(k, String(v));
  }
  const texto = q.toString();
  return texto ? `?${texto}` : '';
}

async function llamar(ruta: string, init: OpcionesPedido): Promise<Response> {
  const conCuerpo = init.cuerpo !== undefined;
  try {
    return await fetch('/api' + ruta + construirConsulta(init.consulta), {
      method: init.metodo ?? 'GET',
      credentials: 'same-origin',
      headers: conCuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: conCuerpo ? JSON.stringify(init.cuerpo) : undefined,
      signal: init.signal,
    });
  } catch (e) {
    if (esAbort(e)) throw e;
    throw new ErrorApi(0, 'No pudimos conectar con el servidor.');
  }
}

async function errorDeRespuesta(res: Response): Promise<ErrorApi> {
  let mensaje: string | undefined;
  try {
    const json: unknown = await res.json();
    if (json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string') {
      mensaje = (json as { error: string }).error;
    }
  } catch {
    // Cuerpo vacío o no JSON: mensaje genérico.
  }
  return new ErrorApi(res.status, mensaje);
}

async function exigirOk(res: Response): Promise<void> {
  if (!res.ok) throw await errorDeRespuesta(res);
}

/** Llamada de datos: valida con Zod y lanza `ErrorApi` (red/forma → tipo 'RED'). Un 401 llega como 'NO_AUTENTICADO'. */
export async function pedirApi<T>(ruta: string, esquema: z.ZodType<T>, init: OpcionesPedido = {}): Promise<T> {
  const res = await llamar(ruta, init);
  await exigirOk(res);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ErrorApi(0, 'Respuesta inesperada del servidor.');
  }
  const r = esquema.safeParse(json);
  if (!r.success) throw new ErrorApi(0, 'Respuesta inesperada del servidor.');
  return r.data;
}

/** Para respuestas sin cuerpo útil (204 o se ignora el cuerpo). */
export async function pedirApiSinCuerpo(ruta: string, init: OpcionesPedido = {}): Promise<void> {
  const res = await llamar(ruta, init);
  await exigirOk(res);
}

/** Para respuestas de texto plano, p. ej. CSV de reportes. */
export async function pedirApiTexto(ruta: string, init: OpcionesPedido = {}): Promise<string> {
  const res = await llamar(ruta, init);
  await exigirOk(res);
  try {
    return await res.text();
  } catch {
    throw new ErrorApi(0, 'Respuesta inesperada del servidor.');
  }
}
