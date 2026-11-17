import sql from 'mssql';
import { z } from 'zod';
import { CATEGORIAS, PALABRAS_CLAVE_POR_CATEGORIA, type Categoria } from '../domain/clasificador.js';
import { enmascarar } from '../domain/enmascarar.js';
import { destinosDesde, ESTADOS, type Estado } from '../domain/estados.js';
import {
  PALABRAS_CLAVE_URGENCIA,
  PRIORIDAD_BASE_POR_CATEGORIA,
  PRIORIDADES,
  type Prioridad,
} from '../domain/priorizador.js';
import { withTx } from '../db/withTx.js';
import { Forbidden, NotFound } from '../errors.js';
import { validar, type Actor, type Rol } from './solicitudes.js';

/**
 * Capa de consultas (modelo de lectura). Todo se lee en una transacción SNAPSHOT: cada respuesta es
 * una foto consistente (p. ej. la versión, el historial y las asignaciones de un detalle son del mismo
 * instante) y no bloquea a quienes escriben. La usarán la API (S4) y el panel (S5); hoy la usa el visor.
 */

const BANDEJA = `
  SELECT s.idSolicitud AS id, 'SOL-' + RIGHT('000000' + CAST(s.idSolicitud AS VARCHAR(10)), 6) AS codigo,
         c.asunto, c.remitente, e.nombre AS estado, cat.nombre AS categoria, p.nombre AS prioridad, p.slaHoras,
         s.version, s.fechaCreacion, s.primeraRespuesta, s.fechaCierre, u.nombre AS responsable, a.idUsuario AS idResponsable
    FROM SOLICITUDES s
    JOIN CORREOS c ON c.idCorreo = s.idCorreo
    JOIN ESTADOS e ON e.idEstado = s.idEstado
    JOIN CATEGORIAS cat ON cat.idCategoria = s.idCategoria
    JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad
    LEFT JOIN ASIGNACIONES a ON a.idSolicitud = s.idSolicitud AND a.liberadaEn IS NULL
    LEFT JOIN USUARIOS u ON u.idUsuario = a.idUsuario`;

export interface FilaBandeja {
  id: number;
  codigo: string;
  asunto: string | null;
  remitente: string;
  estado: Estado;
  categoria: string;
  prioridad: string;
  slaHoras: number;
  version: number;
  fechaCreacion: Date;
  primeraRespuesta: Date | null;
  fechaCierre: Date | null;
  responsable: string | null;
  idResponsable: number | null;
}

export const FiltroBandejaSchema = z.object({
  estado: z.enum(ESTADOS).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  idResponsable: z.number().int().positive().optional(),
  limite: z.number().int().min(1).max(200).default(100),
  desplazamiento: z.number().int().min(0).default(0),
});
export type FiltroBandeja = z.input<typeof FiltroBandejaSchema>;

/** Bandeja ordenada por urgencia (peso de prioridad) y antigüedad, con filtros y paginación por conjunto. */
export async function listarSolicitudes(
  pool: sql.ConnectionPool,
  idConjunto: number,
  filtro: FiltroBandeja = {},
  actor?: Actor,
): Promise<FilaBandeja[]> {
  const conj = validar(IdConjuntoSchema, idConjunto);
  const f = validar(FiltroBandejaSchema, filtro);
  const soloAsignadasA = actor?.rol === 'SOPORTE' ? actor.idUsuario : null;
  return withTx(
    pool,
    async (tx) => {
      const r = await tx
        .request()
        .input('idConjunto', sql.Int, conj)
        .input('estado', sql.VarChar(30), f.estado ?? null)
        .input('categoria', sql.VarChar(50), f.categoria ?? null)
        .input('prioridad', sql.VarChar(20), f.prioridad ?? null)
        .input('resp', sql.Int, f.idResponsable ?? null)
        .input('soloActor', sql.Int, soloAsignadasA)
        .input('lim', sql.Int, f.limite)
        .input('desp', sql.Int, f.desplazamiento)
        .query<FilaBandeja>(
          `${BANDEJA}
            WHERE c.idConjunto = @idConjunto
              AND (@estado IS NULL OR e.nombre = @estado)
              AND (@categoria IS NULL OR cat.nombre = @categoria)
              AND (@prioridad IS NULL OR p.nombre = @prioridad)
              AND (@resp IS NULL OR a.idUsuario = @resp)
              AND (@soloActor IS NULL OR a.idUsuario = @soloActor)
            ORDER BY p.peso DESC, s.fechaCreacion DESC, s.idSolicitud DESC
            OFFSET @desp ROWS FETCH NEXT @lim ROWS ONLY`,
        );
      return r.recordset;
    },
    { isolation: 'SNAPSHOT' },
  );
}

