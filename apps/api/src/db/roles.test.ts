import { randomBytes } from 'node:crypto';
import type sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSql, setupTestDb, type TestDb } from '../../test/helpers/testDb.js';
import { ingestarCorreo } from '../modules/ingesta.js';
import { crearPool } from './pool.js';
import { asegurarUsuarioApp } from './usuarioApp.js';

/**
 * El rol crm_app (0005) es lo que vuelve reales las garantías: con `sa` cualquiera puede desactivar
 * el trigger del historial o vaciar tablas. Aquí se conecta como la aplicación y se intenta.
 */
let db: TestDb;
let app: sql.ConnectionPool;
const login = `soc_test_${randomBytes(4).toString('hex')}`;
const password = `Aa1-${randomBytes(18).toString('base64url')}`;

beforeAll(async () => {
  db = await setupTestDb('CorreosCRM_roles');
  await asegurarUsuarioApp(db.config, db.config.database, login, password);
  app = await crearPool({ ...db.config, user: login, password });
});

afterAll(async () => {
  await app?.close();
  await db?.close();
  await runSql({ ...db.config, database: 'master' }, `IF SUSER_ID('${login}') IS NOT NULL DROP LOGIN [${login}]`);
});

const comoApp = (s: string) => app.request().query(s);

describe('rol crm_app (mínimo privilegio)', () => {
  it('asegurarUsuarioApp es idempotente', async () => {
    await asegurarUsuarioApp(db.config, db.config.database, login, password);
  });

  it('la aplicación puede operar: T1 completa con su propia identidad', async () => {
    const r = await ingestarCorreo(app, { messageId: '<rol-1>', remitente: 'a@b.com', asunto: 'Robo', checkpoint: { cuenta: 'c', uidValidity: 1, uid: 1 } });
    expect(r.duplicado).toBe(false);
  });

  it('no puede modificar ni borrar el historial (DENY, antes incluso del trigger)', async () => {
    await expect(comoApp(`UPDATE HISTORIAL_ESTADOS SET comentario = 'x'`)).rejects.toThrow(/permission was denied|denegado/i);
    await expect(comoApp(`DELETE FROM HISTORIAL_ESTADOS`)).rejects.toThrow(/permission was denied|denegado/i);
  });

  it('no puede TRUNCATE, DISABLE TRIGGER, ALTER TABLE ni borrar filas', async () => {
    await expect(comoApp(`TRUNCATE TABLE HISTORIAL_ESTADOS`)).rejects.toThrow();
    await expect(comoApp(`DISABLE TRIGGER TR_Historial_inmutable ON HISTORIAL_ESTADOS`)).rejects.toThrow();
    await expect(comoApp(`ALTER TABLE CORREOS ADD hack INT NULL`)).rejects.toThrow();
    await expect(comoApp(`DELETE FROM CORREOS`)).rejects.toThrow(/permission was denied|denegado/i);
    await expect(comoApp(`DROP TABLE GATEWAY_CHECKPOINT`)).rejects.toThrow();
  });

  it('no puede leer ni alterar el registro de migraciones', async () => {
    await expect(comoApp(`SELECT * FROM __MIGRACIONES`)).rejects.toThrow(/permission was denied|denegado/i);
  });

  it('los DENY ganan aunque alguien le dé al usuario roles amplios (db_datawriter, db_ddladmin)', async () => {
    // Error típico de operación: "dale más permisos para que funcione". En SQL Server un DENY gana sobre
    // cualquier GRANT, así que el historial y el esquema siguen protegidos.
    await db.q(`ALTER ROLE db_datawriter ADD MEMBER [${login}]; ALTER ROLE db_ddladmin ADD MEMBER [${login}];`);
    try {
      await expect(comoApp(`UPDATE HISTORIAL_ESTADOS SET comentario = 'x'`)).rejects.toThrow(/permission was denied|denegado/i);
      await expect(comoApp(`DELETE FROM HISTORIAL_ESTADOS`)).rejects.toThrow(/permission was denied|denegado/i);
      await expect(comoApp(`DELETE FROM CORREOS`)).rejects.toThrow(/permission was denied|denegado/i);
      await expect(comoApp(`TRUNCATE TABLE HISTORIAL_ESTADOS`)).rejects.toThrow();
      await expect(comoApp(`DISABLE TRIGGER TR_Historial_inmutable ON HISTORIAL_ESTADOS`)).rejects.toThrow();
      await expect(comoApp(`ALTER TABLE CORREOS ADD hack INT NULL`)).rejects.toThrow();
    } finally {
      await db.q(`ALTER ROLE db_datawriter DROP MEMBER [${login}]; ALTER ROLE db_ddladmin DROP MEMBER [${login}];`);
    }
  });

  it('nada de lo anterior tuvo efecto', async () => {
    const r = await db.q<{ n: number }>(`SELECT COUNT(*) AS n FROM HISTORIAL_ESTADOS`);
    expect(r[0]?.n).toBe(1);
    expect(await db.q(`SELECT 1 AS x FROM sys.triggers WHERE name = 'TR_Historial_inmutable' AND is_disabled = 0`)).toHaveLength(1);
  });
});
