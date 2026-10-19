/* =====================================================================
   0002_integridad.sql
   Convierte la línea base en un modelo transaccional auditable.
   - Idempotencia de ingesta (CORREOS.messageId único)
   - Catálogos con integridad (PRIORIDADES, TRANSICIONES_ESTADO)
   - Control de concurrencia (SOLICITUDES.version)
   - Una sola asignación vigente por solicitud (índice único filtrado)
   - Historial de estados inmutable (HISTORIAL_ESTADOS + trigger)
   - Checkpoint del Email Gateway (GATEWAY_CHECKPOINT)
   Aplica sobre una BD limpia y sobre una con datos de la línea base.
   ===================================================================== */

/* ---------- CORREOS: idempotencia y remitentes desconocidos ---------- */

IF COL_LENGTH('dbo.CORREOS', 'messageId') IS NULL
    ALTER TABLE dbo.CORREOS ADD messageId NVARCHAR(255) NULL;
GO

IF COL_LENGTH('dbo.CORREOS', 'imapUid') IS NULL
    ALTER TABLE dbo.CORREOS ADD imapUid BIGINT NULL;
GO

-- Correos previos a esta migración no tienen Message-ID real: se les asigna uno sintético.
UPDATE dbo.CORREOS
   SET messageId = CONCAT(N'legacy-', idCorreo, N'@soc-crm.local')
 WHERE messageId IS NULL;
GO

ALTER TABLE dbo.CORREOS ALTER COLUMN messageId NVARCHAR(255) NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Correos_messageId' AND object_id = OBJECT_ID('dbo.CORREOS'))
    CREATE UNIQUE INDEX UX_Correos_messageId ON dbo.CORREOS (messageId);
GO

-- Un remitente desconocido no debe impedir registrar el correo.
ALTER TABLE dbo.CORREOS ALTER COLUMN idResidente INT NULL;
GO

/* ---------- Unicidad de claves naturales ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Residentes_correo' AND object_id = OBJECT_ID('dbo.RESIDENTES'))
    CREATE UNIQUE INDEX UX_Residentes_correo ON dbo.RESIDENTES (correo) WHERE correo IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Usuarios_correo' AND object_id = OBJECT_ID('dbo.USUARIOS'))
    CREATE UNIQUE INDEX UX_Usuarios_correo ON dbo.USUARIOS (correo);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Categorias_nombre' AND object_id = OBJECT_ID('dbo.CATEGORIAS'))
    CREATE UNIQUE INDEX UX_Categorias_nombre ON dbo.CATEGORIAS (nombre);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Estados_nombre' AND object_id = OBJECT_ID('dbo.ESTADOS'))
    CREATE UNIQUE INDEX UX_Estados_nombre ON dbo.ESTADOS (nombre);
GO

/* ---------- USUARIOS: credenciales y roles ---------- */

IF COL_LENGTH('dbo.USUARIOS', 'passwordHash') IS NULL
    ALTER TABLE dbo.USUARIOS ADD passwordHash VARCHAR(255) NULL;  -- NULL = aún sin contraseña: no puede iniciar sesión
GO

IF COL_LENGTH('dbo.USUARIOS', 'activo') IS NULL
    ALTER TABLE dbo.USUARIOS ADD activo BIT NOT NULL CONSTRAINT DF_Usuarios_activo DEFAULT 1;
GO

UPDATE dbo.USUARIOS SET rol = UPPER(LTRIM(RTRIM(rol)));
UPDATE dbo.USUARIOS SET rol = 'ADMIN' WHERE rol IN ('ADMINISTRADOR', 'ADMIN');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Usuarios_rol')
    ALTER TABLE dbo.USUARIOS ADD CONSTRAINT CK_Usuarios_rol CHECK (rol IN ('ADMIN', 'SOPORTE'));
GO

/* ---------- ESTADOS: marca de estado final y semillas ---------- */

