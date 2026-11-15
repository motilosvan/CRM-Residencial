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
 * 0007 — modelo multi-conjunto. Se migra hasta 0006, se siembran datos "previos" y se aplica 0007:
 * los datos quedan en el conjunto inicial y la BD hace cumplir la separación entre conjuntos.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const baselinePath = path.join(root, 'ScriptBaseDatosCRM.sql');
const realMigrations = path.join(root, 'db', 'migrations');
const archivo0007 = path.join(realMigrations, '0007_conjuntos_y_acceso.sql');

const config = tempDbConfig('CorreosCRM_m0007');
let hasta0006: string;

const q = <T = Record<string, unknown>>(s: string) => runSql<T>(config, s);
const CONJ_B = "(SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = 'conjunto-b')";

beforeAll(async () => {
  hasta0006 = await mkdtemp(path.join(os.tmpdir(), 'crm-0006-'));
  for (const f of await readdir(realMigrations)) {
    if (/^000[2-6]_.*\.sql$/.test(f)) await copyFile(path.join(realMigrations, f), path.join(hasta0006, f));
  }

  // 1) BD en el estado de 0006 con datos de un único conjunto implícito.
  await migrate({ config, baselinePath, migrationsDir: hasta0006 });
  await q(`
    INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES (N'Ana', 'T1-101', 'ana@mail.com');
    INSERT INTO USUARIOS (nombre, rol, correo, activo) VALUES
      (N'Admin', 'ADMIN', 'admin@demo.mailflow.test', 1), (N'Soporte', 'SOPORTE', 'soporte@demo.mailflow.test', 0);
    INSERT INTO CORREOS (idResidente, remitente, messageId) VALUES (1, 'ana@mail.com', '<previo-1@mail>'), (NULL, 'x@mail.com', '<previo-2@mail>');
    INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad)
      SELECT 1, 1, idEstado, 1 FROM ESTADOS WHERE nombre = 'NUEVA';
    INSERT INTO GATEWAY_CHECKPOINT (cuenta, uidValidity, ultimoUid) VALUES ('buzon@demo.mailflow.test/INBOX', 3, 10);
  `);

  // 2) Se aplica la migración real sobre esos datos.
  await migrate({ config, baselinePath, migrationsDir: realMigrations });
});

afterAll(async () => {
  await rm(hasta0006, { recursive: true, force: true });
  await dropTempDb(config);
});

