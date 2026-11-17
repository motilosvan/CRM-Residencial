import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type sql from 'mssql';
import { z } from 'zod';
import { clasificar } from '../domain/clasificador.js';
import { enmascarar } from '../domain/enmascarar.js';
import { palabrasDetectadas, priorizar } from '../domain/priorizador.js';
import { ConflictError, ErrorAcceso, Forbidden, NotFound, TransicionInvalida, ValidationError } from '../errors.js';
import { solicitarCodigo, verificarCodigo, type DepsAcceso } from '../modules/acceso.js';
import { asignar } from '../modules/asignaciones.js';
import { desconectarBuzon, guardarBuzon, sincronizarConjunto, type DepsBuzon } from '../modules/buzones.js';
import { actualizarIdentidadConjunto, listarConjuntos, obtenerIdentidadConjunto } from '../modules/conjuntos.js';
import {
  colaValidacion,
  detalleCorreo,
  detalleSolicitud,
  estadoGateway,
  generarReporte,
  listarAuditoriaConjunto,
  listarCorreos,
  listarSolicitudes,
  listarUsuariosConjunto,
  obtenerCatalogos,
  reporteACsv,
  resumen,
} from '../modules/consultas.js';
import {
  actualizarResidenteConjunto,
  crearResidenteConjunto,
  listarResidentesConjunto,
  vincularCorreoResidente,
} from '../modules/residentes.js';
import { cambiarConjuntoActivo, crearSesion, leerSesion, revocarSesion, type SesionActiva, type SesionPublica } from '../modules/sesiones.js';
import { cambiarEstado, reclasificar, validar, type Actor } from '../modules/solicitudes.js';
import { aceptarSugerencia } from '../modules/sugerencias.js';
import { actualizarMembresiaUsuario, guardarUsuarioConjunto } from '../modules/usuarios.js';

/**
 * API HTTP. Las rutas protegidas exigen sesión (cookie `mailflow_sesion`, httpOnly) y operan sobre
 * el conjunto activo de la sesión; públicas: `/api/salud`, `GET /api/conjuntos`, `/api/auth/codigo` y
 * `/api/auth/verificar`. Escucha solo en 127.0.0.1 y el panel la consume por el proxy de Vite (sin CORS).
 * Los POST, PUT y PATCH rechazan un `Origin` ajeno.
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
  /**
   * Conexión IMAP del buzón por conjunto, inyectada por la raíz de composición (`server.ts`). Sin ella
   * no se registran las rutas `/api/buzon*`.
   */
  buzon?: DepsBuzon;
  /** Límite de peticiones por IP para las rutas de acceso OTP (opcional; recomendado en producción). */
  limitePeticiones?: { max: number; ventanaMs: number; ahora?: () => number };
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

const texto = (v: unknown): string | undefined => (v === '' ? undefined : (v as string | undefined));

function booleanoOpcional(v: unknown): boolean | undefined {
  if (v === undefined || v === '') return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v as boolean;
}

function conVersion(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body ?? {};
  const b = body as Record<string, unknown>;
  const v = versionDe(b);
  return v === undefined ? b : { ...b, versionEsperada: v };
}

const actorDe = (s: SesionActiva): Actor => ({
  idUsuario: s.idUsuario,
  rol: s.usuario.rol,
  idConjunto: s.idConjuntoActivo,
});

const versionDe = (b: Record<string, unknown>): unknown => b.versionEsperada ?? b.version;

const LaboratorioSchema = z
  .object({
    asunto: z.string().max(500).default(''),
    cuerpo: z.string().max(20000).default(''),
  })
  .refine((d) => d.asunto.trim().length > 0 || d.cuerpo.trim().length > 0, {
    message: 'Indique al menos un asunto o un cuerpo para probar',
  });

/** Limitador simple en memoria por IP (ventana fija) para rutas de acceso OTP. */
function crearLimitadorIp(cfg?: OpcionesApp['limitePeticiones']) {
  if (!cfg) return undefined;
  const ahora = cfg.ahora ?? Date.now;
  const contadores = new Map<string, { n: number; vence: number }>();
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const t = ahora();
    const ip = req.ip || '127.0.0.1';
    const actual = contadores.get(ip);
    if (!actual || actual.vence <= t) {
      contadores.set(ip, { n: 1, vence: t + cfg.ventanaMs });
      return;
    }
    if (actual.n >= cfg.max) {
      return reply.code(429).send({ error: 'Demasiadas peticiones; intenta más tarde', codigo: 'LIMITE_IP' });
    }
    actual.n += 1;
  };
}

