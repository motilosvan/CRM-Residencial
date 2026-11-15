import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type sql from 'mssql';
import { ConflictError, ErrorAcceso, NotFound, TransicionInvalida, ValidationError } from '../errors.js';
import { solicitarCodigo, verificarCodigo, type DepsAcceso } from '../modules/acceso.js';
import { listarConjuntos } from '../modules/conjuntos.js';
import { detalleCorreo, estadoGateway, listarCorreos } from '../modules/consultas.js';
import { cambiarConjuntoActivo, crearSesion, leerSesion, revocarSesion, type SesionActiva, type SesionPublica } from '../modules/sesiones.js';

/**
 * API HTTP. Las rutas del buzón exigen sesión (cookie `mailflow_sesion`, httpOnly) y sirven el conjunto
 * activo de la sesión; públicas: `/api/salud`, `GET /api/conjuntos`, `/api/auth/codigo` y `/api/auth/verificar`.
 * Escucha solo en 127.0.0.1 y el panel la consume por el proxy de Vite (mismo origen, sin CORS). Los POST
 * rechazan un `Origin` ajeno. Ninguna ruta de escritura de solicitudes (T2–T4) existe aún: llegan en S4.
 */

declare module 'fastify' {
  interface FastifyRequest {
    /** Sesión validada por `exigirSesion`; solo existe en las rutas protegidas. */
    sesion: SesionActiva;
  }
}

export interface OpcionesApp {
  pool: sql.ConnectionPool;
  /** Valores aceptados en la cabecera Host (defensa contra DNS rebinding). */
  hostsPermitidos: ReadonlySet<string>;
  /** Acceso por código: dependencias de T5/T6 más la política de cookie y de Origin. */
  acceso: DepsAcceso & {
    /** Añade `Secure` a la cookie (HTTPS). */
    cookieSegura: boolean;
    /** Orígenes aceptados en los POST (p. ej. `http://localhost:5173`). */
    origenesPermitidos: ReadonlySet<string>;
  };
  /** Para errores 500: recibe solo tipo y código, nunca el mensaje (puede traer datos personales). */
  registrarError?: (descripcion: string) => void;
}

const COOKIE = 'mailflow_sesion';

/** Mensaje en español de cada código (`error`); el panel se guía por `codigo`. */
const MENSAJES_ACCESO: Record<ErrorAcceso['codigo'], string> = {
  CODIGO_INCORRECTO: 'Código incorrecto',
  CODIGO_VENCIDO: 'El código venció',
  BLOQUEADO: 'Demasiados intentos; acceso bloqueado temporalmente',
  REENVIO_PRONTO: 'Espera antes de pedir otro código',
  NO_AUTENTICADO: 'Sesión no iniciada',
  SESION_INACTIVA: 'La sesión venció por inactividad',
  SIN_MEMBRESIA: 'No perteneces a ese conjunto',
};

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

export function construirApp({ pool, hostsPermitidos, acceso, registrarError = console.error }: OpcionesApp): FastifyInstance {
  const { cookieSegura, origenesPermitidos, ...deps } = acceso;
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  void app.register(fastifyCookie);

  const opcionesCookie = { httpOnly: true, sameSite: 'lax', path: '/api', secure: cookieSegura } as const;
  const sesionPublica = ({ usuario, conjuntoActivo, conjuntos, ultimaActividad }: SesionActiva): SesionPublica => ({
    usuario,
    conjuntoActivo,
    conjuntos,
    ultimaActividad,
  });
  const exigirSesion = async (req: FastifyRequest) => {
    req.sesion = await leerSesion(pool, req.cookies[COOKIE]);
  };
  const protegida = { preHandler: exigirSesion };

  app.addHook('onRequest', async (req, reply) => {
    reply.headers(CABECERAS);
    // DNS rebinding: un dominio ajeno que resuelva a 127.0.0.1 llega con otro Host.
    if (!hostsPermitidos.has(req.headers.host ?? '')) return reply.code(421).send({ error: 'Host no permitido' });
    // CSRF: SameSite=Lax no cubre todo. Un POST con Origin ajeno se rechaza (sin Origin, p. ej. curl, pasa).
    const origen = req.headers.origin;
    if (req.method !== 'GET' && origen !== undefined && !origenesPermitidos.has(origen)) {
      return reply.code(403).send({ error: 'Origen no permitido' });
    }
  });

  app.get('/api/salud', async () => ({ ok: true }));

  app.get('/api/conjuntos', async () => listarConjuntos(pool));

  app.post('/api/auth/codigo', async (req) => solicitarCodigo(pool, deps, (req.body ?? {}) as never));

  app.post('/api/auth/verificar', async (req, reply: FastifyReply) => {
    const { idUsuario, idConjunto } = await verificarCodigo(pool, deps, (req.body ?? {}) as never);
    const { token, sesion } = await crearSesion(pool, { idUsuario, idConjunto });
    return reply.setCookie(COOKIE, token, opcionesCookie).send(sesion);
  });

  app.get('/api/auth/sesion', protegida, async (req) => sesionPublica(req.sesion));

  app.post('/api/auth/conjunto', protegida, async (req) => {
    const { conjuntoId } = (req.body ?? {}) as { conjuntoId?: string };
    return cambiarConjuntoActivo(pool, req.cookies[COOKIE], conjuntoId as string);
  });

  app.post('/api/auth/salir', async (req, reply) => {
    await revocarSesion(pool, req.cookies[COOKIE]);
    return reply.clearCookie(COOKIE, opcionesCookie).send({ ok: true });
  });

  /** Buzón unificado: todos los correos recibidos, más recientes primero. ?q=&limite=&desplazamiento= */
  app.get('/api/correos', protegida, async (req) => {
    const q = req.query as Record<string, unknown>;
    return listarCorreos(pool, req.sesion.idConjuntoActivo, {
      q: q.q === '' ? undefined : (q.q as string | undefined),
      limite: numero(q.limite),
      desplazamiento: numero(q.desplazamiento),
    });
  });

  app.get('/api/correos/:id', protegida, async (req) => detalleCorreo(pool, req.sesion.idConjuntoActivo, Number((req.params as { id: string }).id)));

  app.get('/api/gateway/estado', protegida, async (req) => estadoGateway(pool, req.sesion.idConjuntoActivo));

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Ruta no encontrada' }));

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ErrorAcceso) {
      return reply.code(err.estado).send({ error: MENSAJES_ACCESO[err.codigo], codigo: err.codigo, ...err.detalle });
    }
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
