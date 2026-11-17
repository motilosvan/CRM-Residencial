/* =====================================================================
   0007_analisis_seguridad.sql
   Análisis de seguridad de cada correo: phishing, suplantación, fraude de
   pago, enlaces y dominios engañosos, adjuntos peligrosos e inyección de
   instrucciones contra la IA (reglas en apps/api/src/domain/seguridad.ts).

   T1 lo calcula y lo guarda en la MISMA transacción que el correo: no hay
   correo sin análisis ni análisis sin correo. No bloquea nada (regla 8): el
   correo y su solicitud se crean igual y el panel advierte del riesgo.

   El análisis es un hecho del momento de la ingesta, con la versión de las
   reglas que se usó: la aplicación solo puede insertarlo (ni UPDATE ni DELETE).
   ===================================================================== */

IF OBJECT_ID('dbo.ANALISIS_SEGURIDAD', 'U') IS NULL
    CREATE TABLE dbo.ANALISIS_SEGURIDAD (
        idAnalisis      INT IDENTITY(1,1) CONSTRAINT PK_AnalisisSeguridad PRIMARY KEY,
        idCorreo        INT NOT NULL
            CONSTRAINT FK_AnalisisSeguridad_Correos REFERENCES dbo.CORREOS (idCorreo),
        nivel           VARCHAR(10) COLLATE Latin1_General_100_BIN2 NOT NULL,
        puntaje         TINYINT NOT NULL,
        senales         NVARCHAR(MAX) NOT NULL,
        versionDetector VARCHAR(20) NOT NULL,
        fechaAnalisis   DATETIME2 NOT NULL CONSTRAINT DF_AnalisisSeguridad_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_AnalisisSeguridad_nivel CHECK (nivel IN ('BAJO', 'MEDIO', 'ALTO')),
        CONSTRAINT CK_AnalisisSeguridad_puntaje CHECK (puntaje BETWEEN 0 AND 100),
        CONSTRAINT CK_AnalisisSeguridad_senales CHECK (ISJSON(senales) = 1),
        -- El nivel sale del puntaje (umbrales 30 y 60 de domain/seguridad.ts): la BD no acepta incoherencias.
        CONSTRAINT CK_AnalisisSeguridad_coherente CHECK (
               (nivel = 'BAJO'  AND puntaje < 30)
            OR (nivel = 'MEDIO' AND puntaje BETWEEN 30 AND 59)
            OR (nivel = 'ALTO'  AND puntaje >= 60)
        )
    );
GO

-- Un correo, un análisis.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_AnalisisSeguridad_idCorreo' AND object_id = OBJECT_ID('dbo.ANALISIS_SEGURIDAD'))
    CREATE UNIQUE INDEX UX_AnalisisSeguridad_idCorreo ON dbo.ANALISIS_SEGURIDAD (idCorreo);
GO

GRANT INSERT ON dbo.ANALISIS_SEGURIDAD TO crm_app;
DENY UPDATE ON dbo.ANALISIS_SEGURIDAD TO crm_app;
GO
