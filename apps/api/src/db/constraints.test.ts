import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './migrate.js';
import { dropTempDb, runSql, tempDbConfig } from '../../test/helpers/testDb.js';

/**
 * S1-05 — Matriz de constraints. Cada regla de integridad del modelo tiene una
 * prueba que demuestra que la BD rechaza la operación inválida (sin ayuda del código).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const config = tempDbConfig('CorreosCRM_cons');
const q = <T = Record<string, unknown>>(s: string) => runSql<T>(config, s);

beforeAll(async () => {
  await migrate({
    config,
    baselinePath: path.join(root, 'ScriptBaseDatosCRM.sql'),
    migrationsDir: path.join(root, 'db', 'migrations'),
  });
  // Estado base: 1 residente, 2 usuarios, 1 correo, 1 solicitud NUEVA con 1 asignación vigente y su historial.
  await q(`
    INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES ('Ana', 'T1-101', 'ana@mail.com');
    INSERT INTO USUARIOS (nombre, rol, correo) VALUES ('Admin', 'ADMIN', 'admin@c.com'), ('Soporte', 'SOPORTE', 'soporte@c.com');
    INSERT INTO CORREOS (idResidente, remitente, messageId) VALUES (1, 'ana@mail.com', 'm1');
    INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) VALUES (1, 1, 1, 1);
    INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (1, 2, 1);
    INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoAnterior, idEstadoNuevo, idUsuario) VALUES (1, NULL, 1, NULL);
  `);
});

afterAll(async () => {
  await dropTempDb(config);
});

type Case = [descripcion: string, sentencia: string, restriccion: RegExp];

const foreignKeys: Case[] = [
  ['CORREOS → RESIDENTES', `INSERT INTO CORREOS (idResidente, remitente, messageId) VALUES (999, 'x', 'fk1')`, /FK_Correos_Residentes/],
  ['SOLICITUDES → CORREOS', `INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) VALUES (999, 1, 1, 1)`, /FK_Solicitudes_Correos/],
  ['SOLICITUDES → CATEGORIAS', `DECLARE @c INT; INSERT INTO CORREOS (remitente, messageId) VALUES ('x', 'fk-cat'); SET @c = SCOPE_IDENTITY(); INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) VALUES (@c, 999, 1, 1)`, /FK_Solicitudes_Categorias/],
  ['SOLICITUDES → ESTADOS', `DECLARE @c INT; INSERT INTO CORREOS (remitente, messageId) VALUES ('x', 'fk-est'); SET @c = SCOPE_IDENTITY(); INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) VALUES (@c, 1, 999, 1)`, /FK_Solicitudes_Estados/],
  ['SOLICITUDES → PRIORIDADES', `UPDATE SOLICITUDES SET idPrioridad = 999 WHERE idSolicitud = 1`, /FK_Solicitudes_Prioridades/],
  ['ASIGNACIONES → SOLICITUDES', `INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (999, 1, 1)`, /FK_Asignaciones_Solicitudes/],
  ['ASIGNACIONES → USUARIOS (responsable)', `INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor, liberadaEn) VALUES (1, 999, 1, SYSUTCDATETIME())`, /FK_Asignaciones_Usuarios/],
  ['ASIGNACIONES → USUARIOS (asignadaPor)', `INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor, liberadaEn) VALUES (1, 1, 999, SYSUTCDATETIME())`, /FK_Asignaciones_AsignadaPor/],
  ['HISTORIAL → SOLICITUDES', `INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoNuevo) VALUES (999, 1)`, /FK_Historial_Solicitudes/],
  ['HISTORIAL → ESTADOS (nuevo)', `INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoNuevo) VALUES (1, 999)`, /FK_Historial_EstadoNuevo/],
  ['HISTORIAL → ESTADOS (anterior)', `INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoAnterior, idEstadoNuevo) VALUES (1, 999, 1)`, /FK_Historial_EstadoAnt/],
  ['HISTORIAL → USUARIOS', `INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoNuevo, idUsuario) VALUES (1, 1, 999)`, /FK_Historial_Usuarios/],
  ['NOTIFICACIONES → SOLICITUDES', `INSERT INTO NOTIFICACIONES (idSolicitud, mensaje) VALUES (999, 'x')`, /FK_Notificaciones_Solicitudes/],
  ['REPORTES → USUARIOS', `INSERT INTO REPORTES (idUsuario, periodo) VALUES (999, '2026-10')`, /FK_Reportes_Usuarios/],
  ['TRANSICIONES → ESTADOS (origen)', `INSERT INTO TRANSICIONES_ESTADO VALUES (999, 1)`, /FK_Transiciones_Origen/],
  ['TRANSICIONES → ESTADOS (destino)', `INSERT INTO TRANSICIONES_ESTADO VALUES (1, 999)`, /FK_Transiciones_Destino/],
];

const checks: Case[] = [
  ['version debe ser ≥ 1', `UPDATE SOLICITUDES SET version = 0 WHERE idSolicitud = 1`, /CK_Solicitudes_version/],
  ['fechaCierre no puede ser anterior a la creación', `UPDATE SOLICITUDES SET fechaCierre = '2000-01-01' WHERE idSolicitud = 1`, /CK_Solicitudes_fechas/],
  ['primeraRespuesta no puede ser anterior a la creación', `UPDATE SOLICITUDES SET primeraRespuesta = '2000-01-01' WHERE idSolicitud = 1`, /CK_Solicitudes_fechas/],
  ['slaHoras debe ser > 0', `INSERT INTO PRIORIDADES (nombre, peso, slaHoras) VALUES ('X', 9, 0)`, /CK_Prioridades_sla/],
  ['liberadaEn no puede ser anterior a la asignación', `UPDATE ASIGNACIONES SET liberadaEn = '2000-01-01' WHERE idAsignacion = 1`, /CK_Asignaciones_fechas/],
  ['rol limitado a ADMIN/SOPORTE', `INSERT INTO USUARIOS (nombre, rol, correo) VALUES ('X', 'ROOT', 'root@c.com')`, /CK_Usuarios_rol/],
  ['una transición no puede ser de un estado a sí mismo', `INSERT INTO TRANSICIONES_ESTADO VALUES (1, 1)`, /CK_Transiciones_distintos/],
];

const uniques: Case[] = [
  ['CORREOS.messageId único (idempotencia)', `INSERT INTO CORREOS (remitente, messageId) VALUES ('x', 'm1')`, /UX_Correos_messageId/],
  ['RESIDENTES.correo único', `INSERT INTO RESIDENTES (nombre, unidad, correo) VALUES ('Otra', 'T2-1', 'ana@mail.com')`, /UX_Residentes_correo/],
  ['USUARIOS.correo único', `INSERT INTO USUARIOS (nombre, rol, correo) VALUES ('Otro', 'ADMIN', 'admin@c.com')`, /UX_Usuarios_correo/],
  ['CATEGORIAS.nombre único', `INSERT INTO CATEGORIAS (nombre) VALUES ('SEGURIDAD')`, /UX_Categorias_nombre/],
  ['ESTADOS.nombre único', `INSERT INTO ESTADOS (nombre) VALUES ('NUEVA')`, /UX_Estados_nombre/],
  ['PRIORIDADES.nombre único', `INSERT INTO PRIORIDADES (nombre, peso, slaHoras) VALUES ('ALTA', 9, 1)`, /UQ_Prioridades_nombre/],
  ['PRIORIDADES.peso único', `INSERT INTO PRIORIDADES (nombre, peso, slaHoras) VALUES ('OTRA', 3, 1)`, /UQ_Prioridades_peso/],
  ['TRANSICIONES sin duplicados', `INSERT INTO TRANSICIONES_ESTADO VALUES (1, 2)`, /PK_Transiciones/],
  ['una sola asignación vigente por solicitud', `INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (1, 1, 1)`, /UX_Asignaciones_vigente/],
];

const notNull: Case[] = [
  ['CORREOS.messageId obligatorio', `INSERT INTO CORREOS (remitente) VALUES ('x')`, /messageId/],
  ['SOLICITUDES.idPrioridad obligatoria', `INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado) VALUES (1, 1, 1)`, /idPrioridad/],
  ['ASIGNACIONES.asignadaPor obligatorio', `INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, liberadaEn) VALUES (1, 1, SYSUTCDATETIME())`, /asignadaPor/],
  ['HISTORIAL.idEstadoNuevo obligatorio', `INSERT INTO HISTORIAL_ESTADOS (idSolicitud) VALUES (1)`, /idEstadoNuevo/],
];

const noBorrarEnUso: Case[] = [
  ['no se borra una categoría en uso', `DELETE FROM CATEGORIAS WHERE idCategoria = 1`, /FK_Solicitudes_Categorias/],
  ['no se borra un estado en uso', `DELETE FROM ESTADOS WHERE idEstado = 1`, /FK_Solicitudes_Estados/],
  ['no se borra una prioridad en uso', `DELETE FROM PRIORIDADES WHERE idPrioridad = 1`, /FK_Solicitudes_Prioridades/],
  ['no se borra un usuario con asignaciones', `DELETE FROM USUARIOS WHERE idUsuario = 2`, /FK_Asignaciones_Usuarios/],
  ['no se borra una solicitud con asignaciones o historial', `DELETE FROM SOLICITUDES WHERE idSolicitud = 1`, /FK_Asignaciones_Solicitudes|FK_Historial_Solicitudes/],
  ['no se borra un correo que originó una solicitud', `DELETE FROM CORREOS WHERE idCorreo = 1`, /FK_Solicitudes_Correos/],
];

describe('S1-05 · la BD rechaza operaciones inválidas', () => {
  describe.each([
    ['claves foráneas', foreignKeys],
    ['CHECK', checks],
    ['unicidad', uniques],
    ['NOT NULL', notNull],
    ['protección de datos en uso', noBorrarEnUso],
  ] as const)('%s', (_grupo, casos) => {
    it.each(casos)('%s', async (_desc, sentencia, restriccion) => {
      await expect(q(sentencia)).rejects.toThrow(restriccion);
    });
  });

  describe('historial inmutable', () => {
    it('rechaza UPDATE', async () => {
      await expect(q(`UPDATE HISTORIAL_ESTADOS SET comentario = 'manipulado'`)).rejects.toThrow(/solo inserción/);
    });
    it('rechaza DELETE', async () => {
      await expect(q(`DELETE FROM HISTORIAL_ESTADOS`)).rejects.toThrow(/solo inserción/);
    });
    it('rechaza UPDATE y DELETE incluso con filtro por una fila', async () => {
      await expect(q(`UPDATE HISTORIAL_ESTADOS SET idEstadoNuevo = 2 WHERE idHistorial = 1`)).rejects.toThrow(/solo inserción/);
      await expect(q(`DELETE FROM HISTORIAL_ESTADOS WHERE idHistorial = 1`)).rejects.toThrow(/solo inserción/);
    });
    it('el historial quedó intacto tras los intentos', async () => {
      const r = await q<{ n: number; c: string | null }>(`SELECT COUNT(*) AS n, MAX(comentario) AS c FROM HISTORIAL_ESTADOS`);
      expect(r[0]).toEqual({ n: 1, c: null });
    });
  });
});

describe('S1-05 · la BD acepta las operaciones válidas que el diseño exige permitir', () => {
  it('un correo de remitente desconocido (idResidente NULL), varios a la vez', async () => {
    await q(`INSERT INTO CORREOS (idResidente, remitente, messageId) VALUES (NULL, 'a@x.com', 'n1'), (NULL, 'b@x.com', 'n2')`);
  });

  it('varios residentes sin correo (el índice único ignora NULL)', async () => {
    await q(`INSERT INTO RESIDENTES (nombre, unidad) VALUES ('S1', 'A-1'), ('S2', 'A-2')`);
  });

  it('un nuevo registro de historial', async () => {
    await q(`INSERT INTO HISTORIAL_ESTADOS (idSolicitud, idEstadoAnterior, idEstadoNuevo, idUsuario) VALUES (1, 1, 2, 1)`);
  });

  it('reasignar: liberar la vigente y crear otra; el historial de asignaciones se conserva', async () => {
    await q(`
      UPDATE ASIGNACIONES SET liberadaEn = SYSUTCDATETIME() WHERE idSolicitud = 1 AND liberadaEn IS NULL;
      INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (1, 1, 1);
    `);
    const r = await q<{ total: number; vigentes: number }>(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN liberadaEn IS NULL THEN 1 ELSE 0 END) AS vigentes FROM ASIGNACIONES WHERE idSolicitud = 1`,
    );
    expect(r[0]).toEqual({ total: 2, vigentes: 1 });
  });

  it('las fechas que escribe el sistema son DATETIME2 (sin redondeo que rompa los CHECK de fechas)', async () => {
    const r = await q<{ tabla: string; columna: string; tipo: string }>(
      `SELECT OBJECT_NAME(c.object_id) AS tabla, c.name AS columna, t.name AS tipo
         FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
        WHERE (OBJECT_NAME(c.object_id) = 'CORREOS' AND c.name = 'fechaRecepcion')
           OR (OBJECT_NAME(c.object_id) = 'SOLICITUDES' AND c.name = 'fechaCreacion')
           OR (OBJECT_NAME(c.object_id) = 'NOTIFICACIONES' AND c.name = 'fechaEnvio')
           OR (OBJECT_NAME(c.object_id) = 'ASIGNACIONES' AND c.name = 'fechaAsignacion')`,
    );
    expect(r).toHaveLength(4);
    expect(r.every((x) => x.tipo === 'datetime2')).toBe(true);
  });

  it('liberar una asignación inmediatamente después de crearla nunca viola el CHECK (500 repeticiones)', async () => {
    await q(`
      UPDATE ASIGNACIONES SET liberadaEn = SYSUTCDATETIME() WHERE idSolicitud = 1 AND liberadaEn IS NULL;
      DECLARE @i INT = 0;
      WHILE @i < 500
      BEGIN
        INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (1, 1, 1);
        UPDATE ASIGNACIONES SET liberadaEn = SYSUTCDATETIME() WHERE idSolicitud = 1 AND liberadaEn IS NULL;
        SET @i += 1;
      END
      INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (1, 2, 1);  -- deja una vigente
    `);
    const r = await q<{ vigentes: number }>(
      `SELECT COUNT(*) AS vigentes FROM ASIGNACIONES WHERE idSolicitud = 1 AND liberadaEn IS NULL`,
    );
    expect(r[0]?.vigentes).toBe(1);
  });

  it('cada solicitud puede tener su propia asignación vigente', async () => {
    // Las identidades de los INSERT fallidos anteriores no se reutilizan: se toma el id real.
    await q(`
      DECLARE @sol INT, @correo INT = (SELECT idCorreo FROM CORREOS WHERE messageId = 'n1');
      INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) VALUES (@correo, 2, 1, 2);
      SET @sol = SCOPE_IDENTITY();
      INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (@sol, 2, 1);
    `);
  });

  it('las transiciones válidas del modelo existen y CERRADA no tiene salidas', async () => {
    const r = await q<{ origen: string; destino: string }>(
      `SELECT o.nombre AS origen, d.nombre AS destino
         FROM TRANSICIONES_ESTADO t JOIN ESTADOS o ON o.idEstado = t.idEstadoOrigen JOIN ESTADOS d ON d.idEstado = t.idEstadoDestino
        ORDER BY o.idEstado, d.idEstado`,
    );
    expect(r.map((x) => `${x.origen}>${x.destino}`)).toEqual([
      'NUEVA>ASIGNADA',
      'ASIGNADA>NUEVA',
      'ASIGNADA>EN_PROCESO',
      'EN_PROCESO>RESUELTA',
      'RESUELTA>EN_PROCESO',
      'RESUELTA>CERRADA',
    ]);
    expect(r.some((x) => x.origen === 'CERRADA')).toBe(false);
  });
});

describe('Auditoria · reglas del ciclo de vida garantizadas por la BD (trigger TR_Solicitudes_integridad)', () => {
  /** Crea correo + solicitud NUEVA por SQL directo y devuelve el id de la solicitud. */
  async function solicitudDirecta(tag: string): Promise<number> {
    const r = await q<{ id: number }>(`
      DECLARE @c INT;
      INSERT INTO CORREOS (remitente, messageId) VALUES ('x@y.com', '${tag}');
      SET @c = SCOPE_IDENTITY();
      INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad)
        SELECT @c, 1, idEstado, 1 FROM ESTADOS WHERE nombre = 'NUEVA';
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS id;`);
    return r[0]!.id;
  }
  const est = (n: string) => `(SELECT idEstado FROM ESTADOS WHERE nombre = '${n}')`;

  it('un correo no puede originar dos solicitudes (UX_Solicitudes_idCorreo)', async () => {
    await expect(q(`INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) VALUES (1, 1, ${est('NUEVA')}, 1)`))
      .rejects.toThrow(/UX_Solicitudes_idCorreo/);
  });

  it('una solicitud debe nacer en NUEVA', async () => {
    await expect(q(`
      DECLARE @c INT; INSERT INTO CORREOS (remitente, messageId) VALUES ('x@y.com', 'nace-mal'); SET @c = SCOPE_IDENTITY();
      INSERT INTO SOLICITUDES (idCorreo, idCategoria, idEstado, idPrioridad) VALUES (@c, 1, ${est('EN_PROCESO')}, 1);`))
      .rejects.toThrow(/debe crearse en estado NUEVA/);
  });

  it('un UPDATE directo no puede saltar NUEVA → CERRADA', async () => {
    const id = await solicitudDirecta('salto-1');
    await expect(q(`UPDATE SOLICITUDES SET idEstado = ${est('CERRADA')}, fechaCierre = SYSUTCDATETIME() WHERE idSolicitud = ${id}`))
      .rejects.toThrow(/Transición de estado no permitida/);
  });

  it('un UPDATE directo no puede dejar una solicitud ASIGNADA sin responsable vigente', async () => {
    const id = await solicitudDirecta('asig-sin-resp');
    await expect(q(`UPDATE SOLICITUDES SET idEstado = ${est('ASIGNADA')} WHERE idSolicitud = ${id}`))
      .rejects.toThrow(/ASIGNADA debe tener un responsable vigente/);
  });

  it('fechaCierre solo puede existir en un estado final', async () => {
    const id = await solicitudDirecta('cierre-falso');
    await expect(q(`UPDATE SOLICITUDES SET fechaCierre = SYSUTCDATETIME() WHERE idSolicitud = ${id}`))
      .rejects.toThrow(/fechaCierre debe existir solo en un estado final/);
  });

  it('el ciclo completo válido por SQL directo funciona, y una solicitud CERRADA ya no se puede modificar', async () => {
    const id = await solicitudDirecta('ciclo-ok');
    await q(`
      INSERT INTO ASIGNACIONES (idSolicitud, idUsuario, asignadaPor) VALUES (${id}, 2, 1);
      UPDATE SOLICITUDES SET idEstado = ${est('ASIGNADA')} WHERE idSolicitud = ${id};
      UPDATE SOLICITUDES SET idEstado = ${est('EN_PROCESO')} WHERE idSolicitud = ${id};
      UPDATE SOLICITUDES SET idEstado = ${est('RESUELTA')} WHERE idSolicitud = ${id};
      UPDATE SOLICITUDES SET idEstado = ${est('CERRADA')}, fechaCierre = SYSUTCDATETIME() WHERE idSolicitud = ${id};`);
    await expect(q(`UPDATE SOLICITUDES SET idPrioridad = 2 WHERE idSolicitud = ${id}`)).rejects.toThrow(/estado final no se puede modificar/);
    await expect(q(`UPDATE SOLICITUDES SET idEstado = ${est('EN_PROCESO')}, fechaCierre = NULL WHERE idSolicitud = ${id}`))
      .rejects.toThrow(/estado final no se puede modificar/);
  });

  it('ninguna transición puede salir de un estado final (TR_Transiciones_sin_salida_final)', async () => {
    await expect(q(`INSERT INTO TRANSICIONES_ESTADO VALUES (${est('CERRADA')}, ${est('NUEVA')})`)).rejects.toThrow(/estado final no puede tener transiciones/);
  });
});

