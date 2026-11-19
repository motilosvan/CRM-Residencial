import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearUsuario, idConjuntoInicial, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ConflictError, Forbidden, NotFound, ValidationError } from '../errors.js';
import {
  cifrarContrasena,
  cuentaCheckpoint,
  descifrarContrasena,
  desconectarBuzon,
  ErrorConexionBuzon,
  ErrorDescifrado,
  guardarBuzon,
  listarBuzonesActivos,
  registrarResultadoSincronizacion,
  sincronizarConjunto,
  type BuzonActivo,
  type ConexionBuzon,
  type DepsBuzon,
  type ResultadoSincronizacionBuzon,
} from './buzones.js';
import { estadoGateway } from './consultas.js';
import type { Actor } from './solicitudes.js';

const SECRETO = 'secreto-de-pruebas-con-más-de-32-caracteres';
const OTRO_SECRETO = 'otro-secreto-distinto-con-más-de-32-caracteres';
const CLAVE = 'abcd efgh ijkl mnop';
const CLAVE_LIMPIA = 'abcdefghijklmnop';
const VACIO: ResultadoSincronizacionBuzon = { revisados: 0, nuevos: 0, duplicados: 0, respaldos: 0, pendientes: false };

let db: TestDb;
let n = 0;

interface Conjunto {
  id: number;
  admin: Actor;
  soporte: Actor;
}

/** Conjunto nuevo con un ADMIN y un SOPORTE activos: cada prueba trabaja sobre el suyo. */
async function nuevoConjunto(): Promise<Conjunto> {
  const slug = `buz-${++n}`;
  const id = (
    await db.pool
      .request()
      .input('slug', sql.VarChar(80), slug)
      .input('nombre', sql.NVarChar(120), `Conjunto ${n}`)
      .query<{ id: number }>('INSERT INTO dbo.CONJUNTOS (slug, nombre) OUTPUT inserted.idConjunto AS id VALUES (@slug, @nombre)')
  ).recordset[0]!.id;
  const idAdmin = await crearUsuario(db, { nombre: `Admin ${n}`, correo: `admin-${n}@demo.mailflow.test`, rol: 'ADMIN', slug });
  const idSoporte = await crearUsuario(db, { nombre: `Soporte ${n}`, correo: `soporte-${n}@demo.mailflow.test`, rol: 'SOPORTE', slug });
  return {
    id,
    admin: { idUsuario: idAdmin, rol: 'ADMIN', idConjunto: id },
    soporte: { idUsuario: idSoporte, rol: 'SOPORTE', idConjunto: id },
  };
}

/** Dependencias IMAP falsas: registran las conexiones probadas y sincronizan sin red. */
function depsFalsas(extra: Partial<DepsBuzon> = {}) {
  const probadas: ConexionBuzon[] = [];
  const sincronizados: BuzonActivo[] = [];
  const deps: DepsBuzon = {
    secreto: SECRETO,
    hostsPermitidos: new Set(['imap.gmail.com', 'imap.demo.mailflow.test']),
    probarConexion: async (c) => {
      probadas.push(c);
    },
    ejecutarSincronizacion: async (_pool, b) => {
      sincronizados.push(b);
      return VACIO;
    },
    ...extra,
  };
  return { deps, probadas, sincronizados };
}

const correoDe = (c: Conjunto) => `buzon-${c.id}@demo.mailflow.test`;

interface FilaBuzon {
  correo: string;
  contrasenaCifrada: Buffer;
  activo: boolean;
  version: number;
  ultimoError: string | null;
  ultimaSincronizacion: Date | null;
  actualizadoEn: Date;
  imapHost: string;
  imapPort: number;
  buzon: string;
  diasIniciales: number;
  marcarLeido: boolean;
}

const filaBuzon = async (idConjunto: number) =>
  (
    await db.pool
      .request()
      .input('c', sql.Int, idConjunto)
      .query<FilaBuzon>('SELECT * FROM dbo.BUZONES_CONJUNTO WHERE idConjunto = @c')
  ).recordset[0];

