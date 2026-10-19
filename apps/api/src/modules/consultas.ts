import sql from 'mssql';
import { z } from 'zod';
import { CATEGORIAS } from '../domain/clasificador.js';
import { destinosDesde, ESTADOS, type Estado } from '../domain/estados.js';
import { PRIORIDADES } from '../domain/priorizador.js';
import { withTx } from '../db/withTx.js';
import { NotFound } from '../errors.js';
import { validar } from './solicitudes.js';

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

/** Bandeja ordenada por urgencia (peso de prioridad) y antigüedad, con filtros y paginación. */
export async function listarSolicitudes(pool: sql.ConnectionPool, filtro: FiltroBandeja = {}): Promise<FilaBandeja[]> {
  const f = validar(FiltroBandejaSchema, filtro);
  return withTx(
    pool,
    async (tx) => {
      const r = await tx
        .request()
        .input('estado', sql.VarChar(30), f.estado ?? null)
        .input('categoria', sql.VarChar(50), f.categoria ?? null)
        .input('prioridad', sql.VarChar(20), f.prioridad ?? null)
        .input('resp', sql.Int, f.idResponsable ?? null)
        .input('lim', sql.Int, f.limite)
        .input('desp', sql.Int, f.desplazamiento)
        .query<FilaBandeja>(
          `${BANDEJA}
            WHERE (@estado IS NULL OR e.nombre = @estado)
              AND (@categoria IS NULL OR cat.nombre = @categoria)
              AND (@prioridad IS NULL OR p.nombre = @prioridad)
              AND (@resp IS NULL OR a.idUsuario = @resp)
            ORDER BY p.peso DESC, s.fechaCreacion DESC, s.idSolicitud DESC
            OFFSET @desp ROWS FETCH NEXT @lim ROWS ONLY`,
        );
      return r.recordset;
    },
    { isolation: 'SNAPSHOT' },
  );
}

/** Detalle completo y consistente de una solicitud, con los destinos de estado válidos para la UI. */
export async function detalleSolicitud(pool: sql.ConnectionPool, idSolicitud: number) {
  const idValido = validar(z.number().int().positive(), idSolicitud);
  return withTx(
    pool,
    async (tx) => {
      const req = () => tx.request().input('id', sql.Int, idValido);
      const sol = (await req().query<FilaBandeja>(`${BANDEJA} WHERE s.idSolicitud = @id`)).recordset[0];
      if (!sol) throw new NotFound(`La solicitud ${idValido} no existe`);
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
      // ASIGNADA no se ofrece como destino: se alcanza asignando un responsable (T2).
      const destinos = destinosDesde(sol.estado).filter((e) => e !== 'ASIGNADA');
      return { ...sol, cuerpo: correo?.cuerpo ?? '', messageId: correo?.messageId ?? '', historial, asignaciones, destinos };
    },
    { isolation: 'SNAPSHOT' },
  );
}

/**
 * Indicadores (antesala de T5). Carga = asignaciones vigentes de solicitudes no finales.
 * Tiempo de respuesta en minutos hasta la primera respuesta, y % dentro del SLA de su prioridad.
 */
export async function resumen(pool: sql.ConnectionPool) {
  return withTx(
    pool,
    async (tx) => {
      const porEstado = (
        await tx.request().query<{ estado: string; n: number }>(
          `SELECT e.nombre AS estado, COUNT(s.idSolicitud) AS n
             FROM ESTADOS e LEFT JOIN SOLICITUDES s ON s.idEstado = e.idEstado
            GROUP BY e.nombre, e.idEstado ORDER BY e.idEstado`,
        )
      ).recordset;
      const carga = (
        await tx.request().query<{ idUsuario: number; nombre: string; abiertas: number }>(
          `SELECT u.idUsuario, u.nombre, COUNT(s.idSolicitud) AS abiertas
             FROM USUARIOS u
             LEFT JOIN ASIGNACIONES a ON a.idUsuario = u.idUsuario AND a.liberadaEn IS NULL
             LEFT JOIN SOLICITUDES s ON s.idSolicitud = a.idSolicitud
                    AND s.idEstado IN (SELECT idEstado FROM ESTADOS WHERE esFinal = 0)
            WHERE u.rol = 'SOPORTE' AND u.activo = 1
            GROUP BY u.idUsuario, u.nombre ORDER BY u.nombre`,
        )
      ).recordset;
      const respuesta = (
        await tx.request().query<{ categoria: string; total: number; minutosPromedio: number; dentroSla: number }>(
          `SELECT cat.nombre AS categoria, COUNT(*) AS total,
                  AVG(DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta)) AS minutosPromedio,
                  SUM(CASE WHEN DATEDIFF(MINUTE, s.fechaCreacion, s.primeraRespuesta) <= p.slaHoras * 60 THEN 1 ELSE 0 END) AS dentroSla
             FROM SOLICITUDES s
             JOIN CATEGORIAS cat ON cat.idCategoria = s.idCategoria
             JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad
            WHERE s.primeraRespuesta IS NOT NULL
            GROUP BY cat.nombre ORDER BY cat.nombre`,
        )
      ).recordset;
      return { porEstado, carga, respuesta };
    },
    { isolation: 'SNAPSHOT' },
  );
}
