import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrate.js';
import { dropTempDb, runSql, tempDbConfig } from '../../test/helpers/testDb.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const baselinePath = path.join(root, 'ScriptBaseDatosCRM.sql');
const realMigrations = path.join(root, 'db', 'migrations');

const config = tempDbConfig('CorreosCRM_m0002');
let emptyDir: string;

const q = <T = Record<string, unknown>>(s: string) => runSql<T>(config, s);

beforeAll(async () => {
  emptyDir = await mkdtemp(path.join(os.tmpdir(), 'crm-empty-'));

  // 1) BD en el estado de la línea base, con datos "legados" que la migración debe conservar.
  await migrate({ config, baselinePath, migrationsDir: emptyDir });
  await q(`
    INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES ('Ana', 'T1-101', 'ana@mail.com');
    INSERT INTO USUARIOS (nombre, rol, correo) VALUES ('Luis', 'Administrador', 'luis@conjunto.com'), ('Eva', 'soporte', 'eva@conjunto.com');
    INSERT INTO CATEGORIAS (nombre) VALUES ('Mantenimiento');
    INSERT INTO ESTADOS (nombre) VALUES ('Nueva');
    INSERT INTO CORREOS (idResidente, remitente, asunto) VALUES (1, 'ana@mail.com', 'Fuga'), (1, 'ana@mail.com', 'Cuota');
    INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, prioridad) VALUES (1, 1, 1, 'alta'), (2, 1, 1, 'rarísima');
    INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, fechaAsignacion) VALUES (1, 1, '2026-01-01'), (1, 2, '2026-01-02');
  `);

  // 2) Se aplica la migración real sobre esos datos.
  await migrate({ config, baselinePath, migrationsDir: realMigrations });
});

afterAll(async () => {
  await rm(emptyDir, { recursive: true, force: true });
  await dropTempDb(config);
});