const auditoria = async (idConjunto: number) =>
  (
    await db.pool
      .request()
      .input('c', sql.Int, idConjunto)
      .query<{ idUsuario: number | null; entidad: string; idEntidad: number; accion: string; detalle: string | null }>(
        'SELECT idUsuario, entidad, idEntidad, accion, detalle FROM dbo.AUDITORIA_ADMIN WHERE idConjunto = @c ORDER BY idAuditoria',
      )
  ).recordset;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_buzones');
});
afterAll(async () => db.close());

describe('Buzones · cifrado de la contraseña de aplicación', () => {
  it('ida y vuelta con el mismo secreto; formato IV (12) + tag (16) + texto', () => {
    const c = cifrarContrasena(SECRETO, CLAVE_LIMPIA);
    expect(c.length).toBe(12 + 16 + Buffer.byteLength(CLAVE_LIMPIA));
    expect(c.includes(Buffer.from(CLAVE_LIMPIA))).toBe(false);
    expect(descifrarContrasena(SECRETO, c)).toBe(CLAVE_LIMPIA);
    expect(descifrarContrasena(SECRETO, cifrarContrasena(SECRETO, 'clave con ñ y 🔑'))).toBe('clave con ñ y 🔑');
  });

  it('dos cifrados del mismo texto difieren (IV aleatorio)', () => {
    expect(cifrarContrasena(SECRETO, CLAVE_LIMPIA).equals(cifrarContrasena(SECRETO, CLAVE_LIMPIA))).toBe(false);
  });

  it('otro secreto, un byte cambiado o un blob truncado lanzan ErrorDescifrado', () => {
    const c = cifrarContrasena(SECRETO, CLAVE_LIMPIA);
    expect(() => descifrarContrasena(OTRO_SECRETO, c)).toThrow(ErrorDescifrado);
    for (const pos of [0, 13, c.length - 1]) {
      const m = Buffer.from(c);
      m[pos] = m[pos]! ^ 0x01;
      expect(() => descifrarContrasena(SECRETO, m)).toThrow(ErrorDescifrado);
    }
    expect(() => descifrarContrasena(SECRETO, c.subarray(0, 28))).toThrow(ErrorDescifrado);
    expect(() => descifrarContrasena(SECRETO, c.subarray(0, c.length - 1))).toThrow(ErrorDescifrado);
    expect(() => descifrarContrasena(SECRETO, Buffer.alloc(0))).toThrow(ErrorDescifrado);
  });

  it('el mensaje de ErrorDescifrado no incluye el secreto ni el contenido', () => {
    try {
      descifrarContrasena(OTRO_SECRETO, cifrarContrasena(SECRETO, CLAVE_LIMPIA));
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain(OTRO_SECRETO);
      expect((e as Error).message).not.toContain(CLAVE_LIMPIA);
    }
  });
});

describe('Buzones · cuentaCheckpoint', () => {
  it('incluye el conjunto, el usuario y la carpeta', () => {
    expect(cuentaCheckpoint(7, 'buzon@demo.mailflow.test', 'INBOX')).toBe('7:buzon@demo.mailflow.test/INBOX');
  });
});

