import { createHash, randomBytes } from 'node:crypto';
import sql from 'mssql';
import { z } from 'zod';
import { withTx, type Tx } from '../db/withTx.js';
import { ErrorAcceso } from '../errors.js';
import { aPublico, type ConjuntoPublico, type FilaConjunto } from './conjuntos.js';
import { validar } from './solicitudes.js';

/** Valores del spec: la sesión vence tras 30 min sin actividad; la actividad se guarda como mucho una vez por minuto. */
export const LIMITE_INACTIVIDAD_MS = 30 * 60_000;
export const RENOVACION_MIN_MS = 60_000;

type Rol = 'ADMIN' | 'SOPORTE';

/** Lo que el panel recibe de la sesión (`ultimaActividad` en epoch ms). */
export interface SesionPublica {
  /** `rol` es el de la membresía en el conjunto activo. */
  usuario: { id: string; nombre: string; correo: string; rol: Rol };
  conjuntoActivo: ConjuntoPublico;
  /** Membresías activas en conjuntos activos, por nombre. */
  conjuntos: ConjuntoPublico[];
  ultimaActividad: number;
}

/** Sesión validada para las rutas: el DTO más los ids internos. */
export interface SesionActiva extends SesionPublica {
  idSesion: number;
  idUsuario: number;
  idConjuntoActivo: number;
}

/** `randomBytes(32)` en base64url: 43 caracteres. Cualquier otra forma ni se consulta. */
const FORMA_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const CambioSchema = z.object({ conjuntoId: z.string().regex(/^\d{1,9}$/, 'conjunto inválido').transform(Number) });

/** SHA-256 del token: lo único que se guarda (el token es aleatorio de 256 bits, no hace falta sal ni HMAC). */
const hashToken = (token: string) => createHash('sha256').update(token).digest();

const noAutenticado = () => new ErrorAcceso(401, 'NO_AUTENTICADO');

/** La transacción devuelve el error en vez de lanzarlo: un throw revertiría la revocación. */
type Resultado<T> = { ok: true; valor: T } | { ok: false; error: ErrorAcceso };
const fallo = (error: ErrorAcceso) => ({ ok: false, error }) as const;

interface FilaSesion {
  idSesion: string; // BIGINT llega como texto
  idUsuario: number;
  idConjuntoActivo: number;
  ultimaActividad: Date;
}

/**
 * Arma el DTO si el usuario está activo y tiene membresía activa en `idConjuntoActivo` (conjunto activo);
 * si no, null.
 */
async function cargarDto(tx: Tx, idUsuario: number, idConjuntoActivo: number, ultimaActividad: Date): Promise<SesionPublica | null> {
  const u = await tx
    .request()
    .input('u', sql.Int, idUsuario)
    .query<{ nombre: string; correo: string }>('SELECT nombre, correo FROM dbo.USUARIOS WHERE idUsuario = @u AND activo = 1');
  const usuario = u.recordset[0];
  if (!usuario) return null;

  const m = await tx
    .request()
    .input('u', sql.Int, idUsuario)
    .query<FilaConjunto & { rol: Rol }>(
      `SELECT c.idConjunto, c.slug, c.nombre, c.logoUrl, c.colorPrimario, c.colorAcento, c.colorSecundario, m.rol
         FROM dbo.USUARIO_CONJUNTOS m
         JOIN dbo.CONJUNTOS c ON c.idConjunto = m.idConjunto
        WHERE m.idUsuario = @u AND m.activo = 1 AND c.activo = 1
        ORDER BY c.nombre, c.idConjunto`,
    );
  const activo = m.recordset.find((f) => f.idConjunto === idConjuntoActivo);
  if (!activo) return null;

  return {
    usuario: { id: String(idUsuario), nombre: usuario.nombre, correo: usuario.correo, rol: activo.rol },
    conjuntoActivo: aPublico(activo),
    conjuntos: m.recordset.map(aPublico),
    ultimaActividad: ultimaActividad.getTime(),
  };
}

/** Un reloj atrasado respecto a creadaEn no puede violar CK_Sesiones_revocada: se acota a creadaEn. */
const REVOCADA_EN = 'revocadaEn = CASE WHEN @ahora < creadaEn THEN creadaEn ELSE @ahora END';

async function revocar(tx: Tx, idSesion: string, ahora: Date): Promise<void> {
  await tx
    .request()
    .input('id', sql.BigInt, idSesion)
    .input('ahora', sql.DateTime2, ahora)
    .query(`UPDATE dbo.SESIONES SET ${REVOCADA_EN} WHERE idSesion = @id AND revocadaEn IS NULL`);
}

/**
 * Bloquea (UPDLOCK) y valida la sesión del token: vencida por inactividad → la revoca y SESION_INACTIVA;
 * usuario o membresía en el conjunto activo desactivados → la revoca y NO_AUTENTICADO. Si sigue viva,
 * renueva `ultimaActividad` cuando pasó al menos RENOVACION_MIN_MS.
 */
