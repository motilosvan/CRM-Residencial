/* =====================================================================
   0004_invariantes_y_texto.sql  (resultado de la auditoría)
   - Un correo, exactamente una solicitud: índice ÚNICO sobre SOLICITUDES.idCorreo.
   - Las reglas de estado pasan a la BD (trigger): transiciones válidas, ASIGNADA
     con responsable vigente, estado final <=> fechaCierre, alta solo en NUEVA,
     un estado final no se modifica, y ninguna transición sale de un estado final.
   - Nombres de catálogo y roles canónicos (MAYÚSCULAS exactas): la collation CI
     permitía 'asignada' y saltarse reglas que el código compara en binario.
   - Texto del correo en NVARCHAR: con VARCHAR (cp1252) emojis/CJK quedaban en '?'.
   - messageId sensible a mayúsculas (BIN2): los Message-ID distinguen mayúsculas.
   - CHECK del checkpoint IMAP, índices de FK faltantes y limpieza de ESTADOS.fecha.
   ===================================================================== */

/* ---------- 1. Catálogos y roles canónicos ---------- */

UPDATE dbo.ESTADOS     SET nombre = UPPER(LTRIM(RTRIM(nombre))) WHERE nombre COLLATE Latin1_General_BIN2 <> UPPER(LTRIM(RTRIM(nombre)));
UPDATE dbo.CATEGORIAS  SET nombre = UPPER(LTRIM(RTRIM(nombre))) WHERE nombre COLLATE Latin1_General_BIN2 <> UPPER(LTRIM(RTRIM(nombre)));
UPDATE dbo.PRIORIDADES SET nombre = UPPER(LTRIM(RTRIM(nombre))) WHERE nombre COLLATE Latin1_General_BIN2 <> UPPER(LTRIM(RTRIM(nombre)));
UPDATE dbo.USUARIOS    SET rol    = UPPER(LTRIM(RTRIM(rol)))    WHERE rol    COLLATE Latin1_General_BIN2 <> UPPER(LTRIM(RTRIM(rol)));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Estados_nombre_canonico')
    ALTER TABLE dbo.ESTADOS ADD CONSTRAINT CK_Estados_nombre_canonico
        CHECK (nombre COLLATE Latin1_General_BIN2 = UPPER(nombre) COLLATE Latin1_General_BIN2
               AND DATALENGTH(nombre) = DATALENGTH(LTRIM(RTRIM(nombre))));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Categorias_nombre_canonico')
    ALTER TABLE dbo.CATEGORIAS ADD CONSTRAINT CK_Categorias_nombre_canonico
        CHECK (nombre COLLATE Latin1_General_BIN2 = UPPER(nombre) COLLATE Latin1_General_BIN2
               AND DATALENGTH(nombre) = DATALENGTH(LTRIM(RTRIM(nombre))));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Prioridades_nombre_canonico')
    ALTER TABLE dbo.PRIORIDADES ADD CONSTRAINT CK_Prioridades_nombre_canonico
        CHECK (nombre COLLATE Latin1_General_BIN2 = UPPER(nombre) COLLATE Latin1_General_BIN2
               AND DATALENGTH(nombre) = DATALENGTH(LTRIM(RTRIM(nombre))));
GO

-- El CHECK de 0002 comparaba con la collation CI: 'soporte' pasaba. Se recrea en binario.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Usuarios_rol'
            AND definition NOT LIKE '%BIN2%')
    ALTER TABLE dbo.USUARIOS DROP CONSTRAINT CK_Usuarios_rol;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Usuarios_rol')
    ALTER TABLE dbo.USUARIOS ADD CONSTRAINT CK_Usuarios_rol
        CHECK (rol COLLATE Latin1_General_BIN2 IN ('ADMIN', 'SOPORTE')
               AND DATALENGTH(rol) = DATALENGTH(LTRIM(RTRIM(rol))));
GO