describe('Buzones · guardarBuzon', () => {
  it('prueba la conexión, guarda la contraseña cifrada y sin espacios, el correo en minúsculas, y devuelve el estado', async () => {
    const c = await nuevoConjunto();
    const { deps, probadas } = depsFalsas();
    const estado = await guardarBuzon(db.pool, deps, c.admin, { correo: `  BUZON-${c.id}@Demo.MailFlow.Test `, contrasena: CLAVE });

    expect(probadas).toEqual([
      { host: 'imap.gmail.com', port: 993, usuario: correoDe(c), contrasena: CLAVE_LIMPIA, buzon: 'INBOX' },
    ]);
    const f = (await filaBuzon(c.id))!;
    expect(f).toMatchObject({
      correo: correoDe(c), imapHost: 'imap.gmail.com', imapPort: 993, buzon: 'INBOX', diasIniciales: 7,
      marcarLeido: false, activo: true, version: 1, ultimoError: null,
    });
    expect(f.contrasenaCifrada.includes(Buffer.from(CLAVE_LIMPIA))).toBe(false);
    expect(descifrarContrasena(SECRETO, f.contrasenaCifrada)).toBe(CLAVE_LIMPIA);

    expect(estado.conectado).toBe(true);
    expect(estado.buzon).toMatchObject({ correo: correoDe(c), activo: true, version: 1, ultimoError: null });
    const json = JSON.stringify(estado);
    expect(json).not.toContain('contrasena');
    expect(json).not.toContain(CLAVE_LIMPIA);
  });

  it('acepta un host permitido (sin distinguir mayúsculas), carpeta, días iniciales y marcar leído', async () => {
    const c = await nuevoConjunto();
    const { deps, probadas } = depsFalsas();
    await guardarBuzon(db.pool, deps, c.admin, {
      correo: correoDe(c), contrasena: 'x', imapHost: 'IMAP.Demo.MailFlow.test', imapPort: 993, buzon: 'Solicitudes',
      diasIniciales: 0, marcarLeido: true,
    });
    expect(probadas[0]).toMatchObject({ host: 'imap.demo.mailflow.test', port: 993, buzon: 'Solicitudes' });
    expect(await filaBuzon(c.id)).toMatchObject({
      imapHost: 'imap.demo.mailflow.test', imapPort: 993, buzon: 'Solicitudes', diasIniciales: 0, marcarLeido: true,
    });
  });

  it('422 para un host fuera de la lista o un puerto distinto de 993, sin llegar a probar la conexión', async () => {
    const c = await nuevoConjunto();
    const { deps, probadas } = depsFalsas();
    for (const extra of [
      { imapHost: 'localhost' },
      { imapHost: '10.0.0.5' },
      { imapHost: 'imap.gmail.com.evil.example' },
      { imapPort: 1993 },
      { imapPort: 143 },
      { imapHost: 'imap.demo.mailflow.test', imapPort: 22 },
    ]) {
      const err = await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE, ...extra }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
    }
    expect(probadas).toHaveLength(0);
    expect(await filaBuzon(c.id)).toBeUndefined();
  });

  it('valida la entrada (422) sin probar la conexión', async () => {
    const c = await nuevoConjunto();
    const { deps, probadas } = depsFalsas();
    const malas = [
      { correo: 'no-es-correo', contrasena: CLAVE },
      { correo: correoDe(c), contrasena: '   ' },
      { correo: correoDe(c) },
      { correo: correoDe(c), contrasena: CLAVE, diasIniciales: 366 },
      { correo: correoDe(c), contrasena: CLAVE, imapPort: 0 },
    ];
    for (const entrada of malas) {
      await expect(guardarBuzon(db.pool, deps, c.admin, entrada as never)).rejects.toBeInstanceOf(ValidationError);
    }
    // La clave del checkpoint (conjunto:correo/carpeta) superaría 255 caracteres: nunca se trunca.
    const larga = guardarBuzon(db.pool, deps, c.admin, {
      correo: `${'x'.repeat(60)}@demo.mailflow.test`, contrasena: CLAVE, buzon: 'C'.repeat(200),
    });
    await expect(larga).rejects.toBeInstanceOf(ValidationError);
    await expect(larga).rejects.toThrow(/255/);
    expect(probadas).toHaveLength(0);
    expect(await filaBuzon(c.id)).toBeUndefined();
  });

  it('si la prueba IMAP falla, 422 con mensaje en español y no se guarda nada', async () => {
    const c = await nuevoConjunto();
    const esperados = {
      AUTENTICACION: /contraseña de aplicación/,
      CERTIFICADO: /certificado/,
      CONEXION: /conectar/,
    } as const;
    for (const [codigo, mensaje] of Object.entries(esperados)) {
      const { deps } = depsFalsas({
        probarConexion: async () => {
          throw new ErrorConexionBuzon(codigo as keyof typeof esperados);
        },
      });
      const err = await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).toMatch(mensaje);
      expect((err as Error).message).not.toContain(correoDe(c));
    }
    expect(await filaBuzon(c.id)).toBeUndefined();
    expect(await auditoria(c.id)).toEqual([]);
  });

  it('Forbidden para SOPORTE y para un ADMIN de otro conjunto, sin probar la conexión', async () => {
    const c = await nuevoConjunto();
    const otro = await nuevoConjunto();
    const { deps, probadas } = depsFalsas();
    await expect(guardarBuzon(db.pool, deps, c.soporte, { correo: correoDe(c), contrasena: CLAVE })).rejects.toBeInstanceOf(Forbidden);
    const intruso: Actor = { ...otro.admin, idConjunto: c.id };
    await expect(guardarBuzon(db.pool, deps, intruso, { correo: correoDe(c), contrasena: CLAVE })).rejects.toBeInstanceOf(Forbidden);
    // Una sesión que dice ADMIN pero cuya membresía es SOPORTE tampoco pasa: manda la BD.
    await expect(
      guardarBuzon(db.pool, deps, { ...c.soporte, rol: 'ADMIN' }, { correo: correoDe(c), contrasena: CLAVE }),
    ).rejects.toBeInstanceOf(Forbidden);
    expect(probadas).toHaveLength(0);
    expect(await filaBuzon(c.id)).toBeUndefined();
  });

  it('409 si versionEsperada no coincide; reconectar con la versión vigente sube version', async () => {
    const c = await nuevoConjunto();
    const { deps } = depsFalsas();
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await expect(
      guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: 'nueva', versionEsperada: 9 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(descifrarContrasena(SECRETO, (await filaBuzon(c.id))!.contrasenaCifrada)).toBe(CLAVE_LIMPIA);

    const antes = (await filaBuzon(c.id))!.actualizadoEn;
    const e = await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: 'nueva', versionEsperada: 1 });
    expect(e.buzon).toMatchObject({ version: 2, activo: true });
    const f = (await filaBuzon(c.id))!;
    expect(descifrarContrasena(SECRETO, f.contrasenaCifrada)).toBe('nueva');
    expect(f.actualizadoEn.getTime()).toBeGreaterThanOrEqual(antes.getTime());
  });

  it('409 si la cuenta/carpeta ya está activa en otro conjunto; tras desconectarla allí, se puede conectar', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    const { deps } = depsFalsas();
    await guardarBuzon(db.pool, deps, a.admin, { correo: correoDe(a), contrasena: CLAVE });
    const err = await guardarBuzon(db.pool, deps, b.admin, { correo: correoDe(a), contrasena: CLAVE }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect((err as Error).message).toBe('Esa cuenta ya está conectada en otro conjunto');
    expect(await filaBuzon(b.id)).toBeUndefined();

    // Otra carpeta de la misma cuenta sí es otro buzón.
    await guardarBuzon(db.pool, deps, b.admin, { correo: correoDe(a), contrasena: CLAVE, buzon: 'Otra' });
    await desconectarBuzon(db.pool, a.admin);
    await guardarBuzon(db.pool, deps, b.admin, { correo: correoDe(a), contrasena: CLAVE, versionEsperada: 1 });
    expect(await filaBuzon(b.id)).toMatchObject({ buzon: 'INBOX', activo: true, version: 2 });
  });

  it('reconectar un buzón desconectado lo reactiva, limpia ultimoError y sube version', async () => {
    const c = await nuevoConjunto();
    const { deps } = depsFalsas();
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await registrarResultadoSincronizacion(db.pool, c.id, 'AUTENTICACION');
    await desconectarBuzon(db.pool, c.admin);
    const e = await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    expect(e.conectado).toBe(true);
    expect(await filaBuzon(c.id)).toMatchObject({ activo: true, version: 3, ultimoError: null });
  });

  it('deja auditoría CONECTAR/DESCONECTAR del actor sin la dirección ni la contraseña', async () => {
    const c = await nuevoConjunto();
    const { deps } = depsFalsas();
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await desconectarBuzon(db.pool, c.admin);
    const filas = await auditoria(c.id);
    expect(filas.map((f) => f.accion)).toEqual(['CONECTAR', 'CONECTAR', 'DESCONECTAR']);
    for (const f of filas) {
      expect(f).toMatchObject({ idUsuario: c.admin.idUsuario, entidad: 'BUZON', idEntidad: c.id });
      expect(f.detalle ?? '').not.toContain(correoDe(c));
      expect(f.detalle ?? '').not.toContain('@');
      expect(f.detalle ?? '').not.toContain(CLAVE_LIMPIA);
    }
  });
});

