import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONJ_SQL, dropTempDb, runSql, tempDbConfig } from '../../test/helpers/testDb.js';
import { migrate } from './migrate.js';
import { crearPool } from './pool.js';
import { splitBatches } from './splitBatches.js';
import { asegurarUsuarioApp } from './usuarioApp.js';

/**
 * 0008 — buzón IMAP por conjunto, columnas `version`/`activo` para la administración y bitácora
 * AUDITORIA_ADMIN. Se migra hasta 0007, se siembran datos "previos" y se aplica 0008.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const baselinePath = path.join(root, 'ScriptBaseDatosCRM.sql');
const realMigrations = path.join(root, 'db', 'migrations');
const archivo0008 = path.join(realMigrations, '0008_buzones_y_administracion.sql');

const config = tempDbConfig('CorreosCRM_m0008');
let hasta0007: string;

const q = <T = Record<string, unknown>>(s: string) => runSql<T>(config, s);
const CONJ_B = "(SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = 'conjunto-b')";
const CONJ_C = "(SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = 'conjunto-c')";
/** IV (12) + tag (16) + n bytes de texto cifrado. */
const cifrado = (n: number) => `0x${'ab'.repeat(28 + n)}`;
const denegado = /permission was denied|denegado/i;

beforeAll(async () => {
  hasta0007 = await mkdtemp(path.join(os.tmpdir(), 'crm-0007-'));
  for (const f of await readdir(realMigrations)) {
    if (/^000[2-7]_.*\.sql$/.test(f)) await copyFile(path.join(realMigrations, f), path.join(hasta0007, f));
  }

  // 1) BD en el estado de 0007 con datos previos (el conjunto inicial lo crea la 0007).
  await migrate({ config, baselinePath, migrationsDir: hasta0007 });
  await q(`
    INSERT INTO CONJUNTOS (slug, nombre) VALUES ('conjunto-b', N'Conjunto B');
    INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${CONJ_SQL}, N'Ana', 'T1-101', 'ana@demo.mailflow.test');
    INSERT INTO USUARIOS (nombre, rol, correo, activo) VALUES (N'Admin', 'ADMIN', 'admin@demo.mailflow.test', 1);
    INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) SELECT idUsuario, ${CONJ_SQL}, 'ADMIN' FROM USUARIOS;
  `);

  // 2) Se aplica la migración real sobre esos datos.
  await migrate({ config, baselinePath, migrationsDir: realMigrations });
});

afterAll(async () => {
  await rm(hasta0007, { recursive: true, force: true });
  await dropTempDb(config);
});

describe('0008_buzones_y_administracion — columnas nuevas', () => {
  it('las filas previas quedan con activo = 1 y version = 1', async () => {
    const r = await q(`
      SELECT 'RESIDENTES' AS tabla, COUNT(*) AS n, SUM(CASE WHEN version = 1 AND activo = 1 THEN 1 ELSE 0 END) AS ok FROM RESIDENTES
      UNION ALL SELECT 'USUARIO_CONJUNTOS', COUNT(*), SUM(CASE WHEN version = 1 THEN 1 ELSE 0 END) FROM USUARIO_CONJUNTOS
      UNION ALL SELECT 'CONJUNTOS', COUNT(*), SUM(CASE WHEN version = 1 THEN 1 ELSE 0 END) FROM CONJUNTOS`);
    expect(r).toEqual([
      { tabla: 'RESIDENTES', n: 1, ok: 1 },
      { tabla: 'USUARIO_CONJUNTOS', n: 1, ok: 1 },
      { tabla: 'CONJUNTOS', n: 2, ok: 2 },
    ]);
  });

  it('las columnas son NOT NULL con su DEFAULT con nombre', async () => {
    const r = await q(`
      SELECT OBJECT_NAME(c.object_id) AS tabla, c.name AS columna, c.is_nullable AS nulo, dc.name AS df, dc.definition AS valor
        FROM sys.columns c
        JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
       WHERE (c.object_id = OBJECT_ID('dbo.RESIDENTES') AND c.name IN ('activo', 'version'))
          OR (c.object_id IN (OBJECT_ID('dbo.USUARIO_CONJUNTOS'), OBJECT_ID('dbo.CONJUNTOS'), OBJECT_ID('dbo.BUZONES_CONJUNTO')) AND c.name = 'version')
       ORDER BY tabla, columna`);
    expect(r).toEqual([
      { tabla: 'BUZONES_CONJUNTO', columna: 'version', nulo: false, df: 'DF_Buzones_version', valor: '((1))' },
      { tabla: 'CONJUNTOS', columna: 'version', nulo: false, df: 'DF_Conjuntos_version', valor: '((1))' },
      { tabla: 'RESIDENTES', columna: 'activo', nulo: false, df: 'DF_Residentes_activo', valor: '((1))' },
      { tabla: 'RESIDENTES', columna: 'version', nulo: false, df: 'DF_Residentes_version', valor: '((1))' },
      { tabla: 'USUARIO_CONJUNTOS', columna: 'version', nulo: false, df: 'DF_UsuConj_version', valor: '((1))' },
    ]);
  });

  it.each([
    ['RESIDENTES', 'CK_Residentes_version'],
    ['USUARIO_CONJUNTOS', 'CK_UsuConj_version'],
    ['CONJUNTOS', 'CK_Conjuntos_version'],
  ])('%s rechaza version = 0', async (tabla, ck) => {
    await expect(q(`UPDATE ${tabla} SET version = 0`)).rejects.toThrow(new RegExp(ck));
  });

  it('un residente nuevo nace activo y en version 1', async () => {
    const r = await q(`
      INSERT INTO RESIDENTES (idConjunto, nombre, unidad) OUTPUT inserted.activo, inserted.version VALUES (${CONJ_B}, N'Nuevo', 'B-2')`);
    expect(r).toEqual([{ activo: true, version: 1 }]);
  });
});

