/* =====================================================================
   0003_fechas_datetime2.sql
   Las fechas que escribe el sistema pasan de DATETIME (redondea a pasos de
   ~3,33 ms) a DATETIME2 (100 ns). Con DATETIME, comparar contra columnas
   DATETIME2 podía fallar de forma intermitente: p. ej. liberar una asignación
   justo después de crearla violaba CK_Asignaciones_fechas porque
   fechaAsignacion se redondeaba hacia arriba.
   ===================================================================== */

-- Se sueltan las dependencias de las columnas que cambian de tipo.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Solicitudes_fechas')
    ALTER TABLE dbo.SOLICITUDES DROP CONSTRAINT CK_Solicitudes_fechas;
GO

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Asignaciones_fechas')
    ALTER TABLE dbo.ASIGNACIONES DROP CONSTRAINT CK_Asignaciones_fechas;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Solicitudes_bandeja' AND object_id = OBJECT_ID('dbo.SOLICITUDES'))
    DROP INDEX IX_Solicitudes_bandeja ON dbo.SOLICITUDES;
GO

DECLARE @objetivos TABLE (tabla SYSNAME, columna SYSNAME);
INSERT INTO @objetivos VALUES ('CORREOS', 'fechaRecepcion'), ('SOLICITUDES', 'fechaCreacion'),
                              ('NOTIFICACIONES', 'fechaEnvio'), ('ASIGNACIONES', 'fechaAsignacion');

DECLARE @tabla SYSNAME, @columna SYSNAME, @df SYSNAME, @ddl NVARCHAR(MAX);
DECLARE cur CURSOR LOCAL FAST_FORWARD FOR SELECT tabla, columna FROM @objetivos;
OPEN cur;
FETCH NEXT FROM cur INTO @tabla, @columna;
WHILE @@FETCH_STATUS = 0
BEGIN
    -- Solo si aún es DATETIME (system_type_id 61): así la migración es repetible.
    IF EXISTS (SELECT 1 FROM sys.columns
                WHERE object_id = OBJECT_ID('dbo.' + @tabla) AND name = @columna AND system_type_id = 61)
    BEGIN
        SET @df = NULL;
        SELECT @df = dc.name
          FROM sys.default_constraints dc
          JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
         WHERE dc.parent_object_id = OBJECT_ID('dbo.' + @tabla) AND c.name = @columna;

        IF @df IS NOT NULL
            EXEC (N'ALTER TABLE dbo.' + @tabla + N' DROP CONSTRAINT ' + @df);

        EXEC (N'ALTER TABLE dbo.' + @tabla + N' ALTER COLUMN ' + @columna + N' DATETIME2 NOT NULL');

        SET @ddl = N'ALTER TABLE dbo.' + QUOTENAME(@tabla) + N' ADD CONSTRAINT '
                 + QUOTENAME(N'DF_' + @tabla + N'_' + @columna + N'_utc')
                 + N' DEFAULT SYSUTCDATETIME() FOR ' + QUOTENAME(@columna) + N';';
        EXEC (@ddl);
    END;
    FETCH NEXT FROM cur INTO @tabla, @columna;
END;
CLOSE cur;
DEALLOCATE cur;
GO

-- Se restauran las dependencias.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Solicitudes_fechas')
    ALTER TABLE dbo.SOLICITUDES ADD CONSTRAINT CK_Solicitudes_fechas
        CHECK ((fechaCierre IS NULL OR fechaCierre >= fechaCreacion)
           AND (primeraRespuesta IS NULL OR primeraRespuesta >= fechaCreacion));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Asignaciones_fechas')
    ALTER TABLE dbo.ASIGNACIONES ADD CONSTRAINT CK_Asignaciones_fechas
        CHECK (liberadaEn IS NULL OR liberadaEn >= fechaAsignacion);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Solicitudes_bandeja' AND object_id = OBJECT_ID('dbo.SOLICITUDES'))
    CREATE INDEX IX_Solicitudes_bandeja ON dbo.SOLICITUDES (idEstado, idPrioridad, fechaCreacion);
GO