/** Detalle completo y consistente de una solicitud del conjunto, con destinos válidos y sugerencia de IA. */
export async function detalleSolicitud(
  pool: sql.ConnectionPool,
  idConjunto: number,
  idSolicitud: number,
  actor?: Actor,
) {
  const conj = validar(IdConjuntoSchema, idConjunto);
  const idValido = validar(z.number().int().positive(), idSolicitud);
  return withTx(
    pool,
    async (tx) => {
      const req = () => tx.request().input('id', sql.Int, idValido).input('idConjunto', sql.Int, conj);
      const sol = (
        await req().query<FilaBandeja>(`${BANDEJA} WHERE s.idSolicitud = @id AND c.idConjunto = @idConjunto`)
      ).recordset[0];
      if (!sol) throw new NotFound(`La solicitud ${idValido} no existe`);
      if (actor?.rol === 'SOPORTE' && sol.idResponsable !== actor.idUsuario) {
        throw new Forbidden('Solo puedes consultar tus solicitudes asignadas');
      }
      const correo = (
        await req().query<{ cuerpo: string | null; messageId: string }>(
          'SELECT c.cuerpo, c.messageId FROM CORREOS c JOIN SOLICITUDES s ON s.idCorreo = c.idCorreo WHERE s.idSolicitud = @id',
        )
      ).recordset[0];
      const historial = (
        await req().query(
          `SELECT ea.nombre AS anterior, en.nombre AS nuevo, u.nombre AS usuario, h.comentario, h.fecha
             FROM HISTORIAL_ESTADOS h
             LEFT JOIN ESTADOS ea ON ea.idEstado = h.idEstadoAnterior
             JOIN ESTADOS en ON en.idEstado = h.idEstadoNuevo
             LEFT JOIN USUARIOS u ON u.idUsuario = h.idUsuario
            WHERE h.idSolicitud = @id ORDER BY h.idHistorial`,
        )
      ).recordset;
      const asignaciones = (
        await req().query(
          `SELECT u.nombre, a.fechaAsignacion, a.liberadaEn
             FROM ASIGNACIONES a JOIN USUARIOS u ON u.idUsuario = a.idUsuario
            WHERE a.idSolicitud = @id ORDER BY a.idAsignacion`,
        )
      ).recordset;
      const sugerencia = (
        await tx
          .request()
          .input('idSolicitud', sql.Int, idValido)
          .query<SugerenciaGuardada>(
            `SELECT g.estado, cat.nombre AS categoria, p.nombre AS prioridad, g.resumen, g.justificacion,
                    g.proveedor, g.modelo, g.fechaActualizacion
               FROM SUGERENCIAS_IA g
               LEFT JOIN CATEGORIAS cat ON cat.idCategoria = g.idCategoria
               LEFT JOIN PRIORIDADES p ON p.idPrioridad = g.idPrioridad
              WHERE g.idSolicitud = @idSolicitud`,
          )
      ).recordset[0];
      // ASIGNADA no se ofrece como destino: se alcanza asignando un responsable (T2).
      const destinos = destinosDesde(sol.estado).filter((e) => e !== 'ASIGNADA');
      return {
        ...sol,
        cuerpo: correo?.cuerpo ?? '',
        messageId: correo?.messageId ?? '',
        historial,
        asignaciones,
        destinos,
        sugerencia: sugerencia ?? null,
      };
    },
    { isolation: 'SNAPSHOT' },
  );
}

/* ---------------------------------------------------------------------------------------------
 * Buzón: los correos tal como llegaron (de cualquier fuente: gateway IMAP, ingesta manual), con el
 * residente vinculado y la solicitud que generaron. Es la vista "bandeja de entrada" del panel.
 * ------------------------------------------------------------------------------------------- */

const BUZON = `
  SELECT c.idCorreo AS id, c.remitente, c.asunto, c.fechaRecepcion,
         c.idResidente, r.nombre AS residente, r.unidad,
         s.idSolicitud, 'SOL-' + RIGHT('000000' + CAST(s.idSolicitud AS VARCHAR(10)), 6) AS codigo,
         e.nombre AS estado, cat.nombre AS categoria, p.nombre AS prioridad,
         sug.estado AS sugerenciaEstado, catSug.nombre AS sugerenciaCategoria`;

const BUZON_FROM = `
    FROM CORREOS c
    LEFT JOIN RESIDENTES r ON r.idResidente = c.idResidente
    LEFT JOIN SOLICITUDES s ON s.idCorreo = c.idCorreo
    LEFT JOIN ESTADOS e ON e.idEstado = s.idEstado
    LEFT JOIN CATEGORIAS cat ON cat.idCategoria = s.idCategoria
    LEFT JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad
    LEFT JOIN SUGERENCIAS_IA sug ON sug.idSolicitud = s.idSolicitud
    LEFT JOIN CATEGORIAS catSug ON catSug.idCategoria = sug.idCategoria`;

/** El buzón siempre se lee dentro de un conjunto: `@idConjunto` va en toda consulta (conteo incluido). */
const BUZON_FILTRO = `
   WHERE c.idConjunto = @idConjunto
     AND (@patron IS NULL OR c.asunto LIKE @patron ESCAPE '\\' OR c.remitente LIKE @patron ESCAPE '\\'
          OR r.nombre LIKE @patron ESCAPE '\\')`;

export interface FilaCorreo {
  id: number;
  remitente: string;
  asunto: string | null;
  fechaRecepcion: Date;
  idResidente: number | null;
  residente: string | null;
  unidad: string | null;
  idSolicitud: number | null;
  codigo: string | null;
  estado: Estado | null;
  categoria: string | null;
  prioridad: string | null;
  sugerenciaEstado: EstadoSugerencia | null;
  sugerenciaCategoria: string | null;
}

export type EstadoSugerencia = 'EN_REINTENTO' | 'LISTA' | 'FALLIDA';

/** Lo que un modelo de IA propuso para una solicitud. Nunca modifica la solicitud por sí solo. */
export interface SugerenciaGuardada {
  estado: EstadoSugerencia;
  categoria: string | null;
  prioridad: string | null;
  resumen: string | null;
  justificacion: string | null;
  proveedor: string;
  modelo: string;
  fechaActualizacion: Date;
}

export const FiltroCorreosSchema = z.object({
  /** Texto libre: busca en asunto, remitente y nombre del residente. */
  q: z.string().trim().max(200).optional(),
  limite: z.number().int().min(1).max(200).default(50),
  desplazamiento: z.number().int().min(0).default(0),
});
export type FiltroCorreos = z.input<typeof FiltroCorreosSchema>;

/** `%`, `_` y `[` son comodines de LIKE: se escapan para que el texto se busque literal. */
export function patronLike(q: string | undefined): string | null {
  return q ? `%${q.replace(/[\\%_[]/g, (m) => `\\${m}`)}%` : null;
}

const IdConjuntoSchema = z.number().int().positive();

/** Bandeja de entrada del conjunto: correos más recientes primero, con búsqueda y paginación. */
export async function listarCorreos(
  pool: sql.ConnectionPool,
  idConjunto: number,
  filtro: FiltroCorreos = {},
): Promise<{ total: number; correos: (FilaCorreo & { extracto: string })[] }> {
  const conj = validar(IdConjuntoSchema, idConjunto);
  const f = validar(FiltroCorreosSchema, filtro);
  const patron = patronLike(f.q);
  return withTx(
    pool,
    async (tx) => {
      const total = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .input('patron', sql.NVarChar(450), patron)
          .query<{ total: number }>(`SELECT COUNT(*) AS total ${BUZON_FROM} ${BUZON_FILTRO}`)
      ).recordset[0]!.total;
      const correos = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .input('patron', sql.NVarChar(450), patron)
          .input('lim', sql.Int, f.limite)
          .input('desp', sql.Int, f.desplazamiento)
          .query<FilaCorreo & { extracto: string }>(
            `${BUZON}, LEFT(COALESCE(c.cuerpo, N''), 200) AS extracto ${BUZON_FROM} ${BUZON_FILTRO}
              ORDER BY c.fechaRecepcion DESC, c.idCorreo DESC
              OFFSET @desp ROWS FETCH NEXT @lim ROWS ONLY`,
          )
      ).recordset;
      return { total, correos };
    },
    { isolation: 'SNAPSHOT' },
  );
}

