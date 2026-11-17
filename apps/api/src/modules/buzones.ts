import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import sql from 'mssql';
import { z } from 'zod';
import { sqlErrorNumber, withTx, type Tx } from '../db/withTx.js';
import { ConflictError, Forbidden, NotFound, ValidationError } from '../errors.js';
import { estadoGateway } from './consultas.js';
import { validar, type Actor, type Rol } from './solicitudes.js';

/**
 * Buzón IMAP de cada conjunto (BUZONES_CONJUNTO, 0008). La contraseña de aplicación se guarda cifrada
 * con AES-256-GCM y una clave derivada de AUTH_SECRETO. La conexión IMAP llega INYECTADA (`DepsBuzon`):
 * esta capa no importa el gateway ni imapflow; la raíz de composición (`server.ts`) los cablea.
 * Ninguna transacción queda abierta durante E/S de red: la prueba IMAP y la sincronización van fuera.
 */

/* ---------- Cifrado ---------- */

const ALGORITMO = 'aes-256-gcm';
const INFO_HKDF = 'mailflow-buzon-imap-v1';
const LARGO_IV = 12;
const LARGO_TAG = 16;

/** La contraseña guardada no se pudo descifrar (otro AUTH_SECRETO, blob manipulado o truncado). */
export class ErrorDescifrado extends Error {
  override name = 'ErrorDescifrado';
  constructor() {
    super('No se pudo descifrar la contraseña del buzón');
  }
}

function claveDe(secreto: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secreto, Buffer.alloc(0), INFO_HKDF, 32));
}

/** Formato almacenado: IV (12) || AuthTag (16) || texto cifrado. IV aleatorio en cada llamada. */
export function cifrarContrasena(secreto: string, claro: string): Buffer {
  const iv = randomBytes(LARGO_IV);
  const cifrador = createCipheriv(ALGORITMO, claveDe(secreto), iv);
  const texto = Buffer.concat([cifrador.update(claro, 'utf8'), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), texto]);
}

export function descifrarContrasena(secreto: string, cifrado: Buffer): string {
  if (cifrado.length <= LARGO_IV + LARGO_TAG) throw new ErrorDescifrado();
  try {
    const iv = cifrado.subarray(0, LARGO_IV);
    const tag = cifrado.subarray(LARGO_IV, LARGO_IV + LARGO_TAG);
    const descifrador = createDecipheriv(ALGORITMO, claveDe(secreto), iv);
    descifrador.setAuthTag(tag);
    return Buffer.concat([descifrador.update(cifrado.subarray(LARGO_IV + LARGO_TAG)), descifrador.final()]).toString('utf8');
  } catch {
    throw new ErrorDescifrado();
  }
}

/* ---------- Tipos y dependencias inyectadas ---------- */

export interface ConexionBuzon {
  host: string;
  port: number;
  usuario: string;
  contrasena: string;
  buzon: string;
}

/**
 * Código corto de `BUZONES_CONJUNTO.ultimoError`. `CLAVE`: la contraseña guardada no se pudo descifrar.
 * `INTERNO`: el ciclo falló por algo que no es la conexión con el buzón (un correo que no se pudo
 * guardar, la BD caída...).
 */
export type CodigoErrorBuzon = 'AUTENTICACION' | 'CERTIFICADO' | 'CONEXION' | 'CLAVE' | 'INTERNO';

/** Fallo al hablar con el servidor IMAP, ya clasificado. Nunca lleva la dirección ni la contraseña. */
export class ErrorConexionBuzon extends Error {
  override name = 'ErrorConexionBuzon';
  constructor(readonly codigo: Exclude<CodigoErrorBuzon, 'CLAVE' | 'INTERNO'>) {
    super(`Fallo de conexión con el buzón (${codigo})`);
  }
}

export interface BuzonActivo extends ConexionBuzon {
  idConjunto: number;
  diasIniciales: number;
  marcarLeido: boolean;
}