/* ---------- 2. Texto Unicode (NVARCHAR) ---------- */
-- system_type_id 167 = varchar. Solo se altera lo que aún es VARCHAR: la migración es repetible.

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CORREOS') AND name = 'remitente' AND system_type_id = 167)
    ALTER TABLE dbo.CORREOS ALTER COLUMN remitente NVARCHAR(320) NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CORREOS') AND name = 'asunto' AND system_type_id = 167)
    ALTER TABLE dbo.CORREOS ALTER COLUMN asunto NVARCHAR(500) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CORREOS') AND name = 'cuerpo' AND system_type_id = 167)
    ALTER TABLE dbo.CORREOS ALTER COLUMN cuerpo NVARCHAR(MAX) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.SOLICITUDES') AND name = 'descripcion' AND system_type_id = 167)
    ALTER TABLE dbo.SOLICITUDES ALTER COLUMN descripcion NVARCHAR(MAX) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RESIDENTES') AND name = 'nombre' AND system_type_id = 167)
    ALTER TABLE dbo.RESIDENTES ALTER COLUMN nombre NVARCHAR(100) NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.USUARIOS') AND name = 'nombre' AND system_type_id = 167)
    ALTER TABLE dbo.USUARIOS ALTER COLUMN nombre NVARCHAR(100) NOT NULL;
GO

-- Las columnas de correo electrónico tienen índice único: se suelta, se cambia el tipo y se recrea.
-- El remitente de CORREOS se compara contra estas columnas: deben ser del mismo tipo (si no, Index Scan).
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RESIDENTES') AND name = 'correo' AND system_type_id = 167)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Residentes_correo' AND object_id = OBJECT_ID('dbo.RESIDENTES'))
        DROP INDEX UX_Residentes_correo ON dbo.RESIDENTES;
    ALTER TABLE dbo.RESIDENTES ALTER COLUMN correo NVARCHAR(320) NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Residentes_correo' AND object_id = OBJECT_ID('dbo.RESIDENTES'))
    CREATE UNIQUE INDEX UX_Residentes_correo ON dbo.RESIDENTES (correo) WHERE correo IS NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.USUARIOS') AND name = 'correo' AND system_type_id = 167)
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Usuarios_correo' AND object_id = OBJECT_ID('dbo.USUARIOS'))
        DROP INDEX UX_Usuarios_correo ON dbo.USUARIOS;
    ALTER TABLE dbo.USUARIOS ALTER COLUMN correo NVARCHAR(320) NOT NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Usuarios_correo' AND object_id = OBJECT_ID('dbo.USUARIOS'))
    CREATE UNIQUE INDEX UX_Usuarios_correo ON dbo.USUARIOS (correo);
GO

/* ---------- 3. messageId sensible a mayúsculas ---------- */

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CORREOS') AND name = 'messageId'
             AND collation_name <> 'Latin1_General_100_BIN2')
BEGIN
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Correos_messageId' AND object_id = OBJECT_ID('dbo.CORREOS'))
        DROP INDEX UX_Correos_messageId ON dbo.CORREOS;
    ALTER TABLE dbo.CORREOS ALTER COLUMN messageId NVARCHAR(255) COLLATE Latin1_General_100_BIN2 NOT NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Correos_messageId' AND object_id = OBJECT_ID('dbo.CORREOS'))
    CREATE UNIQUE INDEX UX_Correos_messageId ON dbo.CORREOS (messageId);
GO

/* ---------- 4. Un correo, exactamente una solicitud ---------- */

IF EXISTS (SELECT 1 FROM dbo.SOLICITUDES GROUP BY idCorreo HAVING COUNT(*) > 1)
    THROW 50010, 'Hay correos con varias solicitudes: depúrelos antes de aplicar 0004.', 1;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Solicitudes_idCorreo' AND object_id = OBJECT_ID('dbo.SOLICITUDES'))
    CREATE UNIQUE INDEX UX_Solicitudes_idCorreo ON dbo.SOLICITUDES (idCorreo);
GO
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Solicitudes_idCorreo' AND object_id = OBJECT_ID('dbo.SOLICITUDES'))
    DROP INDEX IX_Solicitudes_idCorreo ON dbo.SOLICITUDES;
GO