/**
 * Un correo completo: el cuerpo, su versión enmascarada (exactamente lo que vería un tercero) y la
 * sugerencia de IA, si existe, todo de la misma foto consistente. Un correo de otro conjunto es NotFound
 * (no se revela que existe); la sugerencia sale de la solicitud de esa misma fila, así que no puede cruzar.
 */
export async function detalleCorreo(
  pool: sql.ConnectionPool,
  idConjunto: number,
  idCorreo: number,
): Promise<FilaCorreo & { cuerpo: string; cuerpoEnmascarado: string; sugerencia: SugerenciaGuardada | null }> {
  const conj = validar(IdConjuntoSchema, idConjunto);
  const id = validar(z.number().int().positive(), idCorreo);
  return withTx(
    pool,
    async (tx) => {
      const fila = (
        await tx
          .request()
          .input('id', sql.Int, id)
          .input('idConjunto', sql.Int, conj)
          .query<FilaCorreo & { cuerpo: string }>(
            `${BUZON}, COALESCE(c.cuerpo, N'') AS cuerpo ${BUZON_FROM}
              WHERE c.idCorreo = @id AND c.idConjunto = @idConjunto`,
          )
      ).recordset[0];
      if (!fila) throw new NotFound(`El correo ${id} no existe`);
      const sugerencia = (
        await tx
          .request()
          .input('idSolicitud', sql.Int, fila.idSolicitud)
          .query<SugerenciaGuardada>(
            `SELECT g.estado, cat.nombre AS categoria, p.nombre AS prioridad, g.resumen, g.justificacion,
                    g.proveedor, g.modelo, g.fechaActualizacion
               FROM SUGERENCIAS_IA g
               LEFT JOIN CATEGORIAS cat ON cat.idCategoria = g.idCategoria
               LEFT JOIN PRIORIDADES p ON p.idPrioridad = g.idPrioridad
              WHERE g.idSolicitud = @idSolicitud`,
          )
      ).recordset[0];
      return {
        ...fila,
        cuerpoEnmascarado: enmascarar(fila.cuerpo, { nombres: [fila.residente] }),
        sugerencia: sugerencia ?? null,
      };
    },
    { isolation: 'SNAPSHOT' },
  );
}

export interface SolicitudParaSugerir {
  idSolicitud: number;
  asunto: string;
  cuerpo: string;
  residente: string | null;
}

/**
 * Solicitudes que el worker de IA debe procesar, las más antiguas primero: NUEVAS sin sugerencia o con
 * un reintento vencido. Devuelve el texto original: enmascararlo antes de enviarlo es deber del worker.
 */
export async function solicitudesParaSugerir(pool: sql.ConnectionPool, limite: number): Promise<SolicitudParaSugerir[]> {
  const lim = validar(z.number().int().min(1).max(100), limite);
  return withTx(
    pool,
    async (tx) => {
      const r = await tx
        .request()
        .input('lim', sql.Int, lim)
        .query<SolicitudParaSugerir>(
          `SELECT TOP (@lim) s.idSolicitud, COALESCE(c.asunto, N'') AS asunto, COALESCE(c.cuerpo, N'') AS cuerpo,
                  r.nombre AS residente
             FROM SOLICITUDES s
             JOIN CORREOS c ON c.idCorreo = s.idCorreo
             JOIN ESTADOS e ON e.idEstado = s.idEstado
             LEFT JOIN RESIDENTES r ON r.idResidente = c.idResidente
             LEFT JOIN SUGERENCIAS_IA g ON g.idSolicitud = s.idSolicitud
            WHERE e.nombre = 'NUEVA'
              AND (g.idSugerencia IS NULL
                   OR (g.estado = 'EN_REINTENTO' AND g.proximoIntento <= SYSUTCDATETIME()))
            ORDER BY s.fechaCreacion, s.idSolicitud`,
        );
      return r.recordset;
    },
    { isolation: 'SNAPSHOT' },
  );
}

/** Checkpoint IMAP de una cuenta (T6), o null si el gateway nunca la ha leído. BIGINT llega como texto. */
export async function leerCheckpoint(
  pool: sql.ConnectionPool,
  cuenta: string,
): Promise<{ uidValidity: number; ultimoUid: number } | null> {
  const c = validar(z.string().min(1).max(255), cuenta);
  return withTx(
    pool,
    async (tx) => {
      const fila = (
        await tx
          .request()
          .input('cuenta', sql.NVarChar(255), c)
          .query<{ uidValidity: string; ultimoUid: string }>(
            'SELECT uidValidity, ultimoUid FROM GATEWAY_CHECKPOINT WHERE cuenta = @cuenta',
          )
      ).recordset[0];
      return fila ? { uidValidity: Number(fila.uidValidity), ultimoUid: Number(fila.ultimoUid) } : null;
    },
    { isolation: 'SNAPSHOT' },
  );
}

/** Configuración pública del buzón IMAP del conjunto: jamás incluye la contraseña cifrada. */
export interface BuzonPublico {
  correo: string;
  imapHost: string;
  imapPort: number;
  buzon: string;
  diasIniciales: number;
  marcarLeido: boolean;
  activo: boolean;
  ultimaSincronizacion: Date | null;
  ultimoError: string | null;
  version: number;
}

/**
 * Estado del gateway de un conjunto para el panel: sus cuentas leídas, último avance, volumen del buzón
 * y la configuración pública del buzón (`conectado` = hay buzón activo).
 */