IF COL_LENGTH('dbo.ESTADOS', 'esFinal') IS NULL
    ALTER TABLE dbo.ESTADOS ADD esFinal BIT NOT NULL CONSTRAINT DF_Estados_esFinal DEFAULT 0;
GO

INSERT INTO dbo.ESTADOS (nombre, esFinal)
SELECT v.nombre, v.esFinal
  FROM (VALUES ('NUEVA', 0), ('ASIGNADA', 0), ('EN_PROCESO', 0), ('RESUELTA', 0), ('CERRADA', 1)) AS v(nombre, esFinal)
 WHERE NOT EXISTS (SELECT 1 FROM dbo.ESTADOS e WHERE e.nombre = v.nombre);
GO

UPDATE dbo.ESTADOS SET esFinal = 1 WHERE nombre = 'CERRADA';
GO

/* ---------- CATEGORIAS: semillas ---------- */

INSERT INTO dbo.CATEGORIAS (nombre)
SELECT v.nombre
  FROM (VALUES ('MANTENIMIENTO'), ('ADMINISTRATIVO'), ('FACTURACION'), ('SEGURIDAD'), ('SIN_CLASIFICAR')) AS v(nombre)
 WHERE NOT EXISTS (SELECT 1 FROM dbo.CATEGORIAS c WHERE c.nombre = v.nombre);
GO

/* ---------- PRIORIDADES: catálogo con SLA ---------- */

IF OBJECT_ID('dbo.PRIORIDADES', 'U') IS NULL
    CREATE TABLE dbo.PRIORIDADES (
        idPrioridad INT IDENTITY(1,1) CONSTRAINT PK_Prioridades PRIMARY KEY,
        nombre      VARCHAR(20) NOT NULL CONSTRAINT UQ_Prioridades_nombre UNIQUE,
        peso        TINYINT     NOT NULL CONSTRAINT UQ_Prioridades_peso UNIQUE,  -- mayor = más urgente
        slaHoras    INT         NOT NULL CONSTRAINT CK_Prioridades_sla CHECK (slaHoras > 0)
    );
GO

INSERT INTO dbo.PRIORIDADES (nombre, peso, slaHoras)
SELECT v.nombre, v.peso, v.slaHoras
  FROM (VALUES ('ALTA', 3, 4), ('MEDIA', 2, 24), ('BAJA', 1, 72)) AS v(nombre, peso, slaHoras)
 WHERE NOT EXISTS (SELECT 1 FROM dbo.PRIORIDADES p WHERE p.nombre = v.nombre);
GO

/* ---------- SOLICITUDES: prioridad con FK, concurrencia y métricas ---------- */

IF COL_LENGTH('dbo.SOLICITUDES', 'idPrioridad') IS NULL
    ALTER TABLE dbo.SOLICITUDES ADD idPrioridad INT NULL;
GO