export function construirApp({ pool, hostsPermitidos, acceso, buzon, limitePeticiones, registrarError = console.error }: OpcionesApp): FastifyInstance {
  const { cookieSegura, origenesPermitidos, ...deps } = acceso;
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  void app.register(fastifyCookie);
  const limitarIp = crearLimitadorIp(limitePeticiones);

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
  const exigirAdmin = async (req: FastifyRequest) => {
    await exigirSesion(req);
    if (req.sesion.usuario.rol !== 'ADMIN') throw new Forbidden('Solo un administrador puede acceder a este recurso');
  };
  const protegida = { preHandler: exigirSesion };
  const soloAdmin = { preHandler: exigirAdmin };

  app.addHook('onRequest', async (req, reply) => {
    reply.headers(CABECERAS);
    // DNS rebinding: un dominio ajeno que resuelva a 127.0.0.1 llega con otro Host.
    if (!hostsPermitidos.has(req.headers.host ?? '')) return reply.code(421).send({ error: 'Host no permitido' });
    // CSRF: SameSite=Lax no cubre todo. Una escritura (todo salvo GET) con Origin ajeno se rechaza (sin Origin, p. ej. curl, pasa).
    const origen = req.headers.origin;
    if (req.method !== 'GET' && origen !== undefined && !origenesPermitidos.has(origen)) {
      return reply.code(403).send({ error: 'Origen no permitido' });
    }
  });

  app.get('/api/salud', async () => ({ ok: true }));

  app.get('/api/conjuntos', async () => listarConjuntos(pool));

  const conLimiteIp = limitarIp ? { preHandler: limitarIp } : {};

  app.post('/api/auth/codigo', conLimiteIp, async (req) => solicitarCodigo(pool, deps, (req.body ?? {}) as never));

  app.post('/api/auth/verificar', conLimiteIp, async (req, reply: FastifyReply) => {
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

  app.post('/api/correos/:id/vincular-residente', soloAdmin, async (req) =>
    vincularCorreoResidente(
      pool,
      actorDe(req.sesion),
      Number((req.params as { id: string }).id),
      (req.body ?? {}) as never,
    ),
  );

  app.get('/api/gateway/estado', protegida, async (req) => estadoGateway(pool, req.sesion.idConjuntoActivo));

  if (buzon) {
    /** Conecta o reconecta el buzón del conjunto activo (ADMIN). Prueba IMAP antes de guardar. */
    app.put('/api/buzon', protegida, async (req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return guardarBuzon(pool, buzon, actorDe(req.sesion), { ...b, versionEsperada: versionDe(b) } as never);
    });

    app.post('/api/buzon/desconectar', protegida, async (req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return desconectarBuzon(pool, actorDe(req.sesion), { versionEsperada: versionDe(b) as number | undefined });
    });

    app.post('/api/buzon/sincronizar', protegida, async (req) => sincronizarConjunto(pool, buzon, actorDe(req.sesion)));
  }

  app.get('/api/solicitudes', protegida, async (req) => {
    const q = req.query as Record<string, unknown>;
    return listarSolicitudes(
      pool,
      req.sesion.idConjuntoActivo,
      {
        estado: texto(q.estado) as never,
        categoria: texto(q.categoria) as never,
        prioridad: texto(q.prioridad) as never,
        idResponsable: numero(q.idResponsable),
        limite: numero(q.limite),
        desplazamiento: numero(q.desplazamiento),
      },
      actorDe(req.sesion),
    );
  });

  app.get('/api/solicitudes/:id', protegida, async (req) =>
    detalleSolicitud(pool, req.sesion.idConjuntoActivo, Number((req.params as { id: string }).id), actorDe(req.sesion)),
  );

  app.post('/api/solicitudes/:id/asignar', protegida, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    return asignar(
      pool,
      {
        idSolicitud: Number((req.params as { id: string }).id),
        idResponsable: b.idResponsable as number,
        idAsignador: req.sesion.idUsuario,
        versionEsperada: versionDe(b) as number,
      },
      undefined,
      actorDe(req.sesion),
    );
  });

  app.post('/api/solicitudes/:id/estado', protegida, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    return cambiarEstado(
      pool,
      {
        idSolicitud: Number((req.params as { id: string }).id),
        nuevoEstado: b.nuevoEstado as never,
        idUsuario: req.sesion.idUsuario,
        versionEsperada: versionDe(b) as number,
        comentario: b.comentario as string | undefined,
      },
      undefined,
      actorDe(req.sesion),
    );
  });

  app.post('/api/solicitudes/:id/reclasificar', protegida, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    return reclasificar(
      pool,
      {
        idSolicitud: Number((req.params as { id: string }).id),
        categoria: b.categoria as never,
        prioridad: b.prioridad as never,
        idUsuario: req.sesion.idUsuario,
        versionEsperada: versionDe(b) as number,
        comentario: b.comentario as string | undefined,
      },
      undefined,
      actorDe(req.sesion),
    );
  });

  app.post('/api/solicitudes/:id/aceptar-sugerencia', protegida, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    return aceptarSugerencia(
      pool,
      {
        idSolicitud: Number((req.params as { id: string }).id),
        idUsuario: req.sesion.idUsuario,
        versionEsperada: versionDe(b) as number,
        comentario: b.comentario as string | undefined,
      },
      actorDe(req.sesion),
    );
  });

  app.get('/api/usuarios', protegida, async (req) => {
    if (req.sesion.usuario.rol !== 'ADMIN') throw new Forbidden('Solo un administrador puede listar el personal');
    const q = req.query as Record<string, unknown>;
    return listarUsuariosConjunto(pool, req.sesion.idConjuntoActivo, { rol: texto(q.rol) as never,
      incluirInactivos: q.incluirInactivos === 'true',
    });
  });

  app.post('/api/usuarios', protegida, async (req, reply) => {
    const usuario = await guardarUsuarioConjunto(pool, actorDe(req.sesion), (req.body ?? {}) as never);
    return reply.code(201).send(usuario);
  });

  app.patch('/api/usuarios/:id', protegida, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    return actualizarMembresiaUsuario(
      pool,
      actorDe(req.sesion),
      Number((req.params as { id: string }).id),
      { rol: b.rol as never, activo: b.activo as never, versionEsperada: versionDe(b) as number },
    );
  });

  app.get('/api/residentes', soloAdmin, async (req) => {
    const q = req.query as Record<string, unknown>;
    return listarResidentesConjunto(pool, actorDe(req.sesion), {
      q: texto(q.q),
      soloActivos: booleanoOpcional(q.soloActivos),
    });
  });

  app.post('/api/residentes', soloAdmin, async (req, reply) => {
    const residente = await crearResidenteConjunto(pool, actorDe(req.sesion), (req.body ?? {}) as never);
    return reply.code(201).send(residente);
  });

  app.patch('/api/residentes/:id', soloAdmin, async (req) =>
    actualizarResidenteConjunto(
      pool,
      actorDe(req.sesion),
      Number((req.params as { id: string }).id),
      conVersion(req.body) as never,
    ),
  );

  app.get('/api/validacion', soloAdmin, async (req) => colaValidacion(pool, req.sesion.idConjuntoActivo));

  app.get('/api/conjunto/identidad', soloAdmin, async (req) => obtenerIdentidadConjunto(pool, actorDe(req.sesion)));

  app.patch('/api/conjunto/identidad', soloAdmin, async (req) =>
    actualizarIdentidadConjunto(pool, actorDe(req.sesion), conVersion(req.body) as never),
  );

  app.get('/api/catalogos', soloAdmin, async () => obtenerCatalogos(pool));

  app.get('/api/auditoria', soloAdmin, async (req) => {
    const q = req.query as Record<string, unknown>;
    return listarAuditoriaConjunto(pool, req.sesion.idConjuntoActivo, {
      q: texto(q.q),
      limite: numero(q.limite),
      desplazamiento: numero(q.desplazamiento),
    });
  });

  app.post('/api/laboratorio/probar', protegida, async (req) => {
    const { asunto, cuerpo } = validar(LaboratorioSchema, req.body ?? {});
    const asuntoEnmascarado = enmascarar(asunto);
    const cuerpoEnmascarado = enmascarar(cuerpo);
    const categoria = clasificar(asunto, cuerpo);
    const prioridad = priorizar(categoria, asunto, cuerpo);
    return {
      asuntoEnmascarado,
      cuerpoEnmascarado,
      categoria,
      prioridad,
      palabrasDetectadas: palabrasDetectadas(asunto, cuerpo),
    };
  });

  app.get('/api/resumen', protegida, async (req) => resumen(pool, req.sesion.idConjuntoActivo));

  app.get('/api/reportes', protegida, async (req, reply) => {
    if (req.sesion.usuario.rol !== 'ADMIN') throw new Forbidden('Solo un administrador puede consultar reportes');
    const q = req.query as Record<string, unknown>;
    const reporte = await generarReporte(pool, req.sesion.idConjuntoActivo, {
      desde: texto(q.desde) as never,
      hasta: texto(q.hasta) as never,
    });
    if (q.formato === 'csv') {
      return reply
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', 'attachment; filename="reporte-solicitudes.csv"')
        .send(reporteACsv(reporte));
    }
    return reporte;
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Ruta no encontrada' }));

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ErrorAcceso) {
      return reply.code(err.estado).send({ error: MENSAJES_ACCESO[err.codigo], codigo: err.codigo, ...err.detalle });
    }
    if (err instanceof Forbidden) return reply.code(403).send({ error: err.message });
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