describe('0008_buzones_y_administracion — BUZONES_CONJUNTO', () => {
  const buzon = (conj: string, extra: Record<string, string> = {}) => {
    const cols = { idConjunto: conj, correo: `'buzon@demo.mailflow.test'`, contrasenaCifrada: cifrado(1), ...extra };
    return q(`INSERT INTO BUZONES_CONJUNTO (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).join(', ')})`);
  };

  it('inserta con los valores por defecto', async () => {
    await buzon(CONJ_SQL);
    const r = await q(`
      SELECT imapHost, imapPort, buzon, diasIniciales, marcarLeido, activo, ultimaSincronizacion, ultimoError, version,
             CASE WHEN actualizadoEn IS NOT NULL THEN 1 ELSE 0 END AS conFecha
        FROM BUZONES_CONJUNTO WHERE idConjunto = ${CONJ_SQL}`);
    expect(r).toEqual([
      {
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        buzon: 'INBOX',
        diasIniciales: 7,
        marcarLeido: false,
        activo: true,
        ultimaSincronizacion: null,
        ultimoError: null,
        version: 1,
        conFecha: 1,
      },
    ]);
  });

  it('el puerto va de 1 a 65535', async () => {
    await expect(buzon(CONJ_B, { correo: `'p0@demo.mailflow.test'`, imapPort: '0' })).rejects.toThrow(/CK_Buzones_port/);
    await expect(buzon(CONJ_B, { correo: `'p1@demo.mailflow.test'`, imapPort: '65536' })).rejects.toThrow(/CK_Buzones_port/);
  });

  it('diasIniciales va de 0 a 365', async () => {
    await expect(buzon(CONJ_B, { correo: `'d0@demo.mailflow.test'`, diasIniciales: '-1' })).rejects.toThrow(/CK_Buzones_dias/);
    await expect(buzon(CONJ_B, { correo: `'d1@demo.mailflow.test'`, diasIniciales: '366' })).rejects.toThrow(/CK_Buzones_dias/);
  });

  it('la contraseña cifrada tiene más de 28 bytes (IV + tag + texto)', async () => {
    await expect(buzon(CONJ_B, { correo: `'c0@demo.mailflow.test'`, contrasenaCifrada: cifrado(0) })).rejects.toThrow(/CK_Buzones_cifrado/);
    await expect(buzon(CONJ_B, { correo: `'c1@demo.mailflow.test'`, contrasenaCifrada: '0x01' })).rejects.toThrow(/CK_Buzones_cifrado/);
  });

  it('rechaza version = 0', async () => {
    await expect(q(`UPDATE BUZONES_CONJUNTO SET version = 0 WHERE idConjunto = ${CONJ_SQL}`)).rejects.toThrow(/CK_Buzones_version/);
  });

  it('el conjunto debe existir (FK) y tiene un solo buzón (PK)', async () => {
    await expect(buzon('999999', { correo: `'fk@demo.mailflow.test'` })).rejects.toThrow(/FK_Buzones_Conjuntos/);
    await expect(buzon(CONJ_SQL, { correo: `'otro@demo.mailflow.test'` })).rejects.toThrow(/PK_BuzonesConjunto/);
  });

  it('la misma cuenta/carpeta no puede estar activa en dos conjuntos; inactiva sí', async () => {
    // buzon@demo.mailflow.test/INBOX ya está activo en el conjunto inicial.
    await expect(buzon(CONJ_B)).rejects.toThrow(/UX_Buzones_cuenta_activa/);
    // Otra carpeta de la misma cuenta sí se acepta.
    await buzon(CONJ_B, { buzon: `N'Residentes'` });
    await q(`UPDATE BUZONES_CONJUNTO SET activo = 0 WHERE idConjunto = ${CONJ_SQL}`);
    await q(`INSERT INTO CONJUNTOS (slug, nombre) VALUES ('conjunto-c', N'Conjunto C')`);
    await buzon(CONJ_C);
    // Reactivar el primero dejaría dos activos.
    await expect(q(`UPDATE BUZONES_CONJUNTO SET activo = 1 WHERE idConjunto = ${CONJ_SQL}`)).rejects.toThrow(/UX_Buzones_cuenta_activa/);
  });
});