export interface ResultadoSincronizacionBuzon {
  revisados: number;
  nuevos: number;
  duplicados: number;
  respaldos: number;
  pendientes: boolean;
}

export interface DepsBuzon {
  secreto: string;
  /** Servidores IMAP admitidos al conectar (en minúsculas; ver `hostsImapPermitidosFromEnv`). */
  hostsPermitidos: ReadonlySet<string>;
  /** Abre y cierra una sesión IMAP de prueba. Lanza ErrorConexionBuzon si falla. */
  probarConexion(c: ConexionBuzon): Promise<void>;
  /** Un ciclo de sincronización del buzón. Lanza ErrorConexionBuzon ante fallos de conexión. */
  ejecutarSincronizacion(pool: sql.ConnectionPool, b: BuzonActivo): Promise<ResultadoSincronizacionBuzon>;
}

/** Mensaje para el administrador según el código (también lo usa el gateway en su log). */
export const MENSAJES_ERROR_BUZON: Record<CodigoErrorBuzon, string> = {
  AUTENTICACION:
    'El servidor de correo rechazó el inicio de sesión. Revise el correo y use una «contraseña de aplicación» ' +
    '(https://myaccount.google.com/apppasswords), no la contraseña normal de la cuenta.',
  CERTIFICADO:
    'No se pudo verificar el certificado del servidor de correo: algo intercepta la conexión cifrada ' +
    '(un antivirus con análisis de correo o un proxy).',
  CONEXION: 'No se pudo conectar con el servidor de correo. Revise el servidor, el puerto y la carpeta.',
  INTERNO: 'La sincronización del buzón falló por un error interno; se reintentará en el siguiente ciclo.',
  CLAVE: 'La contraseña guardada del buzón ya no se puede leer (¿cambió AUTH_SECRETO?). Vuelva a conectar el buzón.',
};

/**
 * Clave del checkpoint T6 (GATEWAY_CHECKPOINT.cuenta). Incluye el conjunto: TR_Checkpoint_conjunto_fijo
 * ata cada fila a un conjunto para siempre y una cuenta desconectada de un conjunto puede reconectarse
 * en otro. Los UID son por carpeta, así que también incluye la carpeta.
 */
export function cuentaCheckpoint(idConjunto: number, usuario: string, buzon: string): string {
  return `${idConjunto}:${usuario}/${buzon}`;
}

const LARGO_MAX_CUENTA = 255;
const PUERTO_IMAPS = 993;

/* ---------- Autorización ---------- */

/** Rol vigente del actor en su conjunto, leído de la BD dentro de la transacción (manda USUARIO_CONJUNTOS.rol). */
async function exigirRol(tx: Tx, actor: Actor, roles: readonly Rol[], accion: string): Promise<void> {
  const r = await tx
    .request()
    .input('u', sql.Int, actor.idUsuario)
    .input('c', sql.Int, actor.idConjunto)
    .query<{ rol: Rol }>(
      `SELECT m.rol
         FROM USUARIO_CONJUNTOS m
         JOIN USUARIOS u ON u.idUsuario = m.idUsuario
        WHERE m.idUsuario = @u AND m.idConjunto = @c AND m.activo = 1 AND u.activo = 1`,
    );
  const fila = r.recordset[0];
  if (!fila || !roles.includes(fila.rol)) throw new Forbidden(`No tienes permiso para ${accion}`);
}

const ActorSchema = z.object({
  idUsuario: z.number().int().positive(),
  idConjunto: z.number().int().positive(),
});

async function registrarAuditoria(tx: Tx, actor: Actor, accion: 'CONECTAR' | 'DESCONECTAR', detalle: string): Promise<void> {
  await tx
    .request()
    .input('c', sql.Int, actor.idConjunto)
    .input('u', sql.Int, actor.idUsuario)
    .input('accion', sql.VarChar(30), accion)
    .input('detalle', sql.NVarChar(400), detalle)
    .query(
      `INSERT INTO AUDITORIA_ADMIN (idConjunto, idUsuario, entidad, idEntidad, accion, detalle)
       VALUES (@c, @u, 'BUZON', @c, @accion, @detalle)`,
    );
}