describe('0007_conjuntos_y_acceso — migración de datos existentes', () => {
  it('CONJUNTOS tiene exactamente el conjunto inicial con su paleta', async () => {
    const rows = await q(`SELECT slug, nombre, colorPrimario, colorAcento, colorSecundario, logoUrl, activo FROM CONJUNTOS`);
    expect(rows).toEqual([
      {
        slug: 'parque-central-occidente',
        nombre: 'Parque Central de Occidente',
        colorPrimario: '#355E3B',
        colorAcento: '#D6A64F',
        colorSecundario: '#789653',
        logoUrl: null,
        activo: true,
      },
    ]);
  });

  it('residentes, correos y checkpoint previos quedan en el conjunto inicial', async () => {
    const r = await q<{ tabla: string; n: number; enInicial: number }>(`
      DECLARE @c INT = ${CONJ_SQL};
      SELECT 'RESIDENTES' AS tabla, COUNT(*) AS n, SUM(CASE WHEN idConjunto = @c THEN 1 ELSE 0 END) AS enInicial FROM RESIDENTES
      UNION ALL SELECT 'CORREOS', COUNT(*), SUM(CASE WHEN idConjunto = @c THEN 1 ELSE 0 END) FROM CORREOS
      UNION ALL SELECT 'GATEWAY_CHECKPOINT', COUNT(*), SUM(CASE WHEN idConjunto = @c THEN 1 ELSE 0 END) FROM GATEWAY_CHECKPOINT`);
    expect(r).toEqual([
      { tabla: 'RESIDENTES', n: 1, enInicial: 1 },
      { tabla: 'CORREOS', n: 2, enInicial: 2 },
      { tabla: 'GATEWAY_CHECKPOINT', n: 1, enInicial: 1 },
    ]);
  });

  it('cada usuario previo tiene membresía en el conjunto inicial con su rol y su estado', async () => {
    const r = await q(`
      SELECT u.correo, m.rol, m.activo, CASE WHEN m.idConjunto = ${CONJ_SQL} THEN 1 ELSE 0 END AS enInicial
        FROM USUARIOS u JOIN USUARIO_CONJUNTOS m ON m.idUsuario = u.idUsuario ORDER BY u.idUsuario`);
    expect(r).toEqual([
      { correo: 'admin@demo.mailflow.test', rol: 'ADMIN', activo: true, enInicial: 1 },
      { correo: 'soporte@demo.mailflow.test', rol: 'SOPORTE', activo: false, enInicial: 1 },
    ]);
  });

  it('idConjunto es NOT NULL y sin DEFAULT en las tres tablas', async () => {
    const r = await q<{ tabla: string; nulo: boolean; conDefault: number }>(`
      SELECT OBJECT_NAME(c.object_id) AS tabla, c.is_nullable AS nulo, CASE WHEN c.default_object_id = 0 THEN 0 ELSE 1 END AS conDefault
        FROM sys.columns c
       WHERE c.name = 'idConjunto' AND c.object_id IN (OBJECT_ID('dbo.RESIDENTES'), OBJECT_ID('dbo.CORREOS'), OBJECT_ID('dbo.GATEWAY_CHECKPOINT'))
       ORDER BY tabla`);
    expect(r).toEqual([
      { tabla: 'CORREOS', nulo: false, conDefault: 0 },
      { tabla: 'GATEWAY_CHECKPOINT', nulo: false, conDefault: 0 },
      { tabla: 'RESIDENTES', nulo: false, conDefault: 0 },
    ]);
    await expect(q(`INSERT INTO RESIDENTES (nombre, unidad) VALUES (N'Sin conjunto', 'X-1')`)).rejects.toThrow(/idConjunto/);
  });

  it('es idempotente: migrate no reaplica nada', async () => {
    const res = await migrate({ config, baselinePath, migrationsDir: realMigrations });
    expect(res.aplicadas).toEqual([]);
  });

  it('es idempotente: ejecutar otra vez cada lote de 0007 no cambia datos ni esquema', async () => {
    const foto = () =>
      q(`SELECT (SELECT COUNT(*) FROM CONJUNTOS) AS conjuntos, (SELECT COUNT(*) FROM USUARIO_CONJUNTOS) AS membresias,
                (SELECT COUNT(*) FROM RESIDENTES) AS residentes, (SELECT COUNT(*) FROM CORREOS) AS correos,
                (SELECT COUNT(*) FROM sys.objects WHERE parent_object_id IN (OBJECT_ID('dbo.CONJUNTOS'), OBJECT_ID('dbo.USUARIO_CONJUNTOS'),
                   OBJECT_ID('dbo.RETOS_ACCESO'), OBJECT_ID('dbo.SESIONES'), OBJECT_ID('dbo.RESIDENTES'), OBJECT_ID('dbo.CORREOS'),
                   OBJECT_ID('dbo.GATEWAY_CHECKPOINT'), OBJECT_ID('dbo.ASIGNACIONES'))) AS restricciones,
                (SELECT COUNT(*) FROM sys.indexes WHERE object_id IN (OBJECT_ID('dbo.RESIDENTES'), OBJECT_ID('dbo.CORREOS'),
                   OBJECT_ID('dbo.RETOS_ACCESO'), OBJECT_ID('dbo.SESIONES'), OBJECT_ID('dbo.USUARIO_CONJUNTOS'))) AS indices`);
    const antes = await foto();
    const lotes = splitBatches(await readFile(archivo0007, 'utf8'));
    for (const lote of lotes) await q(lote);
    expect(await foto()).toEqual(antes);
  });
});

