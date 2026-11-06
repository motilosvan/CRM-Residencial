import { describe, expect, it } from 'vitest';
import { cargarConfigIA } from './config.js';
import { MODELOS_GO_PERMITIDOS, ProveedorOpencodeGo } from './opencodeGo.js';
import { ErrorConfiguracionIA, ErrorCuota } from './proveedor.js';

const JSON_OK = { categoria: 'MANTENIMIENTO', prioridad: 'MEDIA', resumen: 'Fuga en el baño', justificacion: 'Menciona una fuga' };
const entrada = { asunto: 'Fuga', cuerpo: 'Hay agua' };

function proveedor(respuesta: () => Response) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const p = new ProveedorOpencodeGo({
    apiKey: 'llave-de-prueba', modelo: 'glm-5.3-flash', timeoutMs: 1000,
    fetch: (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return respuesta();
    }) as typeof fetch,
  });
  return { p, llamadas };
}
const ok = () => new Response(JSON.stringify({ model: 'glm-5.3-flash', choices: [{ message: { content: JSON.stringify(JSON_OK) } }] }));

describe('OpenCode Go · solicitud', () => {
  it('usa el endpoint de Go con esquema JSON y sin los campos propios de OpenRouter', async () => {
    const { p, llamadas } = proveedor(ok);
    expect(await p.sugerir(entrada)).toEqual({ ...JSON_OK, modelo: 'glm-5.3-flash' });
    const { url, init } = llamadas[0]!;
    const cuerpo = JSON.parse(init.body as string);
    expect(url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions');
    expect(cuerpo.model).toBe('glm-5.3-flash');
    expect(cuerpo.response_format.type).toBe('json_schema');
    expect(cuerpo.provider).toBeUndefined();
    expect(p.nombre).toBe('opencode-go');
  });

  it('se identifica con nombre propio y una sesión estable, como pide Go', async () => {
    const { p, llamadas } = proveedor(ok);
    await p.sugerir(entrada);
    await p.sugerir(entrada);
    const encabezados = llamadas.map((l) => l.init.headers as Record<string, string>);
    expect(encabezados[0]!['user-agent']).toBe('soc-crm-worker/1.0');
    expect(encabezados[0]!['x-opencode-session']).toMatch(/^[0-9a-f-]{36}$/);
    expect(encabezados[1]!['x-opencode-session']).toBe(encabezados[0]!['x-opencode-session']);
    expect(encabezados[0]!.authorization).toBe('Bearer llave-de-prueba');
  });
});

describe('OpenCode Go · errores', () => {
  it('llave rechazada: nombra la variable correcta', async () => {
    const { p } = proveedor(() => new Response('{}', { status: 401 }));
    const err = await p.sugerir(entrada).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorConfiguracionIA);
    expect((err as Error).message).toMatch(/OpenCode Go.*OPENCODE_API_KEY/);
  });

  it('límite de uso: pausa el ciclo', async () => {
    const { p } = proveedor(() => new Response(JSON.stringify({ error: { message: 'limit reached' } }), { status: 429 }));
    await expect(p.sugerir(entrada)).rejects.toBeInstanceOf(ErrorCuota);
  });
});

describe('OpenCode Go · configuración', () => {
  const base = { IA_PROVEEDOR: 'opencode-go', OPENCODE_API_KEY: 'clave' };

  it('exige su propia llave y usa glm-5.3-flash por defecto', () => {
    expect(() => cargarConfigIA({ IA_PROVEEDOR: 'opencode-go', OPENROUTER_API_KEY: 'otra' })).toThrow(/OPENCODE_API_KEY/);
    expect(cargarConfigIA(base)).toMatchObject({ proveedor: 'opencode-go', apiKey: 'clave', modelo: 'glm-5.3-flash' });
  });

  it('no usa la llave de otro proveedor', () => {
    expect(cargarConfigIA({ ...base, OPENROUTER_API_KEY: 'otra' }).apiKey).toBe('clave');
    expect(cargarConfigIA({ IA_PROVEEDOR: 'openrouter', OPENROUTER_API_KEY: 'otra', OPENCODE_API_KEY: 'clave' }).apiKey).toBe('otra');
  });

  it.each(['muse-spark-1.3-contributor', 'iceman-contributor-free', 'beam-free', 'deepseek-v4.1-flash', 'claude-haiku-5-5', 'inventado'])(
    'rechaza %s: no cumple la política de datos o la API requerida',
    (modelo) => {
      expect(() => cargarConfigIA({ ...base, IA_MODELO: modelo })).toThrow(/no está permitido/);
    },
  );

  it('acepta todos los modelos de la lista cerrada', () => {
    for (const modelo of MODELOS_GO_PERMITIDOS) expect(cargarConfigIA({ ...base, IA_MODELO: modelo }).modelo).toBe(modelo);
  });
});
