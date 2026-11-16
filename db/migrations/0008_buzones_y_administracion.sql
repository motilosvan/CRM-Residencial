/* =====================================================================
   0008_buzones_y_administracion.sql
   Buzón IMAP por conjunto y administración desde el panel (MailFlow F2–F4).
   - RESIDENTES.activo y columna `version` (concurrencia optimista, como
     SOLICITUDES.version en 0002) en RESIDENTES, USUARIO_CONJUNTOS y CONJUNTOS,
     con CHECK (version >= 1) también en BUZONES_CONJUNTO.
   - BUZONES_CONJUNTO: 1:1 con CONJUNTOS. La contraseña de aplicación se guarda
     cifrada (AES-256-GCM: IV + AuthTag + texto); el error, como código corto.
     Una misma cuenta/carpeta no puede estar activa en dos conjuntos.
   - AUDITORIA_ADMIN: bitácora de solo inserción de las escrituras
     administrativas (THROW 50031 ante UPDATE o DELETE, como TR_Historial_inmutable).
   - Permisos de crm_app: crear conjuntos y actualizar solo sus columnas
     editables (slug, idConjunto y fechaCreacion quedan fijos), escribir
     buzones e insertar auditoría (sin UPDATE ni DELETE).
   Aplica sobre una BD limpia y sobre una con datos (todo es repetible).
   ===================================================================== */

/* ---------- 1. Columnas nuevas: activo y version ---------- */
-- ADD ... NOT NULL con DEFAULT rellena las filas existentes con el valor por defecto.

IF COL_LENGTH('dbo.RESIDENTES', 'activo') IS NULL
    ALTER TABLE dbo.RESIDENTES ADD activo BIT NOT NULL CONSTRAINT DF_Residentes_activo DEFAULT 1;
GO
IF COL_LENGTH('dbo.RESIDENTES', 'version') IS NULL
    ALTER TABLE dbo.RESIDENTES ADD version INT NOT NULL CONSTRAINT DF_Residentes_version DEFAULT 1;
GO
IF COL_LENGTH('dbo.USUARIO_CONJUNTOS', 'version') IS NULL
    ALTER TABLE dbo.USUARIO_CONJUNTOS ADD version INT NOT NULL CONSTRAINT DF_UsuConj_version DEFAULT 1;
GO
IF COL_LENGTH('dbo.CONJUNTOS', 'version') IS NULL
    ALTER TABLE dbo.CONJUNTOS ADD version INT NOT NULL CONSTRAINT DF_Conjuntos_version DEFAULT 1;
GO

/* ---------- 2. BUZONES_CONJUNTO: buzón IMAP de cada conjunto ---------- */

IF OBJECT_ID('dbo.BUZONES_CONJUNTO', 'U') IS NULL
    CREATE TABLE dbo.BUZONES_CONJUNTO (
        idConjunto           INT            NOT NULL CONSTRAINT PK_BuzonesConjunto PRIMARY KEY
                                            CONSTRAINT FK_Buzones_Conjuntos REFERENCES dbo.CONJUNTOS (idConjunto),
        imapHost             VARCHAR(120)   NOT NULL CONSTRAINT DF_Buzones_host DEFAULT 'imap.gmail.com',
        imapPort             INT            NOT NULL CONSTRAINT DF_Buzones_port DEFAULT 993,
        correo               NVARCHAR(320)  NOT NULL,
        contrasenaCifrada    VARBINARY(512) NOT NULL, -- IV (12 B) + AuthTag (16 B) + texto cifrado (AES-256-GCM)
        buzon                NVARCHAR(200)  NOT NULL CONSTRAINT DF_Buzones_buzon DEFAULT N'INBOX',
        diasIniciales        INT            NOT NULL CONSTRAINT DF_Buzones_dias DEFAULT 7,
        marcarLeido          BIT            NOT NULL CONSTRAINT DF_Buzones_leido DEFAULT 0,
        activo               BIT            NOT NULL CONSTRAINT DF_Buzones_activo DEFAULT 1,
        ultimaSincronizacion DATETIME2      NULL,
        ultimoError          VARCHAR(40)    NULL,     -- código corto (p. ej. 'AUTENTICACION'), nunca un mensaje
        version              INT            NOT NULL CONSTRAINT DF_Buzones_version DEFAULT 1,
        actualizadoEn        DATETIME2      NOT NULL CONSTRAINT DF_Buzones_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Buzones_port CHECK (imapPort BETWEEN 1 AND 65535),
        CONSTRAINT CK_Buzones_dias CHECK (diasIniciales BETWEEN 0 AND 365),
        CONSTRAINT CK_Buzones_cifrado CHECK (DATALENGTH(contrasenaCifrada) > 28)  -- IV + tag + al menos 1 byte
    );
GO

