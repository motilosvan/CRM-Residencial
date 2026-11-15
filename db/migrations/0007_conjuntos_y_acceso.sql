/* =====================================================================
   0007_conjuntos_y_acceso.sql
   Modelo multi-conjunto y acceso por código (MailFlow B1).
   - CONJUNTOS con el conjunto inicial (Parque Central de Occidente).
   - USUARIO_CONJUNTOS: membresía con su propio rol (manda sobre USUARIOS.rol,
     que queda heredada). Los usuarios existentes pasan al conjunto inicial.
   - idConjunto NOT NULL (sin DEFAULT) en RESIDENTES, CORREOS y
     GATEWAY_CHECKPOINT; las filas existentes quedan en el conjunto inicial.
   - Unicidad por conjunto (correo del residente, messageId) y FK compuesta
     CORREOS(idConjunto, idResidente) para no cruzar residentes entre conjuntos.
   - RETOS_ACCESO (OTP hasheado) y SESIONES (token hasheado): sin DELETE.
   - Trigger: responsable y quien asigna con membresía activa en el conjunto.
   - Triggers: un correo o un residente no cambia de conjunto y una solicitud
     no cambia de correo (THROW 50027, 50028, 50029).
   Aplica sobre una BD limpia y sobre una con datos (todo es repetible).
   ===================================================================== */

/* ---------- 1. CONJUNTOS y el conjunto inicial ---------- */