describe('0002_integridad — migración de datos existentes', () => {
  it('asigna messageId sintético y único a los correos previos', async () => {
    const rows = await q<{ messageId: string }>('SELECT messageId FROM CORREOS ORDER BY idCorreo');
    expect(rows.map((r) => r.messageId)).toEqual(['legacy-1@soc-crm.local', 'legacy-2@soc-crm.local']);
  });

  it('convierte la prioridad en texto a FK y elimina la columna vieja', async () => {
    const rows = await q<{ nombre: string }>(
      `SELECT p.nombre FROM SOLICITUDES s JOIN PRIORIDADES p ON p.idPrioridad = s.idPrioridad ORDER BY s.idSolicitud`,
    );
    expect(rows.map((r) => r.nombre)).toEqual(['ALTA', 'MEDIA']);
    const col = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID('SOLICITUDES') AND name = 'prioridad'`);
    expect(col[0]?.n).toBe(0);
  });

  it('normaliza los roles', async () => {
    const rows = await q<{ rol: string }>('SELECT rol FROM USUARIOS ORDER BY idUsuario');
    expect(rows.map((r) => r.rol)).toEqual(['ADMIN', 'SOPORTE']);
  });

  it('deja una sola asignación vigente (la más reciente) y conserva la anterior', async () => {
    const rows = await q<{ idUsuario: number; vigente: number }>(
      `SELECT idUsuario, CASE WHEN liberadaEn IS NULL THEN 1 ELSE 0 END AS vigente FROM ASIGNACIONES ORDER BY fechaAsignacion`,
    );
    expect(rows).toEqual([
      { idUsuario: 1, vigente: 0 },
      { idUsuario: 2, vigente: 1 },
    ]);
  });

  it('crea historial inicial para cada solicitud y versión 1', async () => {
    const h = await q<{ n: number }>('SELECT COUNT(*) AS n FROM HISTORIAL_ESTADOS WHERE idEstadoAnterior IS NULL');
    expect(h[0]?.n).toBe(2);
    const v = await q<{ version: number }>('SELECT version FROM SOLICITUDES');
    expect(v.every((r) => r.version === 1)).toBe(true);
  });

  it('siembra catálogos y las 6 transiciones sin duplicar el estado preexistente', async () => {
    const estados = await q<{ nombre: string; esFinal: boolean }>('SELECT nombre, esFinal FROM ESTADOS ORDER BY idEstado');
    expect(estados.map((e) => e.nombre.toUpperCase())).toEqual(['NUEVA', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'CERRADA']);
    expect(estados.filter((e) => e.esFinal).map((e) => e.nombre)).toEqual(['CERRADA']);
    const t = await q<{ n: number }>('SELECT COUNT(*) AS n FROM TRANSICIONES_ESTADO');
    expect(t[0]?.n).toBe(6);
    const p = await q<{ nombre: string; slaHoras: number }>('SELECT nombre, slaHoras FROM PRIORIDADES ORDER BY peso DESC');
    expect(p).toEqual([
      { nombre: 'ALTA', slaHoras: 4 },
      { nombre: 'MEDIA', slaHoras: 24 },
      { nombre: 'BAJA', slaHoras: 72 },
    ]);
  });

  it('cambia los defaults de fecha a UTC', async () => {
    const rows = await q<{ definition: string }>(
      `SELECT dc.definition FROM sys.default_constraints dc
        WHERE dc.parent_object_id IN (OBJECT_ID('CORREOS'), OBJECT_ID('SOLICITUDES'), OBJECT_ID('NOTIFICACIONES'), OBJECT_ID('ASIGNACIONES'))
          AND dc.definition LIKE '%date%'`,
    );
    expect(rows.length).toBe(4);
    expect(rows.every((r) => /sysutcdatetime/i.test(r.definition))).toBe(true);
  });

  it('es idempotente: una segunda ejecución no cambia nada', async () => {
    const res = await migrate({ config, baselinePath, migrationsDir: realMigrations });
    expect(res.aplicadas).toEqual([]);
  });
});

describe('0002_integridad — garantías de la BD (smoke; la matriz completa es S1-05)', () => {
  it('rechaza un messageId repetido', async () => {
    await expect(
      q(`INSERT INTO CORREOS (remitente, messageId) VALUES ('x@y.com', 'legacy-1@soc-crm.local')`),
    ).rejects.toThrow(/UX_Correos_messageId|duplicate/i);
  });

  it('acepta un correo de remitente desconocido (idResidente NULL)', async () => {
    await q(`INSERT INTO CORREOS (idResidente, remitente, messageId) VALUES (NULL, 'nuevo@y.com', 'abc@x')`);
  });

  it('rechaza una segunda asignación vigente', async () => {
    await expect(
      q(`INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (1, 1, 1)`),
    ).rejects.toThrow(/UX_Asignaciones_vigente|duplicate/i);
  });

  it('rechaza UPDATE y DELETE sobre el historial', async () => {
    await expect(q(`UPDATE HISTORIAL_ESTADOS SET comentario = 'x'`)).rejects.toThrow(/solo inserción/);
    await expect(q(`DELETE FROM HISTORIAL_ESTADOS`)).rejects.toThrow(/solo inserción/);
  });

  it('rechaza un rol inválido, una prioridad inexistente y una transición a sí mismo', async () => {
    await expect(q(`INSERT INTO USUARIOS (nombre, rol, correo) VALUES ('X', 'ROOT', 'r@x.com')`)).rejects.toThrow(/CK_Usuarios_rol/);
    await expect(q(`UPDATE SOLICITUDES SET idPrioridad = 999 WHERE idSolicitud = 1`)).rejects.toThrow(/FK_Solicitudes_Prioridades/);
    await expect(q(`INSERT INTO TRANSICIONES_ESTADO VALUES (1, 1)`)).rejects.toThrow(/CK_Transiciones_distintos|PK_Transiciones/);
  });
});