describe('Buzones · desconectarBuzon', () => {
  it('NotFound sin buzón; Forbidden para SOPORTE; desactiva sin borrar, es idempotente y respeta versionEsperada', async () => {
    const c = await nuevoConjunto();
    const { deps } = depsFalsas();
    await expect(desconectarBuzon(db.pool, c.admin)).rejects.toBeInstanceOf(NotFound);
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await expect(desconectarBuzon(db.pool, c.soporte)).rejects.toBeInstanceOf(Forbidden);
    await expect(desconectarBuzon(db.pool, c.admin, { versionEsperada: 5 })).rejects.toBeInstanceOf(ConflictError);

    const e = await desconectarBuzon(db.pool, c.admin, { versionEsperada: 1 });
    expect(e.conectado).toBe(false);
    expect(e.buzon).toMatchObject({ activo: false, version: 2 });
    await desconectarBuzon(db.pool, c.admin, { versionEsperada: 1 }); // ya inactivo: no cambia nada
    expect(await filaBuzon(c.id)).toMatchObject({ activo: false, version: 2 });
    expect((await auditoria(c.id)).filter((f) => f.accion === 'DESCONECTAR')).toHaveLength(1);
  });
});

describe('Buzones · listarBuzonesActivos y telemetría', () => {
  it('devuelve los activos de conjuntos activos con la contraseña descifrada; marca CLAVE y omite los indescifrables', async () => {
    const activo = await nuevoConjunto();
    const desconectado = await nuevoConjunto();
    const conjuntoInactivo = await nuevoConjunto();
    const otraClave = await nuevoConjunto();
    const { deps } = depsFalsas();
    await guardarBuzon(db.pool, deps, activo.admin, { correo: correoDe(activo), contrasena: CLAVE, diasIniciales: 3, marcarLeido: true });
    await guardarBuzon(db.pool, deps, desconectado.admin, { correo: correoDe(desconectado), contrasena: CLAVE });
    await desconectarBuzon(db.pool, desconectado.admin);
    await guardarBuzon(db.pool, deps, conjuntoInactivo.admin, { correo: correoDe(conjuntoInactivo), contrasena: CLAVE });
    await db.q(`UPDATE dbo.CONJUNTOS SET activo = 0 WHERE idConjunto = ${conjuntoInactivo.id}`);
    await guardarBuzon(db.pool, { ...deps, secreto: OTRO_SECRETO }, otraClave.admin, { correo: correoDe(otraClave), contrasena: CLAVE });

    const ids = [activo.id, desconectado.id, conjuntoInactivo.id, otraClave.id];
    const lista = (await listarBuzonesActivos(db.pool, SECRETO)).filter((b) => ids.includes(b.idConjunto));
    expect(lista).toEqual([
      {
        idConjunto: activo.id, host: 'imap.gmail.com', port: 993, usuario: correoDe(activo), contrasena: CLAVE_LIMPIA,
        buzon: 'INBOX', diasIniciales: 3, marcarLeido: true,
      },
    ]);
    const marcada = (await filaBuzon(otraClave.id))!;
    expect(marcada).toMatchObject({ ultimoError: 'CLAVE', version: 1, activo: true });
    expect((await filaBuzon(activo.id))!.ultimoError).toBeNull();
  });

  it('registrarResultadoSincronizacion escribe fecha y error sin subir version ni auditar', async () => {
    const c = await nuevoConjunto();
    const { deps } = depsFalsas();
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await registrarResultadoSincronizacion(db.pool, c.id, 'CONEXION');
    let f = (await filaBuzon(c.id))!;
    expect(f).toMatchObject({ ultimoError: 'CONEXION', version: 1 });
    expect(f.ultimaSincronizacion).toBeInstanceOf(Date);
    await registrarResultadoSincronizacion(db.pool, c.id, 'INTERNO');
    expect((await filaBuzon(c.id))!.ultimoError).toBe('INTERNO');
    await registrarResultadoSincronizacion(db.pool, c.id, null);
    f = (await filaBuzon(c.id))!;
    expect(f).toMatchObject({ ultimoError: null, version: 1 });
    expect(await auditoria(c.id)).toHaveLength(1); // solo el CONECTAR
  });
});