-- Migra el texto libre previo; lo no reconocido queda como MEDIA.
IF COL_LENGTH('dbo.SOLICITUDES', 'prioridad') IS NOT NULL
    EXEC (N'UPDATE s
               SET idPrioridad = COALESCE(
                     (SELECT p.idPrioridad FROM dbo.PRIORIDADES p WHERE p.nombre = UPPER(LTRIM(RTRIM(s.prioridad)))),
                     (SELECT p.idPrioridad FROM dbo.PRIORIDADES p WHERE p.nombre = ''MEDIA''))
              FROM dbo.SOLICITUDES s
             WHERE s.idPrioridad IS NULL');
GO

UPDATE dbo.SOLICITUDES
   SET idPrioridad = (SELECT idPrioridad FROM dbo.PRIORIDADES WHERE nombre = 'MEDIA')
 WHERE idPrioridad IS NULL;
GO

ALTER TABLE dbo.SOLICITUDES ALTER COLUMN idPrioridad INT NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Solicitudes_Prioridades')
    ALTER TABLE dbo.SOLICITUDES ADD CONSTRAINT FK_Solicitudes_Prioridades
        FOREIGN KEY (idPrioridad) REFERENCES dbo.PRIORIDADES (idPrioridad);
GO

-- Fuente única de verdad: el texto libre se elimina.
IF COL_LENGTH('dbo.SOLICITUDES', 'prioridad') IS NOT NULL
    ALTER TABLE dbo.SOLICITUDES DROP COLUMN prioridad;
GO

IF COL_LENGTH('dbo.SOLICITUDES', 'version') IS NULL
    ALTER TABLE dbo.SOLICITUDES ADD version INT NOT NULL CONSTRAINT DF_Solicitudes_version DEFAULT 1;
GO

IF COL_LENGTH('dbo.SOLICITUDES', 'primeraRespuesta') IS NULL
    ALTER TABLE dbo.SOLICITUDES ADD primeraRespuesta DATETIME2 NULL;
GO

IF COL_LENGTH('dbo.SOLICITUDES', 'fechaCierre') IS NULL
    ALTER TABLE dbo.SOLICITUDES ADD fechaCierre DATETIME2 NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Solicitudes_version')
    ALTER TABLE dbo.SOLICITUDES ADD CONSTRAINT CK_Solicitudes_version CHECK (version >= 1);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Solicitudes_fechas')
    ALTER TABLE dbo.SOLICITUDES ADD CONSTRAINT CK_Solicitudes_fechas
        CHECK ((fechaCierre IS NULL OR fechaCierre >= fechaCreacion)
           AND (primeraRespuesta IS NULL OR primeraRespuesta >= fechaCreacion));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Solicitudes_bandeja' AND object_id = OBJECT_ID('dbo.SOLICITUDES'))
    CREATE INDEX IX_Solicitudes_bandeja ON dbo.SOLICITUDES (idEstado, idPrioridad, fechaCreacion);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Solicitudes_idPrioridad' AND object_id = OBJECT_ID('dbo.SOLICITUDES'))
    CREATE INDEX IX_Solicitudes_idPrioridad ON dbo.SOLICITUDES (idPrioridad);
GO

/* ---------- TRANSICIONES_ESTADO: la máquina de estados como datos ---------- */

IF OBJECT_ID('dbo.TRANSICIONES_ESTADO', 'U') IS NULL
    CREATE TABLE dbo.TRANSICIONES_ESTADO (
        idEstadoOrigen  INT NOT NULL CONSTRAINT FK_Transiciones_Origen  REFERENCES dbo.ESTADOS (idEstado),
        idEstadoDestino INT NOT NULL CONSTRAINT FK_Transiciones_Destino REFERENCES dbo.ESTADOS (idEstado),
        CONSTRAINT PK_Transiciones PRIMARY KEY (idEstadoOrigen, idEstadoDestino),
        CONSTRAINT CK_Transiciones_distintos CHECK (idEstadoOrigen <> idEstadoDestino)
    );
GO

-- NUEVA→ASIGNADA→EN_PROCESO→RESUELTA→CERRADA; reabrir RESUELTA→EN_PROCESO; desasignar ASIGNADA→NUEVA.
INSERT INTO dbo.TRANSICIONES_ESTADO (idEstadoOrigen, idEstadoDestino)
SELECT o.idEstado, d.idEstado
  FROM (VALUES ('NUEVA', 'ASIGNADA'), ('ASIGNADA', 'EN_PROCESO'), ('EN_PROCESO', 'RESUELTA'),
               ('RESUELTA', 'CERRADA'), ('RESUELTA', 'EN_PROCESO'), ('ASIGNADA', 'NUEVA')) AS t(origen, destino)
  JOIN dbo.ESTADOS o ON o.nombre = t.origen
  JOIN dbo.ESTADOS d ON d.nombre = t.destino
 WHERE NOT EXISTS (SELECT 1 FROM dbo.TRANSICIONES_ESTADO x
                    WHERE x.idEstadoOrigen = o.idEstado AND x.idEstadoDestino = d.idEstado);
GO

/* ---------- ASIGNACIONES: una sola vigente por solicitud ---------- */

IF COL_LENGTH('dbo.ASIGNACIONES', 'liberadaEn') IS NULL
    ALTER TABLE dbo.ASIGNACIONES ADD liberadaEn DATETIME2 NULL;  -- NULL = vigente
GO

IF COL_LENGTH('dbo.ASIGNACIONES', 'asignadaPor') IS NULL
    ALTER TABLE dbo.ASIGNACIONES ADD asignadaPor INT NULL;
GO

UPDATE dbo.ASIGNACIONES SET asignadaPor = idUsuario WHERE asignadaPor IS NULL;
GO

ALTER TABLE dbo.ASIGNACIONES ALTER COLUMN asignadaPor INT NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Asignaciones_AsignadaPor')
    ALTER TABLE dbo.ASIGNACIONES ADD CONSTRAINT FK_Asignaciones_AsignadaPor
        FOREIGN KEY (asignadaPor) REFERENCES dbo.USUARIOS (idUsuario);
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Asignaciones_fechas')
    ALTER TABLE dbo.ASIGNACIONES ADD CONSTRAINT CK_Asignaciones_fechas
        CHECK (liberadaEn IS NULL OR liberadaEn >= fechaAsignacion);
GO

-- Datos previos: si una solicitud tenía varias asignaciones, solo la más reciente sigue vigente.
UPDATE a
   SET liberadaEn = SYSUTCDATETIME()
  FROM dbo.ASIGNACIONES a
 WHERE a.liberadaEn IS NULL
   AND EXISTS (SELECT 1 FROM dbo.ASIGNACIONES b
                WHERE b.idSolicitud = a.idSolicitud
                  AND b.liberadaEn IS NULL
                  AND (b.fechaAsignacion > a.fechaAsignacion
                       OR (b.fechaAsignacion = a.fechaAsignacion AND b.idAsignacion > a.idAsignacion)));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Asignaciones_vigente' AND object_id = OBJECT_ID('dbo.ASIGNACIONES'))
    CREATE UNIQUE INDEX UX_Asignaciones_vigente ON dbo.ASIGNACIONES (idSolicitud) WHERE liberadaEn IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Asignaciones_usuario_vigente' AND object_id = OBJECT_ID('dbo.ASIGNACIONES'))
    CREATE INDEX IX_Asignaciones_usuario_vigente ON dbo.ASIGNACIONES (idUsuario) WHERE liberadaEn IS NULL;
GO

/* ---------- HISTORIAL_ESTADOS: trazabilidad inmutable ---------- */

IF OBJECT_ID('dbo.HISTORIAL_ESTADOS', 'U') IS NULL
    CREATE TABLE dbo.HISTORIAL_ESTADOS (
        idHistorial      BIGINT IDENTITY(1,1) CONSTRAINT PK_HistorialEstados PRIMARY KEY,
        idSolicitud      INT NOT NULL CONSTRAINT FK_Historial_Solicitudes REFERENCES dbo.SOLICITUDES (idSolicitud),
        idEstadoAnterior INT NULL     CONSTRAINT FK_Historial_EstadoAnt   REFERENCES dbo.ESTADOS (idEstado),  -- NULL en la creación
        idEstadoNuevo    INT NOT NULL CONSTRAINT FK_Historial_EstadoNuevo REFERENCES dbo.ESTADOS (idEstado),
        idUsuario        INT NULL     CONSTRAINT FK_Historial_Usuarios    REFERENCES dbo.USUARIOS (idUsuario),  -- NULL = el sistema
        comentario       NVARCHAR(500) NULL,
        fecha            DATETIME2 NOT NULL CONSTRAINT DF_Historial_fecha DEFAULT SYSUTCDATETIME()
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Historial_solicitud' AND object_id = OBJECT_ID('dbo.HISTORIAL_ESTADOS'))
    CREATE INDEX IX_Historial_solicitud ON dbo.HISTORIAL_ESTADOS (idSolicitud, fecha);
GO

-- Solo inserción: cualquier UPDATE o DELETE se rechaza.
CREATE OR ALTER TRIGGER dbo.TR_Historial_inmutable
ON dbo.HISTORIAL_ESTADOS
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50001, 'HISTORIAL_ESTADOS es de solo inserción: no se permite UPDATE ni DELETE.', 1;
END;
GO

-- Solicitudes previas a esta migración: se registra su estado actual como punto de partida.
INSERT INTO dbo.HISTORIAL_ESTADOS (idSolicitud, idEstadoAnterior, idEstadoNuevo, idUsuario, comentario, fecha)
SELECT s.idSolicitud, NULL, s.idEstado, NULL, N'Estado inicial registrado al migrar', SYSUTCDATETIME()
  FROM dbo.SOLICITUDES s
 WHERE NOT EXISTS (SELECT 1 FROM dbo.HISTORIAL_ESTADOS h WHERE h.idSolicitud = s.idSolicitud);
GO

/* ---------- GATEWAY_CHECKPOINT: avance de lectura IMAP ---------- */

IF OBJECT_ID('dbo.GATEWAY_CHECKPOINT', 'U') IS NULL
    CREATE TABLE dbo.GATEWAY_CHECKPOINT (
        cuenta        NVARCHAR(255) NOT NULL CONSTRAINT PK_GatewayCheckpoint PRIMARY KEY,
        uidValidity   BIGINT NOT NULL,
        ultimoUid     BIGINT NOT NULL CONSTRAINT DF_Checkpoint_uid DEFAULT 0,
        actualizadoEn DATETIME2 NOT NULL CONSTRAINT DF_Checkpoint_fecha DEFAULT SYSUTCDATETIME()
    );
GO

/* ---------- Fechas por defecto en UTC ---------- */
-- La línea base usa GETDATE() (hora local del servidor). Los defaults nuevos usan UTC.
-- Los datos ya existentes conservan su valor original.

DECLARE @objetivos TABLE (tabla SYSNAME, columna SYSNAME);
INSERT INTO @objetivos VALUES ('CORREOS', 'fechaRecepcion'), ('SOLICITUDES', 'fechaCreacion'),
                              ('NOTIFICACIONES', 'fechaEnvio'), ('ASIGNACIONES', 'fechaAsignacion');

DECLARE @tabla SYSNAME, @columna SYSNAME, @df SYSNAME, @ddl NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT tabla, columna FROM @objetivos;
OPEN cur;
FETCH NEXT FROM cur INTO @tabla, @columna;
WHILE @@FETCH_STATUS = 0
BEGIN
    SET @df = NULL;
    SELECT @df = dc.name
      FROM sys.default_constraints dc
      JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
     WHERE dc.parent_object_id = OBJECT_ID('dbo.' + @tabla)
       AND c.name = @columna
       AND dc.definition LIKE '%getdate()%';

    IF @df IS NOT NULL
    BEGIN
        SET @ddl = N'ALTER TABLE dbo.' + QUOTENAME(@tabla) + N' DROP CONSTRAINT ' + QUOTENAME(@df)
                 + N'; ALTER TABLE dbo.' + QUOTENAME(@tabla) + N' ADD CONSTRAINT '
                 + QUOTENAME(N'DF_' + @tabla + N'_' + @columna + N'_utc')
                 + N' DEFAULT SYSUTCDATETIME() FOR ' + QUOTENAME(@columna) + N';';
        EXEC (@ddl);
    END;
    FETCH NEXT FROM cur INTO @tabla, @columna;
END;
CLOSE cur;
DEALLOCATE cur;
GO