/* ---------- 5. Checkpoint IMAP ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Checkpoint_valores')
    ALTER TABLE dbo.GATEWAY_CHECKPOINT ADD CONSTRAINT CK_Checkpoint_valores
        CHECK (uidValidity > 0 AND ultimoUid >= 0);
GO

/* ---------- 6. Índices: FK sin índice y uno redundante ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Asignaciones_asignadaPor' AND object_id = OBJECT_ID('dbo.ASIGNACIONES'))
    CREATE INDEX IX_Asignaciones_asignadaPor ON dbo.ASIGNACIONES (asignadaPor);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Historial_idUsuario' AND object_id = OBJECT_ID('dbo.HISTORIAL_ESTADOS'))
    CREATE INDEX IX_Historial_idUsuario ON dbo.HISTORIAL_ESTADOS (idUsuario);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Transiciones_destino' AND object_id = OBJECT_ID('dbo.TRANSICIONES_ESTADO'))
    CREATE INDEX IX_Transiciones_destino ON dbo.TRANSICIONES_ESTADO (idEstadoDestino);
GO
-- IX_Solicitudes_idEstado es prefijo de IX_Solicitudes_bandeja (idEstado, idPrioridad, fechaCreacion).
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Solicitudes_idEstado' AND object_id = OBJECT_ID('dbo.SOLICITUDES'))
    DROP INDEX IX_Solicitudes_idEstado ON dbo.SOLICITUDES;
GO

/* ---------- 7. ESTADOS.fecha: no pertenece a un catálogo y nadie la usa ---------- */

IF COL_LENGTH('dbo.ESTADOS', 'fecha') IS NOT NULL
    ALTER TABLE dbo.ESTADOS DROP COLUMN fecha;
GO

/* ---------- 8. Reglas de estado en la BD ---------- */

-- Ninguna transición puede salir de un estado final.
CREATE OR ALTER TRIGGER dbo.TR_Transiciones_sin_salida_final
ON dbo.TRANSICIONES_ESTADO
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.ESTADOS e ON e.idEstado = i.idEstadoOrigen WHERE e.esFinal = 1)
        THROW 50025, 'Un estado final no puede tener transiciones de salida.', 1;
END;
GO

-- Las reglas del ciclo de vida se cumplen aunque alguien escriba SQL directo.
CREATE OR ALTER TRIGGER dbo.TR_Solicitudes_integridad
ON dbo.SOLICITUDES
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;

    -- Un estado final no se modifica (ni su estado ni sus datos).
    IF EXISTS (SELECT 1 FROM deleted d JOIN dbo.ESTADOS e ON e.idEstado = d.idEstado WHERE e.esFinal = 1)
        THROW 50024, 'Una solicitud en estado final no se puede modificar.', 1;

    -- Toda solicitud nace en NUEVA.
    IF EXISTS (SELECT 1 FROM inserted i
                 LEFT JOIN deleted d ON d.idSolicitud = i.idSolicitud
                 JOIN dbo.ESTADOS e ON e.idEstado = i.idEstado
                WHERE d.idSolicitud IS NULL AND e.nombre <> 'NUEVA')
        THROW 50020, 'Una solicitud nueva debe crearse en estado NUEVA.', 1;

    -- Solo transiciones declaradas en TRANSICIONES_ESTADO.
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.idSolicitud = i.idSolicitud
                WHERE i.idEstado <> d.idEstado
                  AND NOT EXISTS (SELECT 1 FROM dbo.TRANSICIONES_ESTADO t
                                   WHERE t.idEstadoOrigen = d.idEstado AND t.idEstadoDestino = i.idEstado))
        THROW 50021, 'Transición de estado no permitida (ver TRANSICIONES_ESTADO).', 1;

    -- ASIGNADA exige un responsable vigente.
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.ESTADOS e ON e.idEstado = i.idEstado
                WHERE e.nombre = 'ASIGNADA'
                  AND NOT EXISTS (SELECT 1 FROM dbo.ASIGNACIONES a
                                   WHERE a.idSolicitud = i.idSolicitud AND a.liberadaEn IS NULL))
        THROW 50022, 'Una solicitud ASIGNADA debe tener un responsable vigente.', 1;

    -- fechaCierre existe si y solo si el estado es final.
    IF EXISTS (SELECT 1 FROM inserted i JOIN dbo.ESTADOS e ON e.idEstado = i.idEstado
                WHERE (e.esFinal = 1 AND i.fechaCierre IS NULL) OR (e.esFinal = 0 AND i.fechaCierre IS NOT NULL))
        THROW 50023, 'fechaCierre debe existir solo en un estado final.', 1;
END;
GO
