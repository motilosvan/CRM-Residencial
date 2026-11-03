import Fastify, { type FastifyInstance } from 'fastify';
import type sql from 'mssql';
import { ConflictError, NotFound, TransicionInvalida, ValidationError } from '../errors.js';
import { detalleCorreo, estadoGateway, listarCorreos } from '../modules/consultas.js';

/**
 * API HTTP (inicio de S4). Por ahora SOLO LECTURA y sin login: escucha únicamente en 127.0.0.1 y el
 * panel la consume a través del proxy de Vite (mismo origen, sin CORS). El login con sesión (S4-01)
 * y las rutas de escritura (T2–T4) llegan en S4; ninguna ruta de escritura debe agregarse sin él.
 */

export interface OpcionesApp {
  pool: sql.ConnectionPool;
  /** Valores aceptados en la cabecera Host (defensa contra DNS rebinding). */
  hostsPermitidos: ReadonlySet<string>;
  /** Para errores 500: recibe solo tipo y código, nunca el mensaje (puede traer datos personales). */
  registrarError?: (descripcion: string) => void;
}

const CABECERAS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

/** `?limite=` vacío o ausente ⇒ undefined (aplica el valor por defecto del esquema); otro texto ⇒ número o NaN (422). */
function numero(v: unknown): number | undefined {
  return v === undefined || v === '' ? undefined : Number(v);
}

export function construirApp({ pool, hostsPermitidos, registrarError = console.error }: OpcionesApp): FastifyInstance {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });

  app.addHook('onRequest', async (req, reply) => {
    reply.headers(CABECERAS);
    // DNS rebinding: un dominio ajeno que resuelva a 127.0.0.1 llega con otro Host.
    if (!hostsPermitidos.has(req.headers.host ?? '')) return reply.code(421).send({ error: 'Host no permitido' });
  });

  app.get('/api/salud', async () => ({ ok: true }));

  /** Buzón unificado: todos los correos recibidos, más recientes primero. ?q=&limite=&desplazamiento= */
  app.get('/api/correos', async (req) => {
    const q = req.query as Record<string, unknown>;
    return listarCorreos(pool, {
      q: q.q === '' ? undefined : (q.q as string | undefined),
      limite: numero(q.limite),
      desplazamiento: numero(q.desplazamiento),
    });
  });

  app.get('/api/correos/:id', async (req) => detalleCorreo(pool, Number((req.params as { id: string }).id)));

  app.get('/api/gateway/estado', async () => estadoGateway(pool));

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Ruta no encontrada' }));

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof NotFound) return reply.code(404).send({ error: err.message });
    if (err instanceof ConflictError) return reply.code(409).send({ error: err.message });
    if (err instanceof TransicionInvalida || err instanceof ValidationError) return reply.code(422).send({ error: err.message });
    const e = err as { statusCode?: number; message?: string; name?: string; code?: string; number?: number };
    // Errores propios de Fastify (JSON mal formado, cuerpo demasiado grande...): ya traen su 4xx.
    if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: e.message ?? 'Solicitud inválida' });
    }
    registrarError(`Error interno: ${e?.name ?? 'Error'} ${e?.number ?? e?.code ?? ''}`.trim());
    return reply.code(500).send({ error: 'Error interno' });
  });

  return app;
}