async function abrir(tx: Tx, hash: Buffer, ahora: Date): Promise<Resultado<SesionActiva>> {
  const r = await tx
    .request()
    .input('hash', sql.VarBinary(32), hash)
    .query<FilaSesion>(
      `SELECT idSesion, idUsuario, idConjuntoActivo, ultimaActividad
         FROM dbo.SESIONES WITH (UPDLOCK, ROWLOCK)
        WHERE tokenHash = @hash AND revocadaEn IS NULL`,
    );
  const s = r.recordset[0];
  if (!s) return fallo(noAutenticado());

  const transcurrido = ahora.getTime() - s.ultimaActividad.getTime();
  if (transcurrido > LIMITE_INACTIVIDAD_MS) {
    await revocar(tx, s.idSesion, ahora);
    return fallo(new ErrorAcceso(401, 'SESION_INACTIVA'));
  }

  let ultimaActividad = s.ultimaActividad;
  if (transcurrido >= RENOVACION_MIN_MS) {
    ultimaActividad = ahora;
    await tx
      .request()
      .input('id', sql.BigInt, s.idSesion)
      .input('ahora', sql.DateTime2, ahora)
      .query('UPDATE dbo.SESIONES SET ultimaActividad = @ahora WHERE idSesion = @id');
  }

  const dto = await cargarDto(tx, s.idUsuario, s.idConjuntoActivo, ultimaActividad);
  if (!dto) {
    await revocar(tx, s.idSesion, ahora);
    return fallo(noAutenticado());
  }
  return { ok: true, valor: { ...dto, idSesion: Number(s.idSesion), idUsuario: s.idUsuario, idConjuntoActivo: s.idConjuntoActivo } };
}

/** Solo los campos públicos (sin los ids internos). */
const aPublica = ({ usuario, conjuntoActivo, conjuntos, ultimaActividad }: SesionActiva): SesionPublica => ({
  usuario,
  conjuntoActivo,
  conjuntos,
  ultimaActividad,
});

/**
 * Abre una sesión para un usuario activo con membresía activa en el conjunto (si no, 403 SIN_MEMBRESIA).
 * El token solo se devuelve aquí; en la BD queda su SHA-256.
 */
export async function crearSesion(
  pool: sql.ConnectionPool,
  { idUsuario, idConjunto }: { idUsuario: number; idConjunto: number },
  ahora: Date = new Date(),
): Promise<{ token: string; sesion: SesionPublica }> {
  const token = randomBytes(32).toString('base64url');
  const sesion = await withTx(pool, async (tx) => {
    const dto = await cargarDto(tx, idUsuario, idConjunto, ahora);
    if (!dto) throw new ErrorAcceso(403, 'SIN_MEMBRESIA');
    await tx
      .request()
      .input('hash', sql.VarBinary(32), hashToken(token))
      .input('u', sql.Int, idUsuario)
      .input('c', sql.Int, idConjunto)
      .input('ahora', sql.DateTime2, ahora)
      .query(
        `INSERT INTO dbo.SESIONES (tokenHash, idUsuario, idConjuntoActivo, creadaEn, ultimaActividad)
         VALUES (@hash, @u, @c, @ahora, @ahora)`,
      );
    return dto;
  });
  return { token, sesion };
}

/** Valida el token y devuelve la sesión (renovando la actividad). 401 NO_AUTENTICADO o SESION_INACTIVA si no. */
export async function leerSesion(pool: sql.ConnectionPool, token: string | undefined, ahora: Date = new Date()): Promise<SesionActiva> {
  if (!token || !FORMA_TOKEN.test(token)) throw noAutenticado();
  const hash = hashToken(token);
  const r = await withTx(pool, (tx) => abrir(tx, hash, ahora));
  if (!r.ok) throw r.error;
  return r.valor;
}

/** Cambia el conjunto activo a otro con membresía activa (si no, 403 SIN_MEMBRESIA). Devuelve el DTO con el rol de ese conjunto. */
export async function cambiarConjuntoActivo(
  pool: sql.ConnectionPool,
  token: string | undefined,
  conjuntoId: string,
  ahora: Date = new Date(),
): Promise<SesionPublica> {
  const { conjuntoId: idConjunto } = validar(CambioSchema, { conjuntoId });
  if (!token || !FORMA_TOKEN.test(token)) throw noAutenticado();
  const hash = hashToken(token);

  const r = await withTx(pool, async (tx): Promise<Resultado<SesionPublica>> => {
    const abierta = await abrir(tx, hash, ahora);
    if (!abierta.ok) return abierta;
    const s = abierta.valor;
    if (idConjunto === s.idConjuntoActivo) return { ok: true, valor: aPublica(s) };

    const dto = await cargarDto(tx, s.idUsuario, idConjunto, new Date(s.ultimaActividad));
    if (!dto) return fallo(new ErrorAcceso(403, 'SIN_MEMBRESIA'));
    await tx
      .request()
      .input('id', sql.BigInt, String(s.idSesion))
      .input('c', sql.Int, idConjunto)
      .query('UPDATE dbo.SESIONES SET idConjuntoActivo = @c WHERE idSesion = @id');
    return { ok: true, valor: dto };
  });
  if (!r.ok) throw r.error;
  return r.valor;
}

/** Cierra la sesión marcando `revocadaEn` (sin DELETE). Nunca lanza por un token ausente, mal formado o desconocido. */
export async function revocarSesion(pool: sql.ConnectionPool, token: string | undefined, ahora: Date = new Date()): Promise<void> {
  if (!token || !FORMA_TOKEN.test(token)) return;
  const hash = hashToken(token);
  await withTx(pool, async (tx) => {
    await tx
      .request()
      .input('hash', sql.VarBinary(32), hash)
      .input('ahora', sql.DateTime2, ahora)
      .query(`UPDATE dbo.SESIONES SET ${REVOCADA_EN} WHERE tokenHash = @hash AND revocadaEn IS NULL`);
  });
}