describe('Buzones · sincronizarConjunto', () => {
  it('422 sin buzón activo; Forbidden para un ADMIN de otro conjunto', async () => {
    const c = await nuevoConjunto();
    const otro = await nuevoConjunto();
    const { deps, sincronizados } = depsFalsas();
    await expect(sincronizarConjunto(db.pool, deps, c.admin)).rejects.toBeInstanceOf(ValidationError);
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await desconectarBuzon(db.pool, c.admin);
    await expect(sincronizarConjunto(db.pool, deps, c.soporte)).rejects.toBeInstanceOf(ValidationError);
    await expect(sincronizarConjunto(db.pool, deps, { ...otro.admin, idConjunto: c.id })).rejects.toBeInstanceOf(Forbidden);
    expect(sincronizados).toHaveLength(0);
  });

  it('SOPORTE sincroniza: recibe el buzón descifrado del conjunto y queda registrado el resultado', async () => {
    const c = await nuevoConjunto();
    const r = { revisados: 3, nuevos: 2, duplicados: 1, respaldos: 0, pendientes: true };
    const { deps, sincronizados } = depsFalsas({
      ejecutarSincronizacion: async (_p, b) => {
        sincronizados.push(b);
        return r;
      },
    });
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await registrarResultadoSincronizacion(db.pool, c.id, 'CONEXION');
    expect(await sincronizarConjunto(db.pool, deps, c.soporte)).toEqual(r);
    expect(sincronizados).toEqual([expect.objectContaining({ idConjunto: c.id, usuario: correoDe(c), contrasena: CLAVE_LIMPIA })]);
    const f = (await filaBuzon(c.id))!;
    expect(f.ultimoError).toBeNull();
    expect(f.ultimaSincronizacion).toBeInstanceOf(Date);
    expect(f.version).toBe(1);
  });

  it('un fallo de conexión ⇒ 422 con el mismo mensaje que al guardar, queda el código y se libera el candado', async () => {
    const c = await nuevoConjunto();
    let fallar = true;
    const { deps } = depsFalsas({
      ejecutarSincronizacion: async () => {
        if (fallar) throw new ErrorConexionBuzon('AUTENTICACION');
        return VACIO;
      },
    });
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    const err = await sincronizarConjunto(db.pool, deps, c.admin).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as Error).message).toMatch(/contraseña de aplicación/);
    expect((await filaBuzon(c.id))!.ultimoError).toBe('AUTENTICACION');

    fallar = false;
    expect(await sincronizarConjunto(db.pool, deps, c.admin)).toEqual(VACIO);
    expect((await filaBuzon(c.id))!.ultimoError).toBeNull();
  });

  it('un fallo que no es de conexión se propaga tal cual (500), queda INTERNO y se libera el candado', async () => {
    const c = await nuevoConjunto();
    let fallar = true;
    const interno = Object.assign(new Error('detalle con datos del correo'), { name: 'RequestError', number: 547 });
    const { deps } = depsFalsas({
      ejecutarSincronizacion: async () => {
        if (fallar) throw interno;
        return VACIO;
      },
    });
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    const err = await sincronizarConjunto(db.pool, deps, c.admin).catch((e: unknown) => e);
    expect(err).toBe(interno);
    expect((await filaBuzon(c.id))!.ultimoError).toBe('INTERNO');
    fallar = false;
    expect(await sincronizarConjunto(db.pool, deps, c.admin)).toEqual(VACIO);
    expect((await filaBuzon(c.id))!.ultimoError).toBeNull();
  });

  it('una contraseña indescifrable ⇒ 422, queda CLAVE y no se llama a la sincronización', async () => {
    const c = await nuevoConjunto();
    const { deps, sincronizados } = depsFalsas();
    await guardarBuzon(db.pool, { ...deps, secreto: OTRO_SECRETO }, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    await expect(sincronizarConjunto(db.pool, deps, c.admin)).rejects.toThrow(/Vuelva a conectar/);
    expect((await filaBuzon(c.id))!.ultimoError).toBe('CLAVE');
    expect(sincronizados).toHaveLength(0);
  });

  it('409 si ya hay una sincronización manual en curso del mismo conjunto; otro conjunto no se bloquea', async () => {
    const a = await nuevoConjunto();
    const b = await nuevoConjunto();
    let soltar!: () => void;
    const espera = new Promise<void>((r) => (soltar = r));
    let avisar!: () => void;
    const empezo = new Promise<void>((r) => (avisar = r));
    const { deps } = depsFalsas({
      ejecutarSincronizacion: async (_p, buzon) => {
        if (buzon.idConjunto === a.id) {
          avisar();
          await espera;
        }
        return VACIO;
      },
    });
    await guardarBuzon(db.pool, deps, a.admin, { correo: correoDe(a), contrasena: CLAVE });
    await guardarBuzon(db.pool, deps, b.admin, { correo: correoDe(b), contrasena: CLAVE });

    const primera = sincronizarConjunto(db.pool, deps, a.admin);
    await empezo;
    await expect(sincronizarConjunto(db.pool, deps, a.soporte)).rejects.toBeInstanceOf(ConflictError);
    expect(await sincronizarConjunto(db.pool, deps, b.admin)).toEqual(VACIO);
    soltar();
    expect(await primera).toEqual(VACIO);
    expect(await sincronizarConjunto(db.pool, deps, a.admin)).toEqual(VACIO); // candado liberado
  });
});