IF OBJECT_ID('dbo.CONJUNTOS', 'U') IS NULL
    CREATE TABLE dbo.CONJUNTOS (
        idConjunto      INT IDENTITY(1,1) CONSTRAINT PK_Conjuntos PRIMARY KEY,
        slug            VARCHAR(80)   NOT NULL CONSTRAINT UQ_Conjuntos_slug UNIQUE,
        nombre          NVARCHAR(120) NOT NULL,
        logoUrl         NVARCHAR(500) NULL,
        colorPrimario   CHAR(7)       NULL,
        colorAcento     CHAR(7)       NULL,
        colorSecundario CHAR(7)       NULL,
        activo          BIT           NOT NULL CONSTRAINT DF_Conjuntos_activo DEFAULT 1,
        fechaCreacion   DATETIME2     NOT NULL CONSTRAINT DF_Conjuntos_fecha DEFAULT SYSUTCDATETIME(),
        -- #RRGGBB o NULL (CHAR(7) rellena con espacios: '#FFF' no pasa). En binario: con la
        -- collation CI, letras acentuadas como 'á' caen dentro del rango [A-Fa-f].
        CONSTRAINT CK_Conjuntos_colorPrimario
            CHECK (colorPrimario IS NULL OR colorPrimario COLLATE Latin1_General_100_BIN2 LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        CONSTRAINT CK_Conjuntos_colorAcento
            CHECK (colorAcento IS NULL OR colorAcento COLLATE Latin1_General_100_BIN2 LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        CONSTRAINT CK_Conjuntos_colorSecundario
            CHECK (colorSecundario IS NULL OR colorSecundario COLLATE Latin1_General_100_BIN2 LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]')
    );
GO

INSERT INTO dbo.CONJUNTOS (slug, nombre, colorPrimario, colorAcento, colorSecundario)
SELECT 'parque-central-occidente', N'Parque Central de Occidente', '#355E3B', '#D6A64F', '#789653'
 WHERE NOT EXISTS (SELECT 1 FROM dbo.CONJUNTOS WHERE slug = 'parque-central-occidente');
GO

/* ---------- 2. USUARIO_CONJUNTOS: membresías ---------- */

IF OBJECT_ID('dbo.USUARIO_CONJUNTOS', 'U') IS NULL
    CREATE TABLE dbo.USUARIO_CONJUNTOS (
        idUsuario   INT         NOT NULL CONSTRAINT FK_UsuConj_Usuarios  REFERENCES dbo.USUARIOS (idUsuario),
        idConjunto  INT         NOT NULL CONSTRAINT FK_UsuConj_Conjuntos REFERENCES dbo.CONJUNTOS (idConjunto),
        rol         VARCHAR(30) NOT NULL,
        activo      BIT         NOT NULL CONSTRAINT DF_UsuConj_activo DEFAULT 1,
        fechaAlta   DATETIME2   NOT NULL CONSTRAINT DF_UsuConj_fecha  DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_UsuarioConjuntos PRIMARY KEY (idUsuario, idConjunto),
        -- Binario, como CK_Usuarios_rol (0004): la collation CI dejaría pasar 'soporte'.
        CONSTRAINT CK_UsuConj_rol CHECK (rol COLLATE Latin1_General_BIN2 IN ('ADMIN', 'SOPORTE'))
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UsuConj_idConjunto' AND object_id = OBJECT_ID('dbo.USUARIO_CONJUNTOS'))
    CREATE INDEX IX_UsuConj_idConjunto ON dbo.USUARIO_CONJUNTOS (idConjunto);
GO

-- Cada usuario existente pasa a ser miembro del conjunto inicial con su rol y su estado.
INSERT INTO dbo.USUARIO_CONJUNTOS (idUsuario, idConjunto, rol, activo)
SELECT u.idUsuario, c.idConjunto, u.rol, u.activo
  FROM dbo.USUARIOS u
 CROSS JOIN dbo.CONJUNTOS c
 WHERE c.slug = 'parque-central-occidente'
   AND NOT EXISTS (SELECT 1 FROM dbo.USUARIO_CONJUNTOS m WHERE m.idUsuario = u.idUsuario AND m.idConjunto = c.idConjunto);
GO

/* ---------- 3. idConjunto en RESIDENTES, CORREOS y GATEWAY_CHECKPOINT ---------- */
-- Se añade NULL, se rellena con el conjunto inicial y se vuelve NOT NULL. Sin DEFAULT: quien
-- inserte debe decir a qué conjunto pertenece la fila.

IF COL_LENGTH('dbo.RESIDENTES', 'idConjunto') IS NULL
    ALTER TABLE dbo.RESIDENTES ADD idConjunto INT NULL;
GO
IF COL_LENGTH('dbo.CORREOS', 'idConjunto') IS NULL
    ALTER TABLE dbo.CORREOS ADD idConjunto INT NULL;
GO
IF COL_LENGTH('dbo.GATEWAY_CHECKPOINT', 'idConjunto') IS NULL
    ALTER TABLE dbo.GATEWAY_CHECKPOINT ADD idConjunto INT NULL;
GO

DECLARE @inicial INT = (SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = 'parque-central-occidente');
UPDATE dbo.RESIDENTES         SET idConjunto = @inicial WHERE idConjunto IS NULL;
UPDATE dbo.CORREOS            SET idConjunto = @inicial WHERE idConjunto IS NULL;
UPDATE dbo.GATEWAY_CHECKPOINT SET idConjunto = @inicial WHERE idConjunto IS NULL;
GO

-- Solo si aún admite NULL: ya NOT NULL, los índices que la usan impedirían el ALTER COLUMN.
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.RESIDENTES') AND name = 'idConjunto' AND is_nullable = 1)
    ALTER TABLE dbo.RESIDENTES ALTER COLUMN idConjunto INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.CORREOS') AND name = 'idConjunto' AND is_nullable = 1)
    ALTER TABLE dbo.CORREOS ALTER COLUMN idConjunto INT NOT NULL;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.GATEWAY_CHECKPOINT') AND name = 'idConjunto' AND is_nullable = 1)
    ALTER TABLE dbo.GATEWAY_CHECKPOINT ALTER COLUMN idConjunto INT NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Residentes_Conjuntos')
    ALTER TABLE dbo.RESIDENTES ADD CONSTRAINT FK_Residentes_Conjuntos
        FOREIGN KEY (idConjunto) REFERENCES dbo.CONJUNTOS (idConjunto);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Correos_Conjuntos')
    ALTER TABLE dbo.CORREOS ADD CONSTRAINT FK_Correos_Conjuntos
        FOREIGN KEY (idConjunto) REFERENCES dbo.CONJUNTOS (idConjunto);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Checkpoint_Conjuntos')
    ALTER TABLE dbo.GATEWAY_CHECKPOINT ADD CONSTRAINT FK_Checkpoint_Conjuntos
        FOREIGN KEY (idConjunto) REFERENCES dbo.CONJUNTOS (idConjunto);
GO

/* ---------- 4. Unicidad por conjunto ---------- */
-- Se recrean solo si aún no empiezan por idConjunto (así la migración es repetible).

IF EXISTS (SELECT 1 FROM sys.indexes i
             JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
            WHERE i.name = 'UX_Residentes_correo' AND i.object_id = OBJECT_ID('dbo.RESIDENTES')
              AND COL_NAME(ic.object_id, ic.column_id) <> 'idConjunto')
    DROP INDEX UX_Residentes_correo ON dbo.RESIDENTES;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Residentes_correo' AND object_id = OBJECT_ID('dbo.RESIDENTES'))
    CREATE UNIQUE INDEX UX_Residentes_correo ON dbo.RESIDENTES (idConjunto, correo) WHERE correo IS NOT NULL;
GO

IF EXISTS (SELECT 1 FROM sys.indexes i
             JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.key_ordinal = 1
            WHERE i.name = 'UX_Correos_messageId' AND i.object_id = OBJECT_ID('dbo.CORREOS')
              AND COL_NAME(ic.object_id, ic.column_id) <> 'idConjunto')
    DROP INDEX UX_Correos_messageId ON dbo.CORREOS;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Correos_messageId' AND object_id = OBJECT_ID('dbo.CORREOS'))
    CREATE UNIQUE INDEX UX_Correos_messageId ON dbo.CORREOS (idConjunto, messageId);
GO

/* ---------- 5. Un correo no apunta a un residente de otro conjunto ---------- */
-- FK compuesta sobre (idConjunto, idResidente). Con idResidente NULL no se evalúa (remitente
-- desconocido). FK_Correos_Residentes se conserva.

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Residentes_conjunto_id')
    ALTER TABLE dbo.RESIDENTES ADD CONSTRAINT UQ_Residentes_conjunto_id UNIQUE (idConjunto, idResidente);
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Correos_Residentes_conjunto')
    ALTER TABLE dbo.CORREOS ADD CONSTRAINT FK_Correos_Residentes_conjunto
        FOREIGN KEY (idConjunto, idResidente) REFERENCES dbo.RESIDENTES (idConjunto, idResidente);
GO

/* ---------- 5b. Índices de apoyo de las FK nuevas ---------- */
-- Ya cubiertas por otro índice cuya clave empieza por sus columnas: FK_Residentes_Conjuntos
-- (UQ_Residentes_conjunto_id), FK_Correos_Conjuntos (UX_Correos_messageId), FK_UsuConj_Usuarios
-- (PK_UsuarioConjuntos) y FK_Retos_Conjuntos (UX_Retos_conjunto_correo).

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Correos_conjunto_residente' AND object_id = OBJECT_ID('dbo.CORREOS'))
    CREATE INDEX IX_Correos_conjunto_residente ON dbo.CORREOS (idConjunto, idResidente);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Checkpoint_idConjunto' AND object_id = OBJECT_ID('dbo.GATEWAY_CHECKPOINT'))
    CREATE INDEX IX_Checkpoint_idConjunto ON dbo.GATEWAY_CHECKPOINT (idConjunto);
GO

/* ---------- 6. RETOS_ACCESO: códigos de acceso (solo el hash) ---------- */

IF OBJECT_ID('dbo.RETOS_ACCESO', 'U') IS NULL
    CREATE TABLE dbo.RETOS_ACCESO (
        idReto              BIGINT IDENTITY(1,1) CONSTRAINT PK_RetosAcceso PRIMARY KEY,
        idConjunto          INT           NOT NULL CONSTRAINT FK_Retos_Conjuntos REFERENCES dbo.CONJUNTOS (idConjunto),
        correo              NVARCHAR(320) NOT NULL,
        codigoHash          BINARY(32)    NOT NULL,  -- HMAC-SHA256: el código nunca se guarda en claro
        existeUsuario       BIT           NOT NULL,  -- 0 = reto "fantasma" (no enumeración de correos)
        venceEn             DATETIME2     NOT NULL,
        reenvioDisponibleEn DATETIME2     NOT NULL,
        intentosFallidos    TINYINT       NOT NULL CONSTRAINT DF_Retos_intentos DEFAULT 0,
        bloqueadoHasta      DATETIME2     NULL,
        consumidoEn         DATETIME2     NULL,
        creadoEn            DATETIME2     NOT NULL CONSTRAINT DF_Retos_creado DEFAULT SYSUTCDATETIME()
    );
GO

-- Un reto por (conjunto, correo): se reutiliza la fila con UPDATE (crm_app no tiene DELETE).
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Retos_conjunto_correo' AND object_id = OBJECT_ID('dbo.RETOS_ACCESO'))
    CREATE UNIQUE INDEX UX_Retos_conjunto_correo ON dbo.RETOS_ACCESO (idConjunto, correo);
GO

-- Al quinto fallo el reto se bloquea y no se cuentan más intentos hasta que el bloqueo vence.
-- Sin CHECK venceEn > creadoEn: venceEn lo calcula la aplicación con su reloj y creadoEn lo pone el
-- DEFAULT con el reloj de la BD; un desfase (o un reloj inyectado en pruebas) lo violaría.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Retos_intentos')
    ALTER TABLE dbo.RETOS_ACCESO WITH CHECK ADD CONSTRAINT CK_Retos_intentos CHECK (intentosFallidos BETWEEN 0 AND 5);
GO

/* ---------- 7. SESIONES: token aleatorio guardado como SHA-256 ---------- */

IF OBJECT_ID('dbo.SESIONES', 'U') IS NULL
    CREATE TABLE dbo.SESIONES (
        idSesion         BIGINT IDENTITY(1,1) CONSTRAINT PK_Sesiones PRIMARY KEY,
        tokenHash        BINARY(32) NOT NULL CONSTRAINT UQ_Sesiones_token UNIQUE,
        idUsuario        INT        NOT NULL CONSTRAINT FK_Sesiones_Usuarios  REFERENCES dbo.USUARIOS (idUsuario),
        idConjuntoActivo INT        NOT NULL CONSTRAINT FK_Sesiones_Conjuntos REFERENCES dbo.CONJUNTOS (idConjunto),
        creadaEn         DATETIME2  NOT NULL CONSTRAINT DF_Sesiones_creada    DEFAULT SYSUTCDATETIME(),
        ultimaActividad  DATETIME2  NOT NULL CONSTRAINT DF_Sesiones_actividad DEFAULT SYSUTCDATETIME(),
        revocadaEn       DATETIME2  NULL  -- cerrar sesión marca la fecha (sin DELETE)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sesiones_idUsuario' AND object_id = OBJECT_ID('dbo.SESIONES'))
    CREATE INDEX IX_Sesiones_idUsuario ON dbo.SESIONES (idUsuario);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sesiones_idConjuntoActivo' AND object_id = OBJECT_ID('dbo.SESIONES'))
    CREATE INDEX IX_Sesiones_idConjuntoActivo ON dbo.SESIONES (idConjuntoActivo);
GO

-- La aplicación escribe creadaEn, ultimaActividad y revocadaEn con el mismo reloj.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Sesiones_actividad')
    ALTER TABLE dbo.SESIONES WITH CHECK ADD CONSTRAINT CK_Sesiones_actividad CHECK (ultimaActividad >= creadaEn);
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Sesiones_revocada')
    ALTER TABLE dbo.SESIONES WITH CHECK ADD CONSTRAINT CK_Sesiones_revocada CHECK (revocadaEn IS NULL OR revocadaEn >= creadaEn);
GO

/* ---------- 8. Asignaciones solo entre miembros activos del conjunto ---------- */
-- El conjunto de una solicitud es el de su correo. Al insertar, o al cambiar responsable,
-- asignador o solicitud (moverla a otro conjunto), ambos deben tener membresía activa en ese
-- conjunto. Liberar una asignación (UPDATE de liberadaEn) no lo exige: si no, una membresía
-- desactivada impediría reasignar.

CREATE OR ALTER TRIGGER dbo.TR_Asignaciones_membresia
ON dbo.ASIGNACIONES
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM inserted) RETURN;
    IF NOT (UPDATE(idUsuario) OR UPDATE(asignadaPor) OR UPDATE(idSolicitud)) RETURN;

    IF EXISTS (
        SELECT 1
          FROM inserted i
          JOIN dbo.SOLICITUDES s ON s.idSolicitud = i.idSolicitud
          JOIN dbo.CORREOS c     ON c.idCorreo = s.idCorreo
         WHERE NOT EXISTS (SELECT 1 FROM dbo.USUARIO_CONJUNTOS m
                            WHERE m.idUsuario = i.idUsuario AND m.idConjunto = c.idConjunto AND m.activo = 1)
            OR NOT EXISTS (SELECT 1 FROM dbo.USUARIO_CONJUNTOS m
                            WHERE m.idUsuario = i.asignadaPor AND m.idConjunto = c.idConjunto AND m.activo = 1))
        THROW 50026, 'El responsable y quien asigna deben tener membresía activa en el conjunto de la solicitud.', 1;
END;
GO

/* ---------- 8b. Un correo, un residente y una solicitud no cambian de conjunto ---------- */
-- El trigger anterior solo mira ASIGNACIONES; el conjunto de una solicitud sale de su correo, así
-- que mover el correo (o re-apuntar la solicitud a otro correo) la llevaría a otro conjunto con su
-- responsable. Se crean después del relleno de la sección 3 y de volver la columna NOT NULL: en una
-- reejecución el relleno no toca filas, y aun así NULL → conjunto se admite (es ese relleno).
-- Las PK son IDENTITY (no se pueden actualizar): unir inserted y deleted por la PK es fiable.

CREATE OR ALTER TRIGGER dbo.TR_Correos_conjunto_fijo
ON dbo.CORREOS
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(idConjunto) RETURN;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.idCorreo = i.idCorreo
                WHERE d.idConjunto IS NOT NULL AND (i.idConjunto IS NULL OR i.idConjunto <> d.idConjunto))
        THROW 50027, 'El conjunto de un correo no se puede cambiar.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_Residentes_conjunto_fijo
ON dbo.RESIDENTES
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(idConjunto) RETURN;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.idResidente = i.idResidente
                WHERE d.idConjunto IS NOT NULL AND (i.idConjunto IS NULL OR i.idConjunto <> d.idConjunto))
        THROW 50028, 'El conjunto de un residente no se puede cambiar.', 1;
END;
GO

-- Separado de TR_Solicitudes_integridad (0004), que no se edita.
CREATE OR ALTER TRIGGER dbo.TR_Solicitudes_correo_fijo
ON dbo.SOLICITUDES
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE(idCorreo) RETURN;
    IF EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.idSolicitud = i.idSolicitud
                WHERE i.idCorreo <> d.idCorreo)
        THROW 50029, 'El correo de una solicitud no se puede cambiar.', 1;
END;
GO

/* ---------- 9. Permisos de la aplicación ---------- */
-- CONJUNTOS: solo lectura (SELECT por esquema, 0005). DELETE y ALTER siguen denegados por esquema.

GRANT INSERT, UPDATE ON dbo.USUARIO_CONJUNTOS TO crm_app;
GRANT INSERT, UPDATE ON dbo.RETOS_ACCESO      TO crm_app;
GRANT INSERT, UPDATE ON dbo.SESIONES          TO crm_app;
GO