describe('0008_buzones_y_administracion — AUDITORIA_ADMIN', () => {
  const auditar = (entidad: string, accion: string) =>
    q(`INSERT INTO AUDITORIA_ADMIN (idConjunto, idUsuario, entidad, idEntidad, accion, detalle)
       VALUES (${CONJ_SQL}, NULL, '${entidad}', 1, '${accion}', N'prueba')`);

  it('acepta cada entidad y acción de la lista', async () => {
    for (const e of ['USUARIO', 'RESIDENTE', 'CONJUNTO', 'BUZON']) await auditar(e, 'CREAR');
    for (const a of ['ACTUALIZAR', 'ACTIVAR', 'DESACTIVAR', 'CAMBIAR_ROL', 'CONECTAR', 'DESCONECTAR', 'VINCULAR']) await auditar('USUARIO', a);
    const r = await q<{ n: number; conFecha: number }>(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN fecha IS NOT NULL THEN 1 ELSE 0 END) AS conFecha FROM AUDITORIA_ADMIN`,
    );
    expect(r).toEqual([{ n: 11, conFecha: 11 }]);
  });

  it('rechaza entidad y acción fuera de la lista o en minúsculas', async () => {
    await expect(auditar('SOLICITUD', 'CREAR')).rejects.toThrow(/CK_AudAdmin_entidad/);
    await expect(auditar('usuario', 'CREAR')).rejects.toThrow(/CK_AudAdmin_entidad/);
    await expect(auditar('USUARIO', 'BORRAR')).rejects.toThrow(/CK_AudAdmin_accion/);
    await expect(auditar('USUARIO', 'crear')).rejects.toThrow(/CK_AudAdmin_accion/);
  });

  it('rechaza un conjunto o un actor inexistentes', async () => {
    await expect(
      q(`INSERT INTO AUDITORIA_ADMIN (idConjunto, entidad, idEntidad, accion) VALUES (999999, 'USUARIO', 1, 'CREAR')`),
    ).rejects.toThrow(/FK_AudAdmin_Conjuntos/);
    await expect(
      q(`INSERT INTO AUDITORIA_ADMIN (idConjunto, idUsuario, entidad, idEntidad, accion) VALUES (${CONJ_SQL}, 999999, 'USUARIO', 1, 'CREAR')`),
    ).rejects.toThrow(/FK_AudAdmin_Usuarios/);
  });

  it('UPDATE y DELETE fallan por el trigger incluso con el login migrador', async () => {
    await expect(q(`UPDATE AUDITORIA_ADMIN SET detalle = N'x'`)).rejects.toMatchObject({
      number: 50031,
      message: expect.stringMatching(/AUDITORIA_ADMIN es de solo inserción/),
    });
    await expect(q(`DELETE FROM AUDITORIA_ADMIN`)).rejects.toMatchObject({ number: 50031 });
    const r = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM AUDITORIA_ADMIN WHERE detalle = N'prueba'`);
    expect(r[0]?.n).toBe(11);
  });

  it('tiene el índice por conjunto y fecha', async () => {
    const r = await q(`
      SELECT COL_NAME(ic.object_id, ic.column_id) AS col, ic.is_descending_key AS desc_
        FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
       WHERE i.name = 'IX_AudAdmin_conjunto_fecha' AND i.object_id = OBJECT_ID('dbo.AUDITORIA_ADMIN')
       ORDER BY ic.key_ordinal`);
    expect(r).toEqual([
      { col: 'idConjunto', desc_: false },
      { col: 'fecha', desc_: true },
      { col: 'idAuditoria', desc_: true },
    ]);
  });
});