/* ---------- Escritura administrativa ---------- */

export const EntradaBuzonSchema = z.object({
  correo: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  // Google muestra la contraseña de aplicación en grupos ("abcd efgh ijkl mnop"): se quitan los espacios.
  // Tope de 120 caracteres: aun en UTF-8 de 4 bytes cabe en VARBINARY(512) junto con IV y tag.
  contrasena: z
    .string()
    .transform((s) => s.replace(/\s+/g, ''))
    .pipe(z.string().min(1, 'no puede estar vacía').max(120)),
  imapHost: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9.-]+$/, 'debe ser un nombre de servidor')
    .default('imap.gmail.com'),
  imapPort: z.number().int().min(1).max(65535).default(993),
  buzon: z.string().trim().min(1).max(200).default('INBOX'),
  diasIniciales: z.number().int().min(0).max(365).default(7),
  marcarLeido: z.boolean().default(false),
  versionEsperada: z.number().int().positive().optional(),
});
export type EntradaBuzon = z.input<typeof EntradaBuzonSchema>;

export type EstadoGateway = Awaited<ReturnType<typeof estadoGateway>>;

const esViolacionUnica = (err: unknown) => {
  const n = sqlErrorNumber(err);
  return n === 2601 || n === 2627;
};

/**
 * Conecta (o reconecta) el buzón del conjunto del actor. Solo ADMIN con membresía activa. Primero prueba
 * la conexión IMAP fuera de toda transacción; si falla, 422 y no se guarda nada. Después, en una
 * transacción con UPDLOCK/HOLDLOCK, inserta o actualiza la fila (409 ante `versionEsperada` vieja o si la
 * cuenta/carpeta ya está activa en otro conjunto) y deja auditoría sin dirección ni contraseña.
 */
