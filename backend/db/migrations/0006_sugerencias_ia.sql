/* =====================================================================
   0006_sugerencias_ia.sql
   Sugerencias de clasificación generadas por un modelo de IA.

   La IA nunca modifica SOLICITUDES: su resultado vive aparte, una fila por
   solicitud, hasta que una persona lo revise. Así un modelo caído o una
   respuesta errada no pueden afectar el ciclo de vida de la solicitud, ni su
   columna `version`, y el correo conserva la clasificación por reglas de T1.

   Estados:
     EN_REINTENTO  falló; se reintenta desde `proximoIntento`
     LISTA         hay sugerencia para que una persona la revise
     FALLIDA       agotó los intentos; queda la clasificación por reglas
   ===================================================================== */

IF OBJECT_ID('dbo.SUGERENCIAS_IA', 'U') IS NULL
    CREATE TABLE dbo.SUGERENCIAS_IA (
        idSugerencia       INT IDENTITY(1,1) CONSTRAINT PK_SugerenciasIA PRIMARY KEY,
        idSolicitud        INT NOT NULL
            CONSTRAINT FK_SugerenciasIA_Solicitudes REFERENCES dbo.SOLICITUDES (idSolicitud),
        estado             VARCHAR(20) COLLATE Latin1_General_100_BIN2 NOT NULL,
        idCategoria        INT NULL
            CONSTRAINT FK_SugerenciasIA_Categorias REFERENCES dbo.CATEGORIAS (idCategoria),
        idPrioridad        INT NULL
            CONSTRAINT FK_SugerenciasIA_Prioridades REFERENCES dbo.PRIORIDADES (idPrioridad),
        resumen            NVARCHAR(500) NULL,
        justificacion      NVARCHAR(1000) NULL,
        proveedor          VARCHAR(30) NOT NULL,
        modelo             NVARCHAR(200) NOT NULL,
        intentos           INT NOT NULL CONSTRAINT DF_SugerenciasIA_intentos DEFAULT 0,
        ultimoError        NVARCHAR(200) NULL,
        proximoIntento     DATETIME2 NULL,
        fechaCreacion      DATETIME2 NOT NULL CONSTRAINT DF_SugerenciasIA_creacion DEFAULT SYSUTCDATETIME(),
        fechaActualizacion DATETIME2 NOT NULL CONSTRAINT DF_SugerenciasIA_actualizacion DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_SugerenciasIA_estado CHECK (estado IN ('EN_REINTENTO', 'LISTA', 'FALLIDA')),
        CONSTRAINT CK_SugerenciasIA_intentos CHECK (intentos >= 0),
        CONSTRAINT CK_SugerenciasIA_lista CHECK (
            estado <> 'LISTA'
            OR (idCategoria IS NOT NULL AND idPrioridad IS NOT NULL AND resumen IS NOT NULL)
        ),
        CONSTRAINT CK_SugerenciasIA_reintento CHECK (estado <> 'EN_REINTENTO' OR proximoIntento IS NOT NULL)
    );
GO

-- Una solicitud tiene como máximo una sugerencia.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_SugerenciasIA_idSolicitud' AND object_id = OBJECT_ID('dbo.SUGERENCIAS_IA'))
    CREATE UNIQUE INDEX UX_SugerenciasIA_idSolicitud ON dbo.SUGERENCIAS_IA (idSolicitud);
GO

GRANT INSERT, UPDATE ON dbo.SUGERENCIAS_IA TO crm_app;
GO
