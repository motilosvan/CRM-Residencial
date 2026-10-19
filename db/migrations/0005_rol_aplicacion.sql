/* =====================================================================
   0005_rol_aplicacion.sql
   Rol de mínimo privilegio para la aplicación. Con `sa` cualquiera puede
   desactivar el trigger del historial, hacer TRUNCATE o alterar tablas: las
   garantías de la BD solo son reales si la aplicación NO es administradora.

   crm_app puede: leer todo, insertar/actualizar las tablas operativas e
   insertar historial. No puede: modificar ni borrar historial, borrar filas,
   ni alterar el esquema (DENY ALTER también impide TRUNCATE y DISABLE TRIGGER).
   El login se crea y se agrega al rol con `npm run db:usuario-app`.
   ===================================================================== */

IF DATABASE_PRINCIPAL_ID('crm_app') IS NULL
    CREATE ROLE crm_app;
GO

GRANT SELECT ON SCHEMA::dbo TO crm_app;
GRANT INSERT, UPDATE ON dbo.CORREOS            TO crm_app;
GRANT INSERT, UPDATE ON dbo.SOLICITUDES        TO crm_app;
GRANT INSERT, UPDATE ON dbo.ASIGNACIONES       TO crm_app;
GRANT INSERT, UPDATE ON dbo.GATEWAY_CHECKPOINT TO crm_app;
GRANT INSERT, UPDATE ON dbo.RESIDENTES         TO crm_app;
GRANT INSERT, UPDATE ON dbo.USUARIOS           TO crm_app;
GRANT INSERT, UPDATE ON dbo.NOTIFICACIONES     TO crm_app;
GRANT INSERT, UPDATE ON dbo.REPORTES           TO crm_app;
GRANT INSERT         ON dbo.HISTORIAL_ESTADOS  TO crm_app;
GO

DENY UPDATE, DELETE ON dbo.HISTORIAL_ESTADOS TO crm_app;
DENY DELETE ON SCHEMA::dbo TO crm_app;
DENY ALTER ON SCHEMA::dbo TO crm_app;
DENY SELECT, INSERT, UPDATE, DELETE ON dbo.__MIGRACIONES TO crm_app;
GO