describe('0008_buzones_y_administracion — permisos de crm_app', () => {
  const login = `soc_test_${randomBytes(4).toString('hex')}`;
  const password = `Aa1-${randomBytes(18).toString('base64url')}`;
  let app: sql.ConnectionPool;
  const comoApp = (s: string) => app.request().query(s);
  const CONJ_APP = "(SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = 'conjunto-app')";

  beforeAll(async () => {
    await asegurarUsuarioApp(config, config.database, login, password);
    app = await crearPool({ ...config, user: login, password }, { max: 1 });
  });
  afterAll(async () => {
    await app?.close();
    await runSql({ ...config, database: 'master' }, `IF SUSER_ID('${login}') IS NOT NULL DROP LOGIN [${login}]`);
  });

  it('puede crear un conjunto y actualizar nombre, activo y version', async () => {
    await comoApp(`INSERT INTO CONJUNTOS (slug, nombre) VALUES ('conjunto-app', N'Conjunto App')`);
    await comoApp(`UPDATE CONJUNTOS SET nombre = N'Renombrado', activo = 0, version = version + 1 WHERE slug = 'conjunto-app'`);
    const r = await q(`SELECT nombre, activo, version FROM CONJUNTOS WHERE slug = 'conjunto-app'`);
    expect(r).toEqual([{ nombre: 'Renombrado', activo: false, version: 2 }]);
  });

  it('no puede cambiar slug, idConjunto ni fechaCreacion de un conjunto', async () => {
    await expect(comoApp(`UPDATE CONJUNTOS SET slug = 'otro' WHERE slug = 'conjunto-app'`)).rejects.toThrow(denegado);
    await expect(comoApp(`UPDATE CONJUNTOS SET fechaCreacion = SYSUTCDATETIME() WHERE slug = 'conjunto-app'`)).rejects.toThrow(denegado);
  });

  it('puede insertar y actualizar buzones', async () => {
    await comoApp(`
      INSERT INTO BUZONES_CONJUNTO (idConjunto, correo, contrasenaCifrada) VALUES (${CONJ_APP}, 'app@demo.mailflow.test', ${cifrado(4)});
      UPDATE BUZONES_CONJUNTO SET ultimoError = 'AUTENTICACION', version = version + 1 WHERE idConjunto = ${CONJ_APP};`);
    const r = await q(`SELECT ultimoError, version FROM BUZONES_CONJUNTO WHERE idConjunto = ${CONJ_APP}`);
    expect(r).toEqual([{ ultimoError: 'AUTENTICACION', version: 2 }]);
  });

  it('puede insertar auditoría, pero no actualizarla (DENY antes del trigger)', async () => {
    await comoApp(`INSERT INTO AUDITORIA_ADMIN (idConjunto, entidad, idEntidad, accion) VALUES (${CONJ_APP}, 'CONJUNTO', 1, 'CREAR')`);
    await expect(comoApp(`UPDATE AUDITORIA_ADMIN SET detalle = N'x'`)).rejects.toThrow(denegado);
  });

  it('no puede borrar buzones, conjuntos ni auditoría', async () => {
    await expect(comoApp(`DELETE FROM BUZONES_CONJUNTO`)).rejects.toThrow(denegado);
    await expect(comoApp(`DELETE FROM CONJUNTOS WHERE slug = 'conjunto-app'`)).rejects.toThrow(denegado);
    await expect(comoApp(`DELETE FROM AUDITORIA_ADMIN`)).rejects.toThrow(denegado);
  });
});

describe('0008_buzones_y_administracion — idempotencia', () => {
  it('migrate no reaplica nada', async () => {
    const res = await migrate({ config, baselinePath, migrationsDir: realMigrations });
    expect(res.aplicadas).toEqual([]);
  });

  it('ejecutar otra vez cada lote de 0008 no cambia datos ni esquema', async () => {
    const foto = () =>
      q(`SELECT (SELECT COUNT(*) FROM CONJUNTOS) AS conjuntos, (SELECT SUM(version) FROM CONJUNTOS) AS vConjuntos,
                (SELECT COUNT(*) FROM RESIDENTES) AS residentes, (SELECT SUM(version) FROM RESIDENTES) AS vResidentes,
                (SELECT COUNT(*) FROM BUZONES_CONJUNTO) AS buzones, (SELECT SUM(version) FROM BUZONES_CONJUNTO) AS vBuzones,
                (SELECT COUNT(*) FROM AUDITORIA_ADMIN) AS auditoria,
                (SELECT COUNT(*) FROM sys.objects WHERE parent_object_id IN (OBJECT_ID('dbo.CONJUNTOS'), OBJECT_ID('dbo.USUARIO_CONJUNTOS'),
                   OBJECT_ID('dbo.RESIDENTES'), OBJECT_ID('dbo.BUZONES_CONJUNTO'), OBJECT_ID('dbo.AUDITORIA_ADMIN'))) AS restricciones,
                (SELECT COUNT(*) FROM sys.indexes WHERE object_id IN (OBJECT_ID('dbo.BUZONES_CONJUNTO'), OBJECT_ID('dbo.AUDITORIA_ADMIN'))) AS indices,
                (SELECT COUNT(*) FROM sys.database_permissions WHERE grantee_principal_id = DATABASE_PRINCIPAL_ID('crm_app')) AS permisos`);
    const antes = await foto();
    for (const lote of splitBatches(await readFile(archivo0008, 'utf8'))) await q(lote);
    expect(await foto()).toEqual(antes);
  });
});
