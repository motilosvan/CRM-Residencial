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
    INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES (N'Ana', 'T1-101', 'ana@demo.mailflow.test');
    INSERT INTO USUARIOS (nombre, rol, correo, activo) VALUES
      (N'Admin', 'ADMIN', 'admin@demo.mailflow.test', 1), (N'Soporte', 'SOPORTE', 'soporte@demo.mailflow.test', 0);
    INSERT INTO CORREOS (idResidente, remitente, messageId) VALUES (1, 'ana@demo.mailflow.test', '<previo-1@mail>'), (NULL, 'x@demo.mailflow.test', '<previo-2@mail>');
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

  it('cada FK nueva tiene un índice cuya clave empieza por sus columnas', async () => {
    // Para cada FK de 0007: ¿hay algún índice de la tabla hija cuyas primeras columnas son las de la FK?
    const r = await q<{ fk: string; cubierta: number }>(`
      SELECT fk.name AS fk,
             CASE WHEN EXISTS (
               SELECT 1 FROM sys.indexes i
                WHERE i.object_id = fk.parent_object_id
                  AND NOT EXISTS (
                    SELECT 1 FROM sys.foreign_key_columns fc
                     WHERE fc.constraint_object_id = fk.object_id
                       AND NOT EXISTS (SELECT 1 FROM sys.index_columns ic
                                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id
                                          AND ic.column_id = fc.parent_column_id AND ic.key_ordinal = fc.constraint_column_id))
             ) THEN 1 ELSE 0 END AS cubierta
        FROM sys.foreign_keys fk
       WHERE fk.name IN ('FK_UsuConj_Usuarios', 'FK_UsuConj_Conjuntos', 'FK_Residentes_Conjuntos', 'FK_Correos_Conjuntos',
                         'FK_Checkpoint_Conjuntos', 'FK_Correos_Residentes_conjunto', 'FK_Retos_Conjuntos',
                         'FK_Sesiones_Usuarios', 'FK_Sesiones_Conjuntos')
       ORDER BY fk.name`);
    expect(r).toHaveLength(9);
    expect(r.filter((x) => x.cubierta === 0).map((x) => x.fk)).toEqual([]);
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
    await q(`INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${CONJ_B}, N'Ana B', 'B-1', 'ana@demo.mailflow.test')`);
    await expect(
      q(`INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${CONJ_SQL}, N'Otra', 'T2-1', 'ana@demo.mailflow.test')`),
    ).rejects.toThrow(/UX_Residentes_correo/);
  });

  it('el mismo messageId se acepta en otro conjunto y se rechaza en el mismo', async () => {
    await q(`INSERT INTO CORREOS (idConjunto, remitente, messageId) VALUES (${CONJ_B}, 'x@demo.mailflow.test', '<previo-1@mail>')`);
    await expect(
      q(`INSERT INTO CORREOS (idConjunto, remitente, messageId) VALUES (${CONJ_SQL}, 'x@demo.mailflow.test', '<previo-1@mail>')`),
    ).rejects.toThrow(/UX_Correos_messageId/);
  });

  it('un correo no puede apuntar a un residente de otro conjunto; sin residente se acepta', async () => {
    await expect(
      q(`INSERT INTO CORREOS (idConjunto, idResidente, remitente, messageId) VALUES (${CONJ_SQL},
           (SELECT idResidente FROM RESIDENTES WHERE idConjunto = ${CONJ_B}), 'ana@demo.mailflow.test', '<cruce@mail>')`),
    ).rejects.toThrow(/FK_Correos_Residentes_conjunto/);
    await q(`INSERT INTO CORREOS (idConjunto, idResidente, remitente, messageId) VALUES (${CONJ_B}, NULL, 'y@demo.mailflow.test', '<sin-res@mail>')`);
  });

  it('los colores del conjunto deben ser #RRGGBB o NULL', async () => {
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorPrimario) VALUES ('malo-1', N'M', '355E3B')`)).rejects.toThrow(/CK_Conjuntos_colorPrimario/);
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorAcento) VALUES ('malo-2', N'M', '#GGGGGG')`)).rejects.toThrow(/CK_Conjuntos_colorAcento/);
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorSecundario) VALUES ('malo-3', N'M', '#FFF')`)).rejects.toThrow(/CK_Conjuntos_colorSecundario/);
    // Con la collation CI, 'á' cae dentro del rango [A-Fa-f]: los CHECK comparan en binario.
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorPrimario) VALUES ('malo-4', N'M', '#35áE3B')`)).rejects.toThrow(/CK_Conjuntos_colorPrimario/);
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorAcento) VALUES ('malo-5', N'M', '#D6Á64F')`)).rejects.toThrow(/CK_Conjuntos_colorAcento/);
    await expect(q(`INSERT INTO CONJUNTOS (slug, nombre, colorSecundario) VALUES ('malo-6', N'M', '#7896é3')`)).rejects.toThrow(/CK_Conjuntos_colorSecundario/);
  });

  it('el rol de la membresía es ADMIN o SOPORTE, y un reto por (conjunto, correo)', async () => {
    await expect(
      q(`INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) VALUES (1, ${CONJ_B}, 'ROOT')`),
    ).rejects.toThrow(/CK_UsuConj_rol/);
    const reto = (c: string) =>
      `INSERT INTO RETOS_ACCESO (idConjunto, correo, codigoHash, existeUsuario, venceEn, reenvioDisponibleEn)
       VALUES (${c}, 'admin@demo.mailflow.test', 0x${'00'.repeat(32)}, 1, DATEADD(MINUTE, 10, SYSUTCDATETIME()), SYSUTCDATETIME())`;
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

  it('mover una asignación a una solicitud de otro conjunto exige membresía allí', async () => {
    await q(`UPDATE USUARIO_CONJUNTOS SET activo = 1 WHERE idUsuario = ${soporteA}`);
    const enB = await q<{ id: number }>(`
      DECLARE @c INT;
      DECLARE @s TABLE (id INT);
      INSERT INTO CORREOS (idConjunto, remitente, messageId) VALUES (${CONJ_B}, 'z@demo.mailflow.test', '<mover@mail>');
      SET @c = SCOPE_IDENTITY();
      INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) OUTPUT inserted.idSolicitud INTO @s
        SELECT @c, 1, idEstado, 1 FROM ESTADOS WHERE nombre = 'NUEVA';
      SELECT id FROM @s;`);
    const idAsignacion = (await q<{ id: number }>(
      `SELECT TOP (1) idAsignacion AS id FROM ASIGNACIONES WHERE idSolicitud = ${solicitud} AND idUsuario = ${soporteA}`,
    ))[0]!.id;
    await expect(
      q(`UPDATE ASIGNACIONES SET idSolicitud = ${enB[0]!.id} WHERE idAsignacion = ${idAsignacion}`),
    ).rejects.toMatchObject({ number: 50026, message: expect.stringMatching(/membresía activa/) });
  });
});

describe('0007_conjuntos_y_acceso — correos, residentes y solicitudes no cambian de conjunto', () => {
  let correoSinResidente: number;
  let correoEnB: number;
  let solicitud: number;
  let residente: number;

  const conjuntoDe = async (idCorreo: number) =>
    (await q<{ esInicial: number }>(
      `SELECT CASE WHEN idConjunto = ${CONJ_SQL} THEN 1 ELSE 0 END AS esInicial FROM CORREOS WHERE idCorreo = ${idCorreo}`,
    ))[0]!.esInicial;

  beforeAll(async () => {
    // Correo del conjunto inicial sin residente (la FK compuesta no lo ata), con solicitud y asignación vigente.
    const [ids] = await q<{ correo: number; correoB: number; solicitud: number; residente: number }>(`
      DECLARE @u TABLE (id INT);
      DECLARE @c INT, @b INT, @s INT, @r INT;
      INSERT INTO USUARIOS (nombre, rol, correo) OUTPUT inserted.idUsuario INTO @u VALUES (N'Fijo', 'SOPORTE', 'fijo@demo.mailflow.test');
      INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) SELECT id, ${CONJ_SQL}, 'SOPORTE' FROM @u;
      INSERT INTO CORREOS (idConjunto, idResidente, remitente, messageId) VALUES (${CONJ_SQL}, NULL, 'anonimo@mail.com', '<fijo-a@mail>');
      SET @c = SCOPE_IDENTITY();
      INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) SELECT @c, 1, idEstado, 1 FROM ESTADOS WHERE nombre = 'NUEVA';
      SET @s = SCOPE_IDENTITY();
      INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) SELECT @s, id, id FROM @u;
      INSERT INTO CORREOS (idConjunto, idResidente, remitente, messageId) VALUES (${CONJ_B}, NULL, 'otro@mail.com', '<fijo-b@mail>');
      SET @b = SCOPE_IDENTITY();
      INSERT INTO RESIDENTES (idConjunto, nombre, unidad, correo) VALUES (${CONJ_SQL}, N'Sin correos', 'F-1', 'fijo-res@demo.mailflow.test');
      SET @r = SCOPE_IDENTITY();
      SELECT @c AS correo, @b AS correoB, @s AS solicitud, @r AS residente;`);
    correoSinResidente = ids!.correo;
    correoEnB = ids!.correoB;
    solicitud = ids!.solicitud;
    residente = ids!.residente;
  });

  it('caso 1: un correo sin residente no se puede mover a otro conjunto (ni su solicitud ni su asignación)', async () => {
    await expect(q(`UPDATE CORREOS SET idConjunto = ${CONJ_B} WHERE idCorreo = ${correoSinResidente}`)).rejects.toMatchObject({
      number: 50027,
      message: expect.stringMatching(/conjunto de un correo/),
    });
    expect(await conjuntoDe(correoSinResidente)).toBe(1);
  });

  it('caso 2: una solicitud no se puede re-apuntar a un correo de otro conjunto', async () => {
    await expect(q(`UPDATE SOLICITUDES SET idCorreo = ${correoEnB} WHERE idSolicitud = ${solicitud}`)).rejects.toMatchObject({
      number: 50029,
      message: expect.stringMatching(/correo de una solicitud/),
    });
    const r = await q<{ idCorreo: number }>(`SELECT idCorreo FROM SOLICITUDES WHERE idSolicitud = ${solicitud}`);
    expect(r[0]?.idCorreo).toBe(correoSinResidente);
  });

  it('un residente sin correos tampoco cambia de conjunto', async () => {
    await expect(q(`UPDATE RESIDENTES SET idConjunto = ${CONJ_B} WHERE idResidente = ${residente}`)).rejects.toMatchObject({
      number: 50028,
      message: expect.stringMatching(/conjunto de un residente/),
    });
  });

  it('multi-fila: basta una fila que cambie de conjunto para rechazar todo el UPDATE', async () => {
    // correoEnB ya está en B (no cambia); correoSinResidente sí cambiaría.
    await expect(
      q(`UPDATE CORREOS SET idConjunto = ${CONJ_B} WHERE idCorreo IN (${correoEnB}, ${correoSinResidente})`),
    ).rejects.toMatchObject({ number: 50027 });
    expect(await conjuntoDe(correoSinResidente)).toBe(1);
    expect(await conjuntoDe(correoEnB)).toBe(0);
  });

  it('se aceptan los UPDATE que no cambian el conjunto ni el correo (varias filas)', async () => {
    await q(`UPDATE CORREOS SET idConjunto = idConjunto, asunto = 'sin cambio' WHERE idCorreo IN (${correoEnB}, ${correoSinResidente})`);
    await q(`UPDATE RESIDENTES SET idConjunto = idConjunto, telefono = '3000000000' WHERE idResidente = ${residente}`);
    await q(`UPDATE SOLICITUDES SET idCorreo = idCorreo, idPrioridad = 2 WHERE idSolicitud = ${solicitud}`);
    expect(await conjuntoDe(correoSinResidente)).toBe(1);
  });

  describe('GATEWAY_CHECKPOINT (PK cuenta, que sí se puede actualizar)', () => {
    const CUENTA_A = 'buzon@demo.mailflow.test/INBOX'; // checkpoint previo, quedó en el conjunto inicial
    const CUENTA_B = 'buzon-b@demo.mailflow.test/INBOX';
    const enInicial = async (cuenta: string) =>
      (await q<{ esInicial: number }>(
        `SELECT CASE WHEN idConjunto = ${CONJ_SQL} THEN 1 ELSE 0 END AS esInicial FROM GATEWAY_CHECKPOINT WHERE cuenta = '${cuenta}'`,
      ))[0]?.esInicial;

    beforeAll(async () => {
      await q(`INSERT INTO GATEWAY_CHECKPOINT (cuenta, idConjunto, uidValidity, ultimoUid) VALUES ('${CUENTA_B}', ${CONJ_B}, 1, 1)`);
    });

    it('un checkpoint no se puede mover a otro conjunto', async () => {
      await expect(q(`UPDATE GATEWAY_CHECKPOINT SET idConjunto = ${CONJ_B} WHERE cuenta = '${CUENTA_A}'`)).rejects.toMatchObject({
        number: 50030,
        message: expect.stringMatching(/conjunto de un checkpoint/),
      });
      expect(await enInicial(CUENTA_A)).toBe(1);
    });

    it('multi-fila: una fila que cambia de conjunto rechaza todo el UPDATE', async () => {
      await expect(
        q(`UPDATE GATEWAY_CHECKPOINT SET idConjunto = ${CONJ_B} WHERE cuenta IN ('${CUENTA_A}', '${CUENTA_B}')`),
      ).rejects.toMatchObject({ number: 50030 });
      expect(await enInicial(CUENTA_A)).toBe(1);
      expect(await enInicial(CUENTA_B)).toBe(0);
    });

    it('renombrar la cuenta y cambiar el conjunto en el mismo UPDATE también se rechaza', async () => {
      await expect(
        q(`UPDATE GATEWAY_CHECKPOINT SET cuenta = 'renombrada@demo.mailflow.test/INBOX', idConjunto = ${CONJ_B} WHERE cuenta = '${CUENTA_A}'`),
      ).rejects.toMatchObject({ number: 50030 });
      expect(await enInicial(CUENTA_A)).toBe(1);
    });

    it('se aceptan los UPDATE que no cambian el conjunto (varias filas)', async () => {
      await q(`UPDATE GATEWAY_CHECKPOINT SET idConjunto = idConjunto, ultimoUid = ultimoUid + 1 WHERE cuenta IN ('${CUENTA_A}', '${CUENTA_B}')`);
      expect(await enInicial(CUENTA_A)).toBe(1);
      expect(await enInicial(CUENTA_B)).toBe(0);
    });
  });
});

describe('0007_conjuntos_y_acceso — CHECK de RETOS_ACCESO y SESIONES', () => {
  const nuevoReto = (correo: string, intentos: number) =>
    q(`INSERT INTO RETOS_ACCESO (idConjunto, correo, codigoHash, existeUsuario, venceEn, reenvioDisponibleEn, intentosFallidos)
       VALUES (${CONJ_SQL}, '${correo}', 0x${'00'.repeat(32)}, 1, DATEADD(MINUTE, 10, SYSUTCDATETIME()), SYSUTCDATETIME(), ${intentos})`);
  const sesion = (byte: string, creada: string, actividad: string, revocada = 'NULL') =>
    q(`INSERT INTO SESIONES (tokenHash, idUsuario, idConjuntoActivo, creadaEn, ultimaActividad, revocadaEn)
       VALUES (0x${byte.repeat(32)}, 1, ${CONJ_SQL}, ${creada}, ${actividad}, ${revocada})`);

  it('intentosFallidos va de 0 a 5', async () => {
    await nuevoReto('cinco@demo.mailflow.test', 5);
    await expect(nuevoReto('seis@demo.mailflow.test', 6)).rejects.toThrow(/CK_Retos_intentos/);
    await expect(
      q(`UPDATE RETOS_ACCESO SET intentosFallidos = intentosFallidos + 1 WHERE correo = 'cinco@demo.mailflow.test'`),
    ).rejects.toThrow(/CK_Retos_intentos/);
  });

  it('venceEn es posterior a reenvioDisponibleEn', async () => {
    const reto = (correo: string, vence: string) =>
      q(`INSERT INTO RETOS_ACCESO (idConjunto, correo, codigoHash, existeUsuario, venceEn, reenvioDisponibleEn)
         VALUES (${CONJ_SQL}, '${correo}', 0x${'00'.repeat(32)}, 1, ${vence}, '2026-01-01T10:01:00')`);
    await reto('vigente@demo.mailflow.test', `'2026-01-01T10:10:00'`);
    await expect(reto('igual@demo.mailflow.test', `'2026-01-01T10:01:00'`)).rejects.toThrow(/CK_Retos_vigencia/);
    await expect(reto('antes@demo.mailflow.test', `'2026-01-01T10:00:00'`)).rejects.toThrow(/CK_Retos_vigencia/);
    await expect(
      q(`UPDATE RETOS_ACCESO SET reenvioDisponibleEn = '2026-01-01T10:20:00' WHERE correo = 'vigente@demo.mailflow.test'`),
    ).rejects.toThrow(/CK_Retos_vigencia/);
  });

  it('ultimaActividad no es anterior a creadaEn', async () => {
    await sesion('31', `'2026-01-01T10:00:00'`, `'2026-01-01T10:00:00'`);
    await expect(sesion('32', `'2026-01-01T10:00:00'`, `'2026-01-01T09:59:59'`)).rejects.toThrow(/CK_Sesiones_actividad/);
    await expect(
      q(`UPDATE SESIONES SET ultimaActividad = '2025-12-31' WHERE tokenHash = 0x${'31'.repeat(32)}`),
    ).rejects.toThrow(/CK_Sesiones_actividad/);
  });

  it('revocadaEn es NULL o no anterior a creadaEn', async () => {
    await sesion('33', `'2026-01-01T10:00:00'`, `'2026-01-01T10:00:00'`, `'2026-01-01T10:00:00'`);
    await expect(
      sesion('34', `'2026-01-01T10:00:00'`, `'2026-01-01T10:00:00'`, `'2026-01-01T09:00:00'`),
    ).rejects.toThrow(/CK_Sesiones_revocada/);
    await expect(
      q(`UPDATE SESIONES SET revocadaEn = '2025-12-31' WHERE tokenHash = 0x${'31'.repeat(32)}`),
    ).rejects.toThrow(/CK_Sesiones_revocada/);
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
      VALUES (${CONJ_SQL}, 'app@demo.mailflow.test', 0x${'11'.repeat(32)}, 0, DATEADD(MINUTE, 10, SYSUTCDATETIME()), SYSUTCDATETIME());
      UPDATE RETOS_ACCESO SET intentosFallidos = 1 WHERE correo = 'app@demo.mailflow.test';
      INSERT INTO SESIONES (tokenHash, idUsuario, idConjuntoActivo) VALUES (0x${'22'.repeat(32)}, 1, ${CONJ_SQL});
      UPDATE SESIONES SET revocadaEn = SYSUTCDATETIME() WHERE tokenHash = 0x${'22'.repeat(32)};
      INSERT INTO USUARIO_CONJUNTOS (idUsuario, idConjunto, rol) VALUES (1, ${CONJ_B}, 'ADMIN');
      UPDATE USUARIO_CONJUNTOS SET activo = 0 WHERE idUsuario = 1 AND idConjunto = ${CONJ_B};`);
  });

  // Crear conjuntos sí se permite desde 0008 (GRANT INSERT ON CONJUNTOS): lo prueba migration0008.test.ts.
  it('no puede borrar retos, sesiones ni membresías', async () => {
    const denegado = /permission was denied|denegado/i;
    await expect(comoApp(`DELETE FROM RETOS_ACCESO`)).rejects.toThrow(denegado);
    await expect(comoApp(`DELETE FROM SESIONES`)).rejects.toThrow(denegado);
    await expect(comoApp(`DELETE FROM USUARIO_CONJUNTOS`)).rejects.toThrow(denegado);
  });
});