export async function estadoGateway(pool: sql.ConnectionPool, idConjunto: number) {
  const conj = validar(IdConjuntoSchema, idConjunto);
  return withTx(
    pool,
    async (tx) => {
      const cuentas = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .query<{ cuenta: string; ultimoUid: string; actualizadoEn: Date }>(
            'SELECT cuenta, ultimoUid, actualizadoEn FROM GATEWAY_CHECKPOINT WHERE idConjunto = @idConjunto ORDER BY cuenta',
          )
      ).recordset.map((c) => ({ ...c, ultimoUid: Number(c.ultimoUid) }));
      const volumen = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .query<{ totalCorreos: number; ultimoCorreo: Date | null }>(
            'SELECT COUNT(*) AS totalCorreos, MAX(fechaRecepcion) AS ultimoCorreo FROM CORREOS WHERE idConjunto = @idConjunto',
          )
      ).recordset[0]!;
      // Columnas explícitas: contrasenaCifrada nunca sale de la BD por esta consulta.
      const config =
        (
          await tx
            .request()
            .input('idConjunto', sql.Int, conj)
            .query<BuzonPublico>(
              `SELECT correo, imapHost, imapPort, buzon, diasIniciales, marcarLeido, activo, ultimaSincronizacion,
                      ultimoError, version
                 FROM BUZONES_CONJUNTO WHERE idConjunto = @idConjunto`,
            )
        ).recordset[0] ?? null;
      return { cuentas, ...volumen, conectado: config?.activo === true, buzon: config };
    },
    { isolation: 'SNAPSHOT' },
  );
}

export interface UsuarioConjunto {
  id: number;
  nombre: string;
  correo: string;
  rol: Rol;
  /** Estado de la MEMBRESÍA en el conjunto (no el del usuario en general). */
  activo: boolean;
  /** Versión de la membresía: el panel la devuelve como `versionEsperada` al editarla. */
  version: number;
  /** `USUARIOS.activo`: false = cuenta deshabilitada en la plataforma (no puede entrar aunque la membresía esté activa). */
  cuentaActiva: boolean;
}

const FiltroUsuariosSchema = z.object({
  rol: z.enum(['ADMIN', 'SOPORTE']).optional(),
  incluirInactivos: z.boolean().optional(),
});

/**
 * Personal con membresía en el conjunto (manda `USUARIO_CONJUNTOS.rol`). Por defecto solo activos (usuario
 * y membresía); con `incluirInactivos` también las membresías inactivas, para administrarlas.
 */
export async function listarUsuariosConjunto(
  pool: sql.ConnectionPool,
  idConjunto: number,
  filtro: { rol?: Rol; incluirInactivos?: boolean } = {},
): Promise<UsuarioConjunto[]> {
  const conj = validar(IdConjuntoSchema, idConjunto);
  const f = validar(FiltroUsuariosSchema, filtro);
  return withTx(
    pool,
    async (tx) => {
      const r = await tx
        .request()
        .input('idConjunto', sql.Int, conj)
        .input('rol', sql.VarChar(30), f.rol ?? null)
        .input('todos', sql.Bit, f.incluirInactivos ?? false)
        .query<UsuarioConjunto>(
          `SELECT u.idUsuario AS id, u.nombre, u.correo, m.rol, m.activo, m.version, u.activo AS cuentaActiva
             FROM USUARIO_CONJUNTOS m
             JOIN USUARIOS u ON u.idUsuario = m.idUsuario
            WHERE m.idConjunto = @idConjunto AND (@todos = 1 OR (m.activo = 1 AND u.activo = 1))
              AND (@rol IS NULL OR m.rol = @rol)
            ORDER BY u.nombre, u.idUsuario`,
        );
      return r.recordset;
    },
    { isolation: 'SNAPSHOT' },
  );
}

/**
 * Indicadores del conjunto (antesala de T5). Carga = asignaciones vigentes de solicitudes no finales.
 * Tiempo de respuesta en minutos hasta la primera respuesta, y % dentro del SLA de su prioridad.
 */
export async function resumen(pool: sql.ConnectionPool, idConjunto: number) {
  const conj = validar(IdConjuntoSchema, idConjunto);
  return withTx(
    pool,
    async (tx) => {
      const req = () => tx.request().input('idConjunto', sql.Int, conj);
      const porEstado = (
        await req().query<{ estado: string; n: number }>(
          `SELECT e.nombre AS estado, COUNT(s.idSolicitud) AS n
             FROM ESTADOS e
             LEFT JOIN (
               SELECT s.idSolicitud, s.idEstado
                 FROM SOLICITUDES s
                 JOIN CORREOS c ON c.idCorreo = s.idCorreo
                WHERE c.idConjunto = @idConjunto
             ) s ON s.idEstado = e.idEstado
            GROUP BY e.nombre, e.idEstado ORDER BY e.idEstado`,
        )
      ).recordset;
      const carga = (
        await req().query<{ idUsuario: number; nombre: string; abiertas: number }>(
          `SELECT u.idUsuario, u.nombre, COUNT(s.idSolicitud) AS abiertas
             FROM USUARIO_CONJUNTOS m
             JOIN USUARIOS u ON u.idUsuario = m.idUsuario
             LEFT JOIN ASIGNACIONES a ON a.idUsuario = u.idUsuario AND a.liberadaEn IS NULL
             LEFT JOIN (
               SELECT s.idSolicitud
                 FROM SOLICITUDES s
                 JOIN CORREOS c ON c.idCorreo = s.idCorreo
                 JOIN ESTADOS e ON e.idEstado = s.idEstado
                WHERE c.idConjunto = @idConjunto AND e.esFinal = 0
             ) s ON s.idSolicitud = a.idSolicitud
            WHERE m.idConjunto = @idConjunto AND m.rol = 'SOPORTE' AND m.activo = 1 AND u.activo = 1
            GROUP BY u.idUsuario, u.nombre ORDER BY u.nombre`,
        )
      ).recordset;
      const respuesta = (
        await req().query<{ categoria: string; total: number; minutosPromedio: number; dentroSla: number }>(
          `SELECT cat.nombre AS categoria, COUNT(*) AS total,
                  AVG(DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta)) AS minutosPromedio,
                  SUM(CASE WHEN DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta) <= p.slaHoras * 60 THEN 1 ELSE 0 END) AS dentroSla
             FROM SOLICITUDES s
             JOIN CORREOS c ON c.idCorreo = s.idCorreo
             JOIN CATEGORIAS cat ON cat.idCategoria = s.idCategoria
             JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad
            WHERE c.idConjunto = @idConjunto AND s.primeraRespuesta IS NOT NULL
            GROUP BY cat.nombre ORDER BY cat.nombre`,
        )
      ).recordset;
      return { porEstado, carga, respuesta };
    },
    { isolation: 'SNAPSHOT' },
  );
}