export async function guardarBuzon(
  pool: sql.ConnectionPool,
  deps: DepsBuzon,
  actor: Actor,
  entrada: EntradaBuzon,
): Promise<EstadoGateway> {
  const a = validar(ActorSchema, actor);
  const e = validar(EntradaBuzonSchema, entrada);
  if (cuentaCheckpoint(a.idConjunto, e.correo, e.buzon).length > LARGO_MAX_CUENTA) {
    throw new ValidationError(`Datos inválidos — el correo y la carpeta juntos superan ${LARGO_MAX_CUENTA} caracteres`);
  }
  // Solo servidores de la lista y el puerto IMAPS: sin esto, la prueba de conexión serviría para abrir
  // conexiones desde el servidor hacia hosts y puertos internos.
  if (!deps.hostsPermitidos.has(e.imapHost)) {
    throw new ValidationError('Datos inválidos — imapHost: ese servidor de correo no está permitido');
  }
  if (e.imapPort !== PUERTO_IMAPS) throw new ValidationError(`Datos inválidos — imapPort: debe ser ${PUERTO_IMAPS}`);
  // Antes de abrir una conexión de red a un servidor elegido por el usuario, se exige el rol (se
  // vuelve a comprobar en la transacción de escritura: la membresía puede cambiar entre ambas).
  await withTx(pool, (tx) => exigirRol(tx, actor, ['ADMIN'], 'conectar el buzón del conjunto'));

  try {
    await deps.probarConexion({ host: e.imapHost, port: e.imapPort, usuario: e.correo, contrasena: e.contrasena, buzon: e.buzon });
  } catch (err) {
    if (err instanceof ErrorConexionBuzon) throw new ValidationError(MENSAJES_ERROR_BUZON[err.codigo]);
    throw err;
  }
  const cifrada = cifrarContrasena(deps.secreto, e.contrasena);

  try {
    await withTx(pool, async (tx) => {
      await exigirRol(tx, actor, ['ADMIN'], 'conectar el buzón del conjunto');
      const actual = (
        await tx
          .request()
          .input('c', sql.Int, a.idConjunto)
          .query<{ version: number; activo: boolean }>(
            'SELECT version, activo FROM BUZONES_CONJUNTO WITH (UPDLOCK, HOLDLOCK) WHERE idConjunto = @c',
          )
      ).recordset[0];
      if (actual && e.versionEsperada !== undefined && actual.version !== e.versionEsperada) {
        throw new ConflictError(
          `El buzón cambió (versión ${actual.version}, se esperaba ${e.versionEsperada}). Recárguelo.`,
        );
      }
      const req = tx
        .request()
        .input('c', sql.Int, a.idConjunto)
        .input('host', sql.VarChar(120), e.imapHost)
        .input('port', sql.Int, e.imapPort)
        .input('correo', sql.NVarChar(320), e.correo)
        .input('cifrada', sql.VarBinary(512), cifrada)
        .input('buzon', sql.NVarChar(200), e.buzon)
        .input('dias', sql.Int, e.diasIniciales)
        .input('leido', sql.Bit, e.marcarLeido);
      if (!actual) {
        await req.query(
          `INSERT INTO BUZONES_CONJUNTO (idConjunto, imapHost, imapPort, correo, contrasenaCifrada, buzon, diasIniciales, marcarLeido)
           VALUES (@c, @host, @port, @correo, @cifrada, @buzon, @dias, @leido)`,
        );
      } else {
        await req.query(
          `UPDATE BUZONES_CONJUNTO
              SET imapHost = @host, imapPort = @port, correo = @correo, contrasenaCifrada = @cifrada, buzon = @buzon,
                  diasIniciales = @dias, marcarLeido = @leido, activo = 1, ultimoError = NULL,
                  version = version + 1, actualizadoEn = SYSUTCDATETIME()
            WHERE idConjunto = @c`,
        );
      }
      await registrarAuditoria(
        tx,
        actor,
        'CONECTAR',
        `${actual ? 'Buzón reconectado' : 'Buzón conectado'}: servidor ${e.imapHost}:${e.imapPort}, ` +
          `días iniciales ${e.diasIniciales}, marcar leído ${e.marcarLeido ? 'sí' : 'no'}`,
      );
    });
  } catch (err) {
    // UX_Buzones_cuenta_activa: la misma cuenta/carpeta ya está activa en otro conjunto.
    if (esViolacionUnica(err)) throw new ConflictError('Esa cuenta ya está conectada en otro conjunto');
    throw err;
  }
  return estadoGateway(pool, a.idConjunto);
}

const DesconexionSchema = z.object({ versionEsperada: z.number().int().positive().optional() });

/**
 * Desactiva el buzón del conjunto del actor (sin DELETE: la fila conserva la configuración para
 * reconectar). Solo ADMIN. Idempotente: si ya estaba inactivo no cambia nada ni audita otra vez.
 */
export async function desconectarBuzon(
  pool: sql.ConnectionPool,
  actor: Actor,
  entrada: { versionEsperada?: number } = {},
): Promise<EstadoGateway> {
  const a = validar(ActorSchema, actor);
  const e = validar(DesconexionSchema, entrada);
  await withTx(pool, async (tx) => {
    await exigirRol(tx, actor, ['ADMIN'], 'desconectar el buzón del conjunto');
    const actual = (
      await tx
        .request()
        .input('c', sql.Int, a.idConjunto)
        .query<{ version: number; activo: boolean }>(
          'SELECT version, activo FROM BUZONES_CONJUNTO WITH (UPDLOCK, HOLDLOCK) WHERE idConjunto = @c',
        )
    ).recordset[0];
    if (!actual) throw new NotFound('El conjunto no tiene un buzón conectado');
    if (!actual.activo) return;
    if (e.versionEsperada !== undefined && actual.version !== e.versionEsperada) {
      throw new ConflictError(`El buzón cambió (versión ${actual.version}, se esperaba ${e.versionEsperada}). Recárguelo.`);
    }
    await tx
      .request()
      .input('c', sql.Int, a.idConjunto)
      .query(
        `UPDATE BUZONES_CONJUNTO
            SET activo = 0, version = version + 1, actualizadoEn = SYSUTCDATETIME()
          WHERE idConjunto = @c`,
      );
    await registrarAuditoria(tx, actor, 'DESCONECTAR', 'Buzón desconectado');
  });
  return estadoGateway(pool, a.idConjunto);
}