describe('Buzones · estadoGateway', () => {
  it('sin buzón: conectado false y buzon null; con buzón: datos públicos, jamás la contraseña cifrada', async () => {
    const c = await nuevoConjunto();
    expect(await estadoGateway(db.pool, c.id)).toEqual({ cuentas: [], totalCorreos: 0, ultimoCorreo: null, conectado: false, buzon: null });
    const { deps } = depsFalsas();
    await guardarBuzon(db.pool, deps, c.admin, { correo: correoDe(c), contrasena: CLAVE });
    const e = await estadoGateway(db.pool, c.id);
    expect(e.conectado).toBe(true);
    expect(Object.keys(e.buzon!).sort()).toEqual(
      ['activo', 'buzon', 'correo', 'diasIniciales', 'imapHost', 'imapPort', 'marcarLeido', 'ultimaSincronizacion', 'ultimoError', 'version'].sort(),
    );
    const json = JSON.stringify(e);
    expect(json).not.toMatch(/contrasena/i);
    expect(json).not.toContain(CLAVE_LIMPIA);
  });

  it('el conjunto inicial (sin buzón en la BD) sigue respondiendo', async () => {
    const e = await estadoGateway(db.pool, await idConjuntoInicial(db));
    expect(e).toMatchObject({ conectado: false, buzon: null });
  });
});