/* ---------- 2b. version >= 1, como CK_Solicitudes_version (0002) ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Residentes_version')
    ALTER TABLE dbo.RESIDENTES WITH CHECK ADD CONSTRAINT CK_Residentes_version CHECK (version >= 1);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_UsuConj_version')
    ALTER TABLE dbo.USUARIO_CONJUNTOS WITH CHECK ADD CONSTRAINT CK_UsuConj_version CHECK (version >= 1);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Conjuntos_version')
    ALTER TABLE dbo.CONJUNTOS WITH CHECK ADD CONSTRAINT CK_Conjuntos_version CHECK (version >= 1);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Buzones_version')
    ALTER TABLE dbo.BUZONES_CONJUNTO WITH CHECK ADD CONSTRAINT CK_Buzones_version CHECK (version >= 1);
GO

-- El checkpoint T6 se indexa por cuenta = correo/buzon y TR_Checkpoint_conjunto_fijo (0007) fija su
-- conjunto: una misma cuenta/carpeta activa en dos conjuntos mezclaría sus correos.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Buzones_cuenta_activa' AND object_id = OBJECT_ID('dbo.BUZONES_CONJUNTO'))
    CREATE UNIQUE INDEX UX_Buzones_cuenta_activa ON dbo.BUZONES_CONJUNTO (correo, buzon) WHERE activo = 1;
GO

/* ---------- 3. AUDITORIA_ADMIN: bitácora de solo inserción ---------- */

IF OBJECT_ID('dbo.AUDITORIA_ADMIN', 'U') IS NULL
    CREATE TABLE dbo.AUDITORIA_ADMIN (
        idAuditoria BIGINT IDENTITY(1,1) CONSTRAINT PK_AuditoriaAdmin PRIMARY KEY,
        idConjunto  INT           NOT NULL CONSTRAINT FK_AudAdmin_Conjuntos REFERENCES dbo.CONJUNTOS (idConjunto),
        idUsuario   INT           NULL     CONSTRAINT FK_AudAdmin_Usuarios  REFERENCES dbo.USUARIOS (idUsuario), -- actor; NULL = sistema (semilla, gateway)
        entidad     VARCHAR(20)   NOT NULL,
        idEntidad   INT           NOT NULL,
        accion      VARCHAR(30)   NOT NULL,
        detalle     NVARCHAR(400) NULL,   -- qué cambió, sin secretos ni datos personales
        fecha       DATETIME2     NOT NULL CONSTRAINT DF_AudAdmin_fecha DEFAULT SYSUTCDATETIME(),
        -- Binario, como CK_UsuConj_rol (0007): la collation CI dejaría pasar 'usuario'.
        CONSTRAINT CK_AudAdmin_entidad CHECK (entidad COLLATE Latin1_General_BIN2 IN ('USUARIO', 'RESIDENTE', 'CONJUNTO', 'BUZON')),
        CONSTRAINT CK_AudAdmin_accion  CHECK (accion  COLLATE Latin1_General_BIN2 IN
            ('CREAR', 'ACTUALIZAR', 'ACTIVAR', 'DESACTIVAR', 'CAMBIAR_ROL', 'CONECTAR', 'DESCONECTAR', 'VINCULAR'))
    );
GO

-- Lectura por conjunto, de lo más reciente a lo más antiguo. También cubre FK_AudAdmin_Conjuntos.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AudAdmin_conjunto_fecha' AND object_id = OBJECT_ID('dbo.AUDITORIA_ADMIN'))
    CREATE INDEX IX_AudAdmin_conjunto_fecha ON dbo.AUDITORIA_ADMIN (idConjunto, fecha DESC, idAuditoria DESC);
GO

-- Misma técnica que TR_Historial_inmutable (0002): INSTEAD OF rechaza también al migrador (sa),
-- que no está sujeto a los DENY de crm_app.
CREATE OR ALTER TRIGGER dbo.TR_AuditoriaAdmin_inmutable
ON dbo.AUDITORIA_ADMIN
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 50031, 'AUDITORIA_ADMIN es de solo inserción: no se permite UPDATE ni DELETE.', 1;
END;
GO

/* ---------- 4. Permisos de la aplicación ---------- */
-- CONJUNTOS: UPDATE solo por columna; slug, idConjunto y fechaCreacion no son actualizables.
-- DELETE y ALTER siguen denegados por esquema (0005).

GRANT INSERT ON dbo.CONJUNTOS TO crm_app;
GRANT UPDATE (nombre, logoUrl, colorPrimario, colorAcento, colorSecundario, activo, version) ON dbo.CONJUNTOS TO crm_app;
GRANT INSERT, UPDATE ON dbo.BUZONES_CONJUNTO TO crm_app;
GRANT INSERT ON dbo.AUDITORIA_ADMIN TO crm_app;
GO

DENY UPDATE, DELETE ON dbo.AUDITORIA_ADMIN TO crm_app;
GO