/* ---------- Lectura para el gateway y telemetría ---------- */

interface FilaBuzonActivo {
  idConjunto: number;
  host: string;
  port: number;
  usuario: string;
  cifrada: Buffer;
  buzon: string;
  diasIniciales: number;
  marcarLeido: boolean;
}

const BUZONES_ACTIVOS = `
  SELECT b.idConjunto, b.imapHost AS host, b.imapPort AS port, b.correo AS usuario, b.contrasenaCifrada AS cifrada,
         b.buzon, b.diasIniciales, b.marcarLeido
    FROM BUZONES_CONJUNTO b
    JOIN CONJUNTOS k ON k.idConjunto = b.idConjunto
   WHERE b.activo = 1 AND k.activo = 1`;

const aBuzonActivo = (f: FilaBuzonActivo, contrasena: string): BuzonActivo => ({
  idConjunto: f.idConjunto,
  host: f.host,
  port: f.port,
  usuario: f.usuario,
  contrasena,
  buzon: f.buzon,
  diasIniciales: f.diasIniciales,
  marcarLeido: f.marcarLeido,
});

/**
 * Buzones activos de conjuntos activos, con la contraseña descifrada (solo en memoria del proceso).
 * Una fila indescifrable (p. ej. tras rotar AUTH_SECRETO) queda con `ultimoError = 'CLAVE'` y se omite;
 * las demás siguen.
 */
export async function listarBuzonesActivos(pool: sql.ConnectionPool, secreto: string): Promise<BuzonActivo[]> {
  const filas = await withTx(
    pool,
    async (tx) => (await tx.request().query<FilaBuzonActivo>(`${BUZONES_ACTIVOS} ORDER BY b.idConjunto`)).recordset,
    { isolation: 'SNAPSHOT' },
  );
  const activos: BuzonActivo[] = [];
  for (const f of filas) {
    try {
      activos.push(aBuzonActivo(f, descifrarContrasena(secreto, f.cifrada)));
    } catch (err) {
      if (!(err instanceof ErrorDescifrado)) throw err;
      await marcarError(pool, f.idConjunto, 'CLAVE');
    }
  }
  return activos;
}

/** Anota solo el código de error (telemetría, sin tocar `version` ni `ultimaSincronizacion`). */
async function marcarError(pool: sql.ConnectionPool, idConjunto: number, codigo: CodigoErrorBuzon): Promise<void> {
  await withTx(pool, async (tx) => {
    await tx
      .request()
      .input('c', sql.Int, idConjunto)
      .input('e', sql.VarChar(40), codigo)
      .query('UPDATE BUZONES_CONJUNTO SET ultimoError = @e WHERE idConjunto = @c');
  });
}

const IdConjuntoSchema = z.number().int().positive();
const CodigoSchema = z.enum(['AUTENTICACION', 'CERTIFICADO', 'CONEXION', 'CLAVE', 'INTERNO']).nullable();

/**
 * Resultado de un ciclo de sincronización: fecha y código de error (null = sin error). Es telemetría del
 * sistema, no una edición del administrador: NO sube `version` ni audita. Si subiera la versión, cada
 * ciclo del gateway (cada 45 s) invalidaría la vista del administrador y su siguiente escritura daría 409.
 *
 * Carrera aceptada: si el ADMIN reconecta mientras un ciclo en curso aún usa la contraseña vieja, ese
 * ciclo puede escribir aquí `AUTENTICACION` después de la reconexión. El siguiente ciclo (ya con la
 * contraseña nueva) lo corrige; condicionar este UPDATE a la versión leída no compensa su costo.
 */