export const FiltroReporteSchema = z
  .object({
    desde: z.coerce.date().optional(),
    hasta: z.coerce.date().optional(),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    message: 'La fecha inicial debe ser menor o igual a la final',
  });
export type FiltroReporte = z.input<typeof FiltroReporteSchema>;

export interface ReporteSolicitudes {
  periodo: { desde: string | null; hasta: string | null };
  totales: { total: number; abiertas: number; resueltas: number; cerradas: number };
  porEstado: { estado: string; n: number }[];
  porCategoria: { categoria: string; n: number }[];
  porPrioridad: { prioridad: string; n: number }[];
  respuesta: { categoria: string; total: number; minutosPromedio: number; dentroSla: number; porcentajeSla: number }[];
  global: { totalConRespuesta: number; minutosPromedio: number | null; dentroSla: number; porcentajeSla: number | null };
  carga: { idUsuario: number; nombre: string; abiertas: number; resueltasEnPeriodo: number }[];
}

/**
 * T5 — Reporte del conjunto en aislamiento SNAPSHOT (foto consistente).
 * Incluye distribución por estado/categoría/prioridad, tiempo promedio de primera respuesta, % dentro de SLA
 * y carga por responsable (membresía SOPORTE activa en el conjunto).
 */
export async function generarReporte(
  pool: sql.ConnectionPool,
  idConjunto: number,
  filtro: FiltroReporte = {},
): Promise<ReporteSolicitudes> {
  const conj = validar(IdConjuntoSchema, idConjunto);
  const f = validar(FiltroReporteSchema, filtro);
  return withTx(
    pool,
    async (tx) => {
      const req = () =>
        tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .input('desde', sql.DateTime2, f.desde ?? null)
          .input('hasta', sql.DateTime2, f.hasta ?? null);

      const porEstado = (
        await req().query<{ estado: string; n: number }>(
          `SELECT e.nombre AS estado, COUNT(s.idSolicitud) AS n
             FROM ESTADOS e
             LEFT JOIN (
               SELECT s.idSolicitud, s.idEstado
                 FROM SOLICITUDES s
                 JOIN CORREOS c ON c.idCorreo = s.idCorreo
                WHERE c.idConjunto = @idConjunto
                  AND (@desde IS NULL OR s.fechaCreacion >= @desde)
                  AND (@hasta IS NULL OR s.fechaCreacion <= @hasta)
             ) s ON s.idEstado = e.idEstado
            GROUP BY e.nombre, e.idEstado ORDER BY e.idEstado`,
        )
      ).recordset;

      const porCategoria = (
        await req().query<{ categoria: string; n: number }>(
          `SELECT cat.nombre AS categoria, COUNT(s.idSolicitud) AS n
             FROM CATEGORIAS cat
             LEFT JOIN (
               SELECT s.idSolicitud, s.idCategoria
                 FROM SOLICITUDES s
                 JOIN CORREOS c ON c.idCorreo = s.idCorreo
                WHERE c.idConjunto = @idConjunto
                  AND (@desde IS NULL OR s.fechaCreacion >= @desde)
                  AND (@hasta IS NULL OR s.fechaCreacion <= @hasta)
             ) s ON s.idCategoria = cat.idCategoria
            GROUP BY cat.nombre ORDER BY cat.nombre`,
        )
      ).recordset;

      const porPrioridad = (
        await req().query<{ prioridad: string; n: number }>(
          `SELECT p.nombre AS prioridad, COUNT(s.idSolicitud) AS n
             FROM PRIORIDADES p
             LEFT JOIN (
               SELECT s.idSolicitud, s.idPrioridad
                 FROM SOLICITUDES s
                 JOIN CORREOS c ON c.idCorreo = s.idCorreo
                WHERE c.idConjunto = @idConjunto
                  AND (@desde IS NULL OR s.fechaCreacion >= @desde)
                  AND (@hasta IS NULL OR s.fechaCreacion <= @hasta)
             ) s ON s.idPrioridad = p.idPrioridad
            GROUP BY p.nombre, p.peso ORDER BY p.peso DESC`,
        )
      ).recordset;

      const respuestaRaw = (
        await req().query<{ categoria: string; total: number; minutosPromedio: number; dentroSla: number }>(
          `SELECT cat.nombre AS categoria, COUNT(*) AS total,
                  AVG(DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta)) AS minutosPromedio,
                  SUM(CASE WHEN DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta) <= p.slaHoras * 60 THEN 1 ELSE 0 END) AS dentroSla
             FROM SOLICITUDES s
             JOIN CORREOS c ON c.idCorreo = s.idCorreo
             JOIN CATEGORIAS cat ON cat.idCategoria = s.idCategoria
             JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad
            WHERE c.idConjunto = @idConjunto
              AND (@desde IS NULL OR s.fechaCreacion >= @desde)
              AND (@hasta IS NULL OR s.fechaCreacion <= @hasta)
              AND s.primeraRespuesta IS NOT NULL
            GROUP BY cat.nombre ORDER BY cat.nombre`,
        )
      ).recordset;

      const respuesta = respuestaRaw.map((r) => ({
        ...r,
        porcentajeSla: r.total > 0 ? Math.round((r.dentroSla * 1000) / r.total) / 10 : 0,
      }));

      const globalRaw = (
        await req().query<{ totalConRespuesta: number; minutosPromedio: number | null; dentroSla: number | null }>(
          `SELECT COUNT(*) AS totalConRespuesta,
                  AVG(DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta)) AS minutosPromedio,
                  SUM(CASE WHEN DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta) <= p.slaHoras * 60 THEN 1 ELSE 0 END) AS dentroSla
             FROM SOLICITUDES s
             JOIN CORREOS c ON c.idCorreo = s.idCorreo
             JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad
            WHERE c.idConjunto = @idConjunto
              AND (@desde IS NULL OR s.fechaCreacion >= @desde)
              AND (@hasta IS NULL OR s.fechaCreacion <= @hasta)
              AND s.primeraRespuesta IS NOT NULL`,
        )
      ).recordset[0]!;

      const dentroSlaGlobal = globalRaw.dentroSla ?? 0;
      const global = {
        totalConRespuesta: globalRaw.totalConRespuesta,
        minutosPromedio: globalRaw.minutosPromedio,
        dentroSla: dentroSlaGlobal,
        porcentajeSla:
          globalRaw.totalConRespuesta > 0 ? Math.round((dentroSlaGlobal * 1000) / globalRaw.totalConRespuesta) / 10 : null,
      };

      const carga = (
        await req().query<{ idUsuario: number; nombre: string; abiertas: number; resueltasEnPeriodo: number }>(
          `SELECT u.idUsuario, u.nombre,
                  COUNT(DISTINCT CASE WHEN s.esFinal = 0 THEN s.idSolicitud END) AS abiertas,
                  COUNT(DISTINCT CASE WHEN s.esFinal = 1 THEN s.idSolicitud END) AS resueltasEnPeriodo
             FROM USUARIO_CONJUNTOS m
             JOIN USUARIOS u ON u.idUsuario = m.idUsuario
             LEFT JOIN ASIGNACIONES a ON a.idUsuario = u.idUsuario AND a.liberadaEn IS NULL
             LEFT JOIN (
               SELECT s.idSolicitud, e.esFinal
                 FROM SOLICITUDES s
                 JOIN CORREOS c ON c.idCorreo = s.idCorreo
                 JOIN ESTADOS e ON e.idEstado = s.idEstado
                WHERE c.idConjunto = @idConjunto
                  AND (@desde IS NULL OR s.fechaCreacion >= @desde)
                  AND (@hasta IS NULL OR s.fechaCreacion <= @hasta)
             ) s ON s.idSolicitud = a.idSolicitud
            WHERE m.idConjunto = @idConjunto AND m.rol = 'SOPORTE' AND m.activo = 1 AND u.activo = 1
            GROUP BY u.idUsuario, u.nombre ORDER BY u.nombre`,
        )
      ).recordset;

      const porEstadoMap = new Map(porEstado.map((e) => [e.estado, e.n]));
      const total = porEstado.reduce((acc, e) => acc + e.n, 0);
      const resueltas = porEstadoMap.get('RESUELTA') ?? 0;
      const cerradas = porEstadoMap.get('CERRADA') ?? 0;
      const abiertas = total - resueltas - cerradas;

      return {
        periodo: {
          desde: f.desde ? f.desde.toISOString() : null,
          hasta: f.hasta ? f.hasta.toISOString() : null,
        },
        totales: { total, abiertas, resueltas, cerradas },
        porEstado,
        porCategoria,
        porPrioridad,
        respuesta,
        global,
        carga,
      };
    },
    { isolation: 'SNAPSHOT' },
  );
}