describe('Auditoria · catálogos canónicos, texto Unicode y checkpoint', () => {
  it('rechaza nombres de catálogo y roles que no son MAYÚSCULAS exactas (la collation CI los aceptaba)', async () => {
    await expect(q(`INSERT INTO USUARIOS (nombre, rol, correo) VALUES ('X', 'soporte', 'min@c.com')`)).rejects.toThrow(/CK_Usuarios_rol/);
    await expect(q(`INSERT INTO USUARIOS (nombre, rol, correo) VALUES ('X', 'ADMIN ', 'esp@c.com')`)).rejects.toThrow(/CK_Usuarios_rol/);
    await expect(q(`INSERT INTO ESTADOS (nombre) VALUES ('pendiente')`)).rejects.toThrow(/CK_Estados_nombre_canonico/);
    await expect(q(`INSERT INTO CATEGORIAS (nombre) VALUES ('Reservas')`)).rejects.toThrow(/CK_Categorias_nombre_canonico/);
    await expect(q(`INSERT INTO PRIORIDADES (nombre, peso, slaHoras) VALUES ('Critica', 9, 1)`)).rejects.toThrow(/CK_Prioridades_nombre_canonico/);
  });

  it('messageId distingue mayúsculas: <AbC@h> y <abc@h> son correos distintos', async () => {
    await q(`INSERT INTO CORREOS (remitente, messageId) VALUES ('x@y.com', N'<AbC@h>'), ('x@y.com', N'<abc@h>')`);
    await expect(q(`INSERT INTO CORREOS (remitente, messageId) VALUES ('x@y.com', N'<AbC@h>')`)).rejects.toThrow(/UX_Correos_messageId/);
  });

  it('asunto y cuerpo conservan emojis y caracteres no latinos (NVARCHAR)', async () => {
    await q(`INSERT INTO CORREOS (remitente, messageId, asunto, cuerpo) VALUES (N'ñandú@correo.co', N'<uni@h>', N'Fuga 🚰 en 公寓 — €', N'Señor 😀 ąę ж')`);
    const r = await q<{ asunto: string; cuerpo: string; remitente: string }>(`SELECT asunto, cuerpo, remitente FROM CORREOS WHERE messageId = N'<uni@h>'`);
    expect(r[0]).toEqual({ asunto: 'Fuga 🚰 en 公寓 — €', cuerpo: 'Señor 😀 ąę ж', remitente: 'ñandú@correo.co' });
  });

  it('el checkpoint IMAP no admite valores negativos ni UIDVALIDITY 0', async () => {
    await expect(q(`INSERT INTO GATEWAY_CHECKPOINT (cuenta, uidValidity, ultimoUid) VALUES ('a', -5, -10)`)).rejects.toThrow(/CK_Checkpoint_valores/);
    await expect(q(`INSERT INTO GATEWAY_CHECKPOINT (cuenta, uidValidity, ultimoUid) VALUES ('b', 0, 1)`)).rejects.toThrow(/CK_Checkpoint_valores/);
  });
});
