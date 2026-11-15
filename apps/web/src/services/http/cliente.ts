import type { z } from 'zod';
import { ErrorAuth, type CodigoErrorAuth } from '../contratos';

export interface OpcionesPedido {
  metodo?: 'GET' | 'POST';
  cuerpo?: unknown;
  signal?: AbortSignal;
}

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
    res = await fetch('/api' + ruta, {
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