/** Convierte un reporte en CSV UTF-8 para descarga directa desde el panel. */
export function reporteACsv(r: ReporteSolicitudes): string {
  const esc = (v: string | number | null) => {
    const txt = v === null ? '' : String(v);
    return /[",\n\r]/.test(txt) ? `"${txt.replace(/"/g, '""')}"` : txt;
  };
  const filas: string[] = ['seccion,concepto,cantidad,minutos_promedio,dentro_sla,porcentaje_sla'];
  for (const e of r.porEstado) filas.push(['estado', e.estado, e.n, '', '', ''].map(esc).join(','));
  for (const c of r.porCategoria) filas.push(['categoria', c.categoria, c.n, '', '', ''].map(esc).join(','));
  for (const p of r.porPrioridad) filas.push(['prioridad', p.prioridad, p.n, '', '', ''].map(esc).join(','));
  for (const s of r.respuesta) {
    filas.push(['sla', s.categoria, s.total, s.minutosPromedio, s.dentroSla, s.porcentajeSla].map(esc).join(','));
  }
  for (const u of r.carga) {
    filas.push(['carga_abiertas', u.nombre, u.abiertas, '', '', ''].map(esc).join(','));
  }
  return filas.join('\r\n') + '\r\n';
}

/* ---------------------------------------------------------------------------------------------
 * Ola 2 (F3): Cola de validación y catálogos del dominio + BD.
 * ------------------------------------------------------------------------------------------- */

export interface SugerenciaPendienteValidacion {
  idSolicitud: number;
  codigo: string;
  asunto: string | null;
  remitente: string;
  fechaCreacion: Date;
  estado: Estado;
  categoriaActual: Categoria;
  prioridadActual: Prioridad;
  version: number;
  sugerencia: {
    categoria: Categoria;
    prioridad: Prioridad;
    resumen: string;
    justificacion: string | null;
    proveedor: string;
    modelo: string;
    fechaActualizacion: Date;
  };
}

export interface ColaValidacion {
  sugerencias: SugerenciaPendienteValidacion[];
  remitentesSinResidente: (FilaCorreo & { extracto: string })[];
}

interface FilaSugerenciaPendienteRaw {
  idSolicitud: number;
  codigo: string;
  asunto: string | null;
  remitente: string;
  fechaCreacion: Date;
  estado: Estado;
  categoriaActual: Categoria;
  prioridadActual: Prioridad;
  version: number;
  sugCategoria: Categoria;
  sugPrioridad: Prioridad;
  sugResumen: string;
  sugJustificacion: string | null;
  sugProveedor: string;
  sugModelo: string;
  sugFechaActualizacion: Date;
}

/**
 * Cola de validación del conjunto en SNAPSHOT:
 * 1) Solicitudes no cerradas con sugerencia IA `LISTA` que difiere en categoría o prioridad y sin decisión
 *    humana posterior (reclasificación manual o aceptación de sugerencia).
 * 2) Correos del conjunto sin residente vinculado (`idResidente IS NULL`), más recientes primero.
 */
export async function colaValidacion(pool: sql.ConnectionPool, idConjunto: number): Promise<ColaValidacion> {
  const conj = validar(IdConjuntoSchema, idConjunto);
  return withTx(
    pool,
    async (tx) => {
      const sugRaw = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .query<FilaSugerenciaPendienteRaw>(
            `SELECT s.idSolicitud,
                    'SOL-' + RIGHT('000000' + CAST(s.idSolicitud AS VARCHAR(10)), 6) AS codigo,
                    c.asunto,
                    c.remitente,
                    s.fechaCreacion,
                    e.nombre AS estado,
                    cat.nombre AS categoriaActual,
                    p.nombre AS prioridadActual,
                    s.version,
                    catSug.nombre AS sugCategoria,
                    pSug.nombre AS sugPrioridad,
                    g.resumen AS sugResumen,
                    g.justificacion AS sugJustificacion,
                    g.proveedor AS sugProveedor,
                    g.modelo AS sugModelo,
                    g.fechaActualizacion AS sugFechaActualizacion
               FROM dbo.SOLICITUDES s
               JOIN dbo.CORREOS c ON c.idCorreo = s.idCorreo
               JOIN dbo.ESTADOS e ON e.idEstado = s.idEstado
               JOIN dbo.CATEGORIAS cat ON cat.idCategoria = s.idCategoria
               JOIN dbo.PRIORIDADES p ON p.idPrioridad = s.idPrioridad
               JOIN dbo.SUGERENCIAS_IA g ON g.idSolicitud = s.idSolicitud
               JOIN dbo.CATEGORIAS catSug ON catSug.idCategoria = g.idCategoria
               JOIN dbo.PRIORIDADES pSug ON pSug.idPrioridad = g.idPrioridad
              WHERE c.idConjunto = @idConjunto
                AND e.nombre <> 'CERRADA'
                AND g.estado = 'LISTA'
                AND (s.idCategoria <> g.idCategoria OR s.idPrioridad <> g.idPrioridad)
                AND NOT EXISTS (
                  SELECT 1
                    FROM dbo.HISTORIAL_ESTADOS h
                   WHERE h.idSolicitud = s.idSolicitud
                     AND h.idUsuario IS NOT NULL
                     AND h.idEstadoAnterior = h.idEstadoNuevo
                     AND h.fecha >= g.fechaActualizacion
                     AND (h.comentario LIKE N'Reclasificada:%' OR h.comentario LIKE N'Sugerencia IA aceptada:%')
                )
              ORDER BY p.peso DESC, s.fechaCreacion DESC, s.idSolicitud DESC`,
          )
      ).recordset;

      const sugerencias: SugerenciaPendienteValidacion[] = sugRaw.map((f) => ({
        idSolicitud: f.idSolicitud,
        codigo: f.codigo,
        asunto: f.asunto,
        remitente: f.remitente,
        fechaCreacion: f.fechaCreacion,
        estado: f.estado,
        categoriaActual: f.categoriaActual,
        prioridadActual: f.prioridadActual,
        version: f.version,
        sugerencia: {
          categoria: f.sugCategoria,
          prioridad: f.sugPrioridad,
          resumen: f.sugResumen,
          justificacion: f.sugJustificacion,
          proveedor: f.sugProveedor,
          modelo: f.sugModelo,
          fechaActualizacion: f.sugFechaActualizacion,
        },
      }));

      const remitentesSinResidente = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .query<FilaCorreo & { extracto: string }>(
            `${BUZON}, LEFT(COALESCE(c.cuerpo, N''), 200) AS extracto ${BUZON_FROM}
              WHERE c.idConjunto = @idConjunto AND c.idResidente IS NULL
              ORDER BY c.fechaRecepcion DESC, c.idCorreo DESC`,
          )
      ).recordset;

      return { sugerencias, remitentesSinResidente };
    },
    { isolation: 'SNAPSHOT' },
  );
}

export interface CatalogoCategoria {
  id: number;
  nombre: Categoria;
  prioridadBase: Prioridad;
  palabrasClave: readonly string[];
}

export interface CatalogoPrioridad {
  id: number;
  nombre: Prioridad;
  peso: number;
  slaHoras: number;
}

export interface CatalogoEstado {
  id: number;
  nombre: Estado;
  esFinal: boolean;
}

export interface CatalogoTransicion {
  origen: Estado;
  destino: Estado;
}

export interface CatalogosDominio {
  categorias: CatalogoCategoria[];
  prioridades: CatalogoPrioridad[];
  palabrasClaveUrgencia: string[];
  estados: CatalogoEstado[];
  transiciones: CatalogoTransicion[];
}

/** Catálogos oficiales leídos desde la BD en SNAPSHOT combinados con los metadatos puros de `domain/`. */
export async function obtenerCatalogos(pool: sql.ConnectionPool): Promise<CatalogosDominio> {
  return withTx(
    pool,
    async (tx) => {
      const catRows = (
        await tx
          .request()
          .query<{ id: number; nombre: Categoria }>('SELECT idCategoria AS id, nombre FROM dbo.CATEGORIAS ORDER BY idCategoria')
      ).recordset;

      const ordenCategoria = (c: Categoria) => {
        const idx = CATEGORIAS.indexOf(c);
        return idx === -1 ? CATEGORIAS.length : idx;
      };

      const categorias: CatalogoCategoria[] = [...catRows]
        .sort((a, b) => ordenCategoria(a.nombre) - ordenCategoria(b.nombre))
        .map((c) => ({
          id: c.id,
          nombre: c.nombre,
          prioridadBase: PRIORIDAD_BASE_POR_CATEGORIA[c.nombre] ?? 'MEDIA',
          palabrasClave: [...(PALABRAS_CLAVE_POR_CATEGORIA[c.nombre] ?? [])],
        }));

      const prioridades = (
        await tx
          .request()
          .query<CatalogoPrioridad>('SELECT idPrioridad AS id, nombre, peso, slaHoras FROM dbo.PRIORIDADES ORDER BY peso DESC')
      ).recordset;

      const estados = (
        await tx
          .request()
          .query<CatalogoEstado>('SELECT idEstado AS id, nombre, esFinal FROM dbo.ESTADOS ORDER BY idEstado')
      ).recordset;

      const transiciones = (
        await tx
          .request()
          .query<CatalogoTransicion>(
            `SELECT o.nombre AS origen, d.nombre AS destino
               FROM dbo.TRANSICIONES_ESTADO t
               JOIN dbo.ESTADOS o ON o.idEstado = t.idEstadoOrigen
               JOIN dbo.ESTADOS d ON d.idEstado = t.idEstadoDestino
              ORDER BY t.idEstadoOrigen, t.idEstadoDestino`,
          )
      ).recordset;

      return {
        categorias,
        prioridades,
        palabrasClaveUrgencia: [...PALABRAS_CLAVE_URGENCIA],
        estados,
        transiciones,
      };
    },
    { isolation: 'SNAPSHOT' },
  );
}

/* ---------------------------------------------------------------------------------------------
 * Ola 3 (F4): Bitácora unificada de auditoría del conjunto.
 * ------------------------------------------------------------------------------------------- */

export type TipoEventoAuditoria = 'ESTADO' | 'ASIGNACION' | 'ADMIN';

export interface EventoAuditoria {
  tipo: TipoEventoAuditoria;
  entidad: string;
  codigo: string;
  accion: string;
  actor: string;
  detalle: string | null;
  fecha: Date;
}

export const FiltroAuditoriaSchema = z.object({
  q: z.string().trim().max(200).optional(),
  limite: z.number().int().min(1).max(200).default(50),
  desplazamiento: z.number().int().min(0).default(0),
});
export type FiltroAuditoria = z.input<typeof FiltroAuditoriaSchema>;

const AUDITORIA_CTE = `
  WITH eventos AS (
    SELECT CAST('ESTADO' AS VARCHAR(12)) AS tipo,
           CAST('SOLICITUD' AS VARCHAR(20)) AS entidad,
           'SOL-' + RIGHT('000000' + CAST(s.idSolicitud AS VARCHAR(10)), 6) AS codigo,
           CASE
             WHEN ea.nombre IS NULL THEN N'Creada en ' + CAST(en.nombre AS NVARCHAR(30))
             ELSE CAST(ea.nombre AS NVARCHAR(30)) + N' → ' + CAST(en.nombre AS NVARCHAR(30))
           END AS accion,
           COALESCE(u.nombre, N'Sistema') AS actor,
           CAST(h.comentario AS NVARCHAR(500)) AS detalle,
           CAST(h.fecha AS DATETIME2) AS fecha
      FROM dbo.HISTORIAL_ESTADOS h
      JOIN dbo.SOLICITUDES s ON s.idSolicitud = h.idSolicitud
      JOIN dbo.CORREOS c ON c.idCorreo = s.idCorreo
      LEFT JOIN dbo.ESTADOS ea ON ea.idEstado = h.idEstadoAnterior
      JOIN dbo.ESTADOS en ON en.idEstado = h.idEstadoNuevo
      LEFT JOIN dbo.USUARIOS u ON u.idUsuario = h.idUsuario
     WHERE c.idConjunto = @idConjunto

    UNION ALL

    SELECT CAST('ASIGNACION' AS VARCHAR(12)) AS tipo,
           CAST('SOLICITUD' AS VARCHAR(20)) AS entidad,
           'SOL-' + RIGHT('000000' + CAST(s.idSolicitud AS VARCHAR(10)), 6) AS codigo,
           CASE
             WHEN a.liberadaEn IS NULL THEN N'Asignación'
             ELSE N'Asignación (liberada)'
           END AS accion,
           COALESCE(upor.nombre, N'Sistema') AS actor,
           CAST(N'Responsable: ' + uresp.nombre AS NVARCHAR(500)) AS detalle,
           CAST(a.fechaAsignacion AS DATETIME2) AS fecha
      FROM dbo.ASIGNACIONES a
      JOIN dbo.SOLICITUDES s ON s.idSolicitud = a.idSolicitud
      JOIN dbo.CORREOS c ON c.idCorreo = s.idCorreo
      JOIN dbo.USUARIOS uresp ON uresp.idUsuario = a.idUsuario
      LEFT JOIN dbo.USUARIOS upor ON upor.idUsuario = a.asignadaPor
     WHERE c.idConjunto = @idConjunto

    UNION ALL

    SELECT CAST('ADMIN' AS VARCHAR(12)) AS tipo,
           aa.entidad,
           aa.entidad + '#' + CAST(aa.idEntidad AS VARCHAR(12)) AS codigo,
           CAST(aa.accion AS NVARCHAR(65)) AS accion,
           COALESCE(u.nombre, N'Sistema') AS actor,
           CAST(aa.detalle AS NVARCHAR(500)) AS detalle,
           aa.fecha
      FROM dbo.AUDITORIA_ADMIN aa
      LEFT JOIN dbo.USUARIOS u ON u.idUsuario = aa.idUsuario
     WHERE aa.idConjunto = @idConjunto
  )`;

const AUDITORIA_FILTRO = `
  WHERE (@patron IS NULL
     OR codigo  LIKE @patron ESCAPE '\\'
     OR actor   LIKE @patron ESCAPE '\\'
     OR accion  LIKE @patron ESCAPE '\\'
     OR detalle LIKE @patron ESCAPE '\\'
     OR entidad LIKE @patron ESCAPE '\\')`;

/**
 * Bitácora paginada del conjunto en aislamiento SNAPSHOT. Une cambios de estado (`HISTORIAL_ESTADOS`),
 * asignaciones (`ASIGNACIONES`) y auditoría administrativa (`AUDITORIA_ADMIN`), ordenados por `fecha DESC`.
 */
export async function listarAuditoriaConjunto(
  pool: sql.ConnectionPool,
  idConjunto: number,
  filtro: FiltroAuditoria = {},
): Promise<{ total: number; eventos: EventoAuditoria[] }> {
  const conj = validar(IdConjuntoSchema, idConjunto);
  const f = validar(FiltroAuditoriaSchema, filtro);
  const patron = patronLike(f.q);
  return withTx(
    pool,
    async (tx) => {
      const total = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .input('patron', sql.NVarChar(450), patron)
          .query<{ total: number }>(`${AUDITORIA_CTE} SELECT COUNT(*) AS total FROM eventos ${AUDITORIA_FILTRO}`)
      ).recordset[0]!.total;

      const eventos = (
        await tx
          .request()
          .input('idConjunto', sql.Int, conj)
          .input('patron', sql.NVarChar(450), patron)
          .input('lim', sql.Int, f.limite)
          .input('desp', sql.Int, f.desplazamiento)
          .query<EventoAuditoria>(
            `${AUDITORIA_CTE}
             SELECT tipo, entidad, codigo, accion, actor, detalle, fecha
               FROM eventos
             ${AUDITORIA_FILTRO}
              ORDER BY fecha DESC
             OFFSET @desp ROWS FETCH NEXT @lim ROWS ONLY`,
          )
      ).recordset;

      return { total, eventos };
    },
    { isolation: 'SNAPSHOT' },
  );
}