describe('0007_conjuntos_y_acceso — integridad entre conjuntos', () => {
  beforeAll(async () => {
    await q(`INSERT INTO CONJUNTOS (slug, nombre) VALUES ('conjunto-b', N'Conjunto B')`);
  });

  it('el mismo correo de residente se acepta en otro conjunto y se rechaza en el mismo', async () => {
    await q(`INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${CONJ_B}, N'Ana B', 'B-1', 'ana@mail.com')`);
    await expect(
      q(`INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${CONJ_SQL}, N'Otra', 'T2-1', 'ana@mail.com')`),
    ).rejects.toThrow(/UX_Residentes_correo/);
  });

  it('el mismo messageId se acepta en otro conjunto y se rechaza en el mismo', async () => {
    await q(`INSERT INTO CORREOS (idConjunto, remitente, messageId) VALUES (${CONJ_B}, 'x@mail.com', '<previo-1@mail>')`);
    await expect(
      q(`INSERT INTO CORREOS (idConjunto, remitente, messageId) VALUES (${CONJ_SQL}, 'x@mail.com', '<previo-1@mail>')`),
    ).rejects.toThrow(/UX_Correos_messageId/);
  });

  it('un correo no puede apuntar a un residente de otro conjunto; sin residente se acepta', async () => {
    await expect(
      q(`INSERT INTO CORREOS (idConjunto, idResidente, remitente, messageId) VALUES (${CONJ_SQL},
           (SELECT idResidente FROM RESIDENTES WHERE idConjunto = ${CONJ_B}), 'ana@mail.com', '<cruce@mail>')`),
    ).rejects.toThrow(/FK_Correos_Residentes_conjunto/);
    await q(`INSERT INTO CORREOS (idConjunto, idResidente, remitente, messageId) VALUES (${CONJ_B}, NULL, 'y@mail.com', '<sin-res@mail>')`);
  });

  it('los colores del conjunto deben ser #RRGGBB o NULL', async () => {
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorPrimario) VALUES ('malo-1', N'M', '355E3B')`)).rejects.toThrow(/CK_Conjuntos_colorPrimario/);
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorAcento) VALUES ('malo-2', N'M', '#GGGGGG')`)).rejects.toThrow(/CK_Conjuntos_colorAcento/);
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorSecundario) VALUES ('malo-3', N'M', '#FFF')`)).rejects.toThrow(/CK_Conjuntos_colorSecundario/);
  });

  it('el rol de la membresía es ADMIN o SOPORTE, y un reto por (conjunto, correo)', async () => {
    await expect(
      q(`INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) VALUES (1, ${CONJ_B}, 'ROOT')`),
    ).rejects.toThrow(/CK_UsuConj_rol/);
    const reto = (c: string) =>
      `INSERT INTO RETOS_ACCESO (idConjunto, correo, codigoHash, existeUsuario, venceEn, reenvioDisponibleEn)
       VALUES (${c}, 'admin@demo.mailflow.test', 0x${'00'.repeat(32)}, 1, SYSUTCDATETIME(), SYSUTCDATETIME())`;
    await q(reto(CONJ_SQL));
    await q(reto(CONJ_B));
    await expect(q(reto(CONJ_SQL))).rejects.toThrow(/UX_Retos_conjunto_correo/);
  });
});

describe('0007_conjuntos_y_acceso — asignaciones exigen membresía activa (TR_Asignaciones_membresia)', () => {
  let solicitud: number;
  let admin: number;
  let soporteA: number;
  let soloB: number;

  beforeAll(async () => {
    const crear = async (nombre: string, correo: string, conj: string) => {
      const r = await q<{ id: number }>(`
        DECLARE @u TABLE (id INT);
        INSERT INTO USUARIOS (nombre, rol, correo) OUTPUT inserted.idUsuario INTO @u VALUES (N'${nombre}', 'SOPORTE', '${correo}');
        INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) SELECT id, ${conj}, 'SOPORTE' FROM @u;
        SELECT id FROM @u;`);
      return r[0]!.id;
    };
    admin = (await q<{ id: number }>(`SELECT idUsuario AS id FROM USUARIOS WHERE correo = 'admin@demo.mailflow.test'`))[0]!.id;
    soporteA = await crear('Soporte A', 'soporte-a@demo.mailflow.test', CONJ_SQL);
    soloB = await crear('Solo B', 'solo-b@demo.mailflow.test', CONJ_B);
    solicitud = (await q<{ id: number }>(`SELECT idSolicitud AS id FROM SOLICITUDES`))[0]!.id;
  });

  const asignar = (resp: number, por: number) =>
    q(`INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (${solicitud}, ${resp}, ${por})`);

  it('rechaza un responsable sin membresía en el conjunto de la solicitud', async () => {
    await expect(asignar(soloB, admin)).rejects.toMatchObject({ number: 50026, message: expect.stringMatching(/membresía activa/) });
  });

  it('rechaza a quien asigna sin membresía en el conjunto de la solicitud', async () => {
    await expect(asignar(soporteA, soloB)).rejects.toMatchObject({ number: 50026 });
  });

  it('rechaza una membresía inactiva (el SOPORTE previo quedó inactivo)', async () => {
    const inactivo = (await q<{ id: number }>(`SELECT idUsuario AS id FROM USUARIOS WHERE correo = 'soporte@demo.mailflow.test'`))[0]!.id;
    await expect(asignar(inactivo, admin)).rejects.toMatchObject({ number: 50026 });
  });

  it('acepta con ambas membresías activas', async () => {
    await asignar(soporteA, admin);
    const r = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM ASIGNACIONES WHERE idSolicitud = ${solicitud} AND liberadaEn IS NULL`);
    expect(r[0]?.n).toBe(1);
  });

  it('liberar una asignación no exige membresía vigente (se puede reasignar a quien dejó el conjunto)', async () => {
    await q(`UPDATE USUARIO_CONJUNTOS SET activo = 0 WHERE idUsuario = ${soporteA}`);
    await q(`UPDATE ASIGNACIONES SET liberadaEn = SYSUTCDATETIME() WHERE idSolicitud = ${solicitud} AND liberadaEn IS NULL`);
    const r = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM ASIGNACIONES WHERE idSolicitud = ${solicitud} AND liberadaEn IS NULL`);
    expect(r[0]?.n).toBe(0);
    await expect(
      q(`UPDATE ASIGNACIONES SET idUsuario = ${soloB} WHERE idSolicitud = ${solicitud}`),
    ).rejects.toMatchObject({ number: 50026 });
  });
});

describe('0007_conjuntos_y_acceso — permisos de crm_app', () => {
  const login = `soc_test_${randomBytes(4).toString('hex')}`;
  const password = `Aa1-${randomBytes(18).toString('base64url')}`;
  let app: sql.ConnectionPool;
  const comoApp = (s: string) => app.request().query(s);

  beforeAll(async () => {
    await asegurarUsuarioApp(config, config.database, login, password);
    app = await crearPool({ ...config, user: login, password }, { max: 1 });
  });
  afterAll(async () => {
    await app?.close();
    await runSql({ ...config, database: 'master' }, `IF SUSER_ID('${login}') IS NOT NULL DROP LOGIN [${login}]`);
  });

  it('puede insertar y actualizar retos, sesiones y membresías', async () => {
    await comoApp(`
      INSERT INTO RETOS_ACCESO (idConjunto, correo, codigoHash, existeUsuario, venceEn, reenvioDisponibleEn)
      VALUES (${CONJ_SQL}, 'app@demo.mailflow.test', 0x${'11'.repeat(32)}, 0, SYSUTCDATETIME(), SYSUTCDATETIME());
      UPDATE RETOS_ACCESO SET intentosFallidos = 1 WHERE correo = 'app@demo.mailflow.test';
      INSERT INTO SESIONES (tokenHash, idUsuario, idConjuntoActivo) VALUES (0x${'22'.repeat(32)}, 1, ${CONJ_SQL});
      UPDATE SESIONES SET revocadaEn = SYSUTCDATETIME() WHERE tokenHash = 0x${'22'.repeat(32)};
      INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) VALUES (1, ${CONJ_B}, 'ADMIN');
      UPDATE USUARIO_CONJUNTOS SET activo = 0 WHERE idUsuario = 1 AND idConjunto = ${CONJ_B};`);
  });

  it('no puede borrar retos, sesiones ni membresías, ni crear conjuntos', async () => {
    const denegado = /permission was denied|denegado/i;
    await expect(comoApp(`DELETE FROM RETOS_ACCESO`)).rejects.toThrow(denegado);
    await expect(comoApp(`DELETE FROM SESIONES`)).rejects.toThrow(denegado);
    await expect(comoApp(`DELETE FROM USUARIO_CONJUNTOS`)).rejects.toThrow(denegado);
    await expect(comoApp(`INSERT INTO CONJUNTOS (slug, nombre) VALUES ('hack', N'Hack')`)).rejects.toThrow(denegado);
  });
});
