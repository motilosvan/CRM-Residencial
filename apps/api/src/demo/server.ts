/**
 * VISOR DE DEMOSTRACIÓN (solo local, sin autenticación). Sirve para ver las transacciones reales
 * funcionando. NO es el panel del MVP: la API REST con login es S4 y el panel es S5.
 *
 * Aunque escucha solo en 127.0.0.1, un navegador puede ser usado contra él (CSRF, DNS rebinding):
 * por eso valida Host y Origin, exige JSON en los POST, limita el tamaño del cuerpo y envía cabeceras
 * de seguridad. Migra con la identidad del migrador y atiende con la de la aplicación (rol crm_app).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { dbConfigFromEnv, migratorConfigFromEnv } from '../config.js';
import { migrate } from '../db/migrate.js';
import { crearPool } from '../db/pool.js';
import { asegurarUsuarioApp } from '../db/usuarioApp.js';
import { CATEGORIAS } from '../domain/clasificador.js';
import { ESTADOS } from '../domain/estados.js';
import { PRIORIDADES } from '../domain/priorizador.js';
import { ConflictError, NotFound, TransicionInvalida, ValidationError } from '../errors.js';
import { asignar } from '../modules/asignaciones.js';
import { detalleSolicitud, listarSolicitudes, resumen } from '../modules/consultas.js';
import { ingestarCorreo } from '../modules/ingesta.js';
import { cambiarEstado, reclasificar, validar } from '../modules/solicitudes.js';
import { DOCS } from './docs.js';
import { OPENAPI, PLANIFICADOS } from './openapi.js';
import { PAGINA } from './pagina.js';
import { idAdminDemo, sembrarDemo } from './seed.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const DB = process.env.DEMO_DB ?? 'CorreosCRM_demo';
const PORT = Number(process.env.DEMO_PORT ?? 3100);
const HOSTS_PERMITIDOS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const MAX_BODY = 64 * 1024;

const migrador = { ...migratorConfigFromEnv(), database: DB };
const app = { ...dbConfigFromEnv(), database: DB };
await migrate({ config: migrador, baselinePath: path.join(root, 'ScriptBaseDatosCRM.sql'), migrationsDir: path.join(root, 'db', 'migrations') });
await asegurarUsuarioApp(migrador, DB, app.user, app.password);
const pool = await crearPool(app);
console.log((await sembrarDemo(pool)) ? 'Datos de demostración creados.' : 'La BD de demostración ya tenía datos.');
const ADMIN = await idAdminDemo(pool);

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const version = z.number().int().positive();
const Esquemas = {
  estado: z.object({ nuevoEstado: z.enum(ESTADOS), version }),
  asignar: z.object({ idResponsable: z.coerce.number().int().positive(), version }),
  reclasificar: z.object({ categoria: z.enum(CATEGORIAS).optional(), prioridad: z.enum(PRIORIDADES).optional(), version }),
  ingesta: z.object({ remitente: z.string().max(320), asunto: z.string().max(2000), cuerpo: z.string().max(20_000) }),
};

async function leerJson(req: IncomingMessage): Promise<unknown> {
  if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'Se requiere Content-Type: application/json');
  }
  let total = 0;
  const partes: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > MAX_BODY) throw new HttpError(413, 'Cuerpo demasiado grande'); // se responde y luego se corta
    partes.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
}

const CABECERAS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function responder(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { ...CABECERAS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function manejar(req: IncomingMessage, res: ServerResponse) {
  // DNS rebinding: un dominio ajeno que resuelva a 127.0.0.1 llega con otro Host.
  if (!HOSTS_PERMITIDOS.has(req.headers.host ?? '')) throw new HttpError(421, 'Host no permitido');
  // CSRF: un POST desde otra página trae su propio Origin.
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && !HOSTS_PERMITIDOS.has(origin.replace(/^https?:\/\//, ''))) {
    throw new HttpError(403, 'Origen no permitido');
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const ruta = url.pathname;
  const m = /^\/api\/solicitudes\/(\d+)(?:\/(\w+))?$/.exec(ruta);

  if (req.method === 'GET' && ruta === '/') {
    res.writeHead(200, {
      ...CABECERAS,
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    });
    return res.end(PAGINA);
  }
  if (req.method === 'GET' && ruta === '/docs') {
    res.writeHead(200, {
      ...CABECERAS,
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    });
    return res.end(DOCS);
  }
  if (req.method === 'GET' && ruta === '/api/openapi.json') return responder(res, 200, { ...OPENAPI, 'x-planificados': PLANIFICADOS });
  if (req.method === 'GET' && ruta === '/api/solicitudes') {
    // Filtros opcionales por query string; los valida el esquema de consultas.ts (422 si no son válidos).
    const p = url.searchParams;
    const num = (k: string) => (p.has(k) ? Number(p.get(k)) : undefined);
    const txt = (k: string) => p.get(k) || undefined;
    return responder(res, 200, await listarSolicitudes(pool, {
      estado: txt('estado') as never,
      categoria: txt('categoria') as never,
      prioridad: txt('prioridad') as never,
      idResponsable: num('idResponsable'),
      limite: num('limite') ?? 200,
      desplazamiento: num('desplazamiento') ?? 0,
    }));
  }
  if (req.method === 'GET' && ruta === '/api/resumen') {
    const r = await resumen(pool);
    return responder(res, 200, { ...r, responsables: r.carga.map((c) => ({ id: c.idUsuario, nombre: c.nombre })) });
  }
  if (req.method === 'GET' && m && !m[2]) return responder(res, 200, await detalleSolicitud(pool, Number(m[1])));

  if (req.method === 'POST' && m?.[2] === 'estado') {
    const b = validar(Esquemas.estado, await leerJson(req));
    return responder(res, 200, await cambiarEstado(pool, { idSolicitud: Number(m[1]), nuevoEstado: b.nuevoEstado, idUsuario: ADMIN, versionEsperada: b.version }));
  }
  if (req.method === 'POST' && m?.[2] === 'asignar') {
    const b = validar(Esquemas.asignar, await leerJson(req));
    return responder(res, 200, await asignar(pool, { idSolicitud: Number(m[1]), idResponsable: b.idResponsable, idAsignador: ADMIN, versionEsperada: b.version }));
  }
  if (req.method === 'POST' && m?.[2] === 'reclasificar') {
    const b = validar(Esquemas.reclasificar, await leerJson(req));
    return responder(res, 200, await reclasificar(pool, { idSolicitud: Number(m[1]), categoria: b.categoria, prioridad: b.prioridad, idUsuario: ADMIN, versionEsperada: b.version }));
  }
  if (req.method === 'POST' && ruta === '/api/ingesta') {
    const b = validar(Esquemas.ingesta, await leerJson(req));
    return responder(res, 200, await ingestarCorreo(pool, {
      messageId: `<manual-${Date.now()}-${Math.random().toString(36).slice(2)}@demo>`,
      remitente: b.remitente, asunto: b.asunto, cuerpo: b.cuerpo,
    }));
  }
  throw new HttpError(404, 'Ruta no encontrada');
}

createServer((req, res) => {
  manejar(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) {
      if (err.status === 413) {
        // No se sigue leyendo un cuerpo gigante: se responde y se cierra la conexión.
        res.setHeader('connection', 'close');
        res.on('finish', () => req.destroy());
      }
      return responder(res, err.status, { error: err.message });
    }
    if (err instanceof NotFound) return responder(res, 404, { error: err.message });
    if (err instanceof ConflictError) return responder(res, 409, { error: err.message });
    if (err instanceof TransicionInvalida || err instanceof ValidationError) return responder(res, 422, { error: err.message });
    // Sin volcar el error completo: puede traer parámetros con datos personales.
    const e = err as { name?: string; number?: number; code?: string };
    console.error(`Error interno: ${e?.name ?? 'Error'} ${e?.number ?? e?.code ?? ''}`.trim());
    responder(res, 500, { error: 'Error interno' });
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Visor de demostración en http://127.0.0.1:${PORT}  (BD ${DB}, usuario ${app.user})`));