export async function registrarResultadoSincronizacion(
  pool: sql.ConnectionPool,
  idConjunto: number,
  error: CodigoErrorBuzon | null,
): Promise<void> {
  const c = validar(IdConjuntoSchema, idConjunto);
  const codigo = validar(CodigoSchema, error);
  await withTx(pool, async (tx) => {
    await tx
      .request()
      .input('c', sql.Int, c)
      .input('e', sql.VarChar(40), codigo)
      .query('UPDATE BUZONES_CONJUNTO SET ultimaSincronizacion = SYSUTCDATETIME(), ultimoError = @e WHERE idConjunto = @c');
  });
}

/* ---------- Sincronización manual ---------- */

/**
 * Candado en memoria por conjunto: evita dos sincronizaciones manuales simultáneas del mismo buzón en
 * ESTE proceso. No coordina con el gateway (otro proceso); si ambos leen a la vez, la idempotencia de
 * T1 (Message-ID) y del checkpoint T6 absorbe la repetición.
 */
const enCurso = new Set<number>();

/**
 * Sincroniza ahora el buzón del conjunto del actor (ADMIN o SOPORTE con membresía activa). 409 si ya hay
 * una en curso del mismo conjunto, 422 si no hay buzón activo o si falla la conexión. El resultado (o el
 * código de error) queda registrado como telemetría.
 */
export async function sincronizarConjunto(
  pool: sql.ConnectionPool,
  deps: DepsBuzon,
  actor: Actor,
): Promise<ResultadoSincronizacionBuzon> {
  const a = validar(ActorSchema, actor);
  const fila = await withTx(pool, async (tx) => {
    await exigirRol(tx, actor, ['ADMIN', 'SOPORTE'], 'sincronizar el buzón del conjunto');
    return (
      await tx.request().input('c', sql.Int, a.idConjunto).query<FilaBuzonActivo>(`${BUZONES_ACTIVOS} AND b.idConjunto = @c`)
    ).recordset[0];
  });
  if (!fila) throw new ValidationError('El conjunto no tiene un buzón conectado');

  // Comprobar y tomar el candado sin `await` de por medio: es atómico en el bucle de eventos.
  if (enCurso.has(a.idConjunto)) throw new ConflictError('Ya hay una sincronización en curso para este conjunto');
  enCurso.add(a.idConjunto);
  try {
    let contrasena: string;
    try {
      contrasena = descifrarContrasena(deps.secreto, fila.cifrada);
    } catch (err) {
      if (!(err instanceof ErrorDescifrado)) throw err;
      await marcarError(pool, a.idConjunto, 'CLAVE');
      throw new ValidationError(MENSAJES_ERROR_BUZON.CLAVE);
    }
    let r: ResultadoSincronizacionBuzon;
    try {
      r = await deps.ejecutarSincronizacion(pool, aBuzonActivo(fila, contrasena));
    } catch (err) {
      if (!(err instanceof ErrorConexionBuzon)) {
        // No es del buzón: queda INTERNO y el error sigue como 500 (el manejador solo registra tipo y
        // código). Si la BD tampoco deja anotarlo, prevalece el error original.
        await registrarResultadoSincronizacion(pool, a.idConjunto, 'INTERNO').catch(() => {});
        throw err;
      }
      await registrarResultadoSincronizacion(pool, a.idConjunto, err.codigo);
      throw new ValidationError(MENSAJES_ERROR_BUZON[err.codigo]);
    }
    await registrarResultadoSincronizacion(pool, a.idConjunto, null);
    return { revisados: r.revisados, nuevos: r.nuevos, duplicados: r.duplicados, respaldos: r.respaldos, pendientes: r.pendientes };
  } finally {
    enCurso.delete(a.idConjunto);
  }
}
