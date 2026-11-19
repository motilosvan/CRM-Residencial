/* =====================================================================
   Modelo Relacional - Sistema Organizador de Correos y CRM Residencial
   Script de creación de base de datos para Microsoft SQL Server
   ===================================================================== */

-- 1. Crear la base de datos
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'CorreosCRM')
BEGIN
    CREATE DATABASE CorreosCRM;
END
GO

USE CorreosCRM;
GO

/* =====================================================================
   Tablas base (sin dependencias)
   ===================================================================== */

CREATE TABLE RESIDENTES (
    idResidente INT IDENTITY(1,1) PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    unidad      VARCHAR(20)  NOT NULL,
    correo      VARCHAR(100) NULL,
    telefono    VARCHAR(20)  NULL
);
GO

CREATE TABLE CATEGORIAS (
    idCategoria INT IDENTITY(1,1) PRIMARY KEY,
    nombre      VARCHAR(50) NOT NULL
);
GO

CREATE TABLE ESTADOS (
    idEstado INT IDENTITY(1,1) PRIMARY KEY,
    nombre   VARCHAR(30) NOT NULL,
    fecha    DATETIME NULL
);
GO

CREATE TABLE USUARIOS (
    idUsuario INT IDENTITY(1,1) PRIMARY KEY,
    nombre    VARCHAR(100) NOT NULL,
    rol       VARCHAR(30)  NOT NULL,
    correo    VARCHAR(100) NOT NULL
);
GO

/* =====================================================================
   Tablas dependientes de primer nivel
   ===================================================================== */

CREATE TABLE CORREOS (
    idCorreo        INT IDENTITY(1,1) PRIMARY KEY,
    idResidente     INT NOT NULL,
    remitente       VARCHAR(100) NOT NULL,
    asunto          VARCHAR(150) NULL,
    cuerpo          VARCHAR(MAX) NULL,
    fechaRecepcion  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Correos_Residentes
        FOREIGN KEY (idResidente) REFERENCES RESIDENTES(idResidente)
);
GO

CREATE TABLE REPORTES (
    idReporte           INT IDENTITY(1,1) PRIMARY KEY,
    idUsuario           INT NOT NULL,
    periodo             VARCHAR(20) NOT NULL,
    tiempoPromedioResp  FLOAT NULL,
    CONSTRAINT FK_Reportes_Usuarios
        FOREIGN KEY (idUsuario) REFERENCES USUARIOS(idUsuario)
);
GO

/* =====================================================================
   Tabla central: SOLICITUDES
   ===================================================================== */

CREATE TABLE SOLICITUDES (
    idSolicitud    INT IDENTITY(1,1) PRIMARY KEY,
    idCorreo       INT NOT NULL,
    idCategoria    INT NOT NULL,
    idEstado       INT NOT NULL,
    descripcion    VARCHAR(MAX) NULL,
    prioridad      VARCHAR(20) NULL,
    fechaCreacion  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Solicitudes_Correos
        FOREIGN KEY (idCorreo) REFERENCES CORREOS(idCorreo),
    CONSTRAINT FK_Solicitudes_Categorias
        FOREIGN KEY (idCategoria) REFERENCES CATEGORIAS(idCategoria),
    CONSTRAINT FK_Solicitudes_Estados
        FOREIGN KEY (idEstado) REFERENCES ESTADOS(idEstado)
);
GO

/* =====================================================================
   Tablas dependientes de SOLICITUDES
   ===================================================================== */

CREATE TABLE NOTIFICACIONES (
    idNotificacion  INT IDENTITY(1,1) PRIMARY KEY,
    idSolicitud     INT NOT NULL,
    idUsuario       INT NULL,
    mensaje         VARCHAR(MAX) NOT NULL,
    fechaEnvio      DATETIME NOT NULL DEFAULT GETDATE(),
    destinatario    VARCHAR(100) NULL,
    CONSTRAINT FK_Notificaciones_Solicitudes
        FOREIGN KEY (idSolicitud) REFERENCES SOLICITUDES(idSolicitud),
    CONSTRAINT FK_Notificaciones_Usuarios
        FOREIGN KEY (idUsuario) REFERENCES USUARIOS(idUsuario)
);
GO

CREATE TABLE ASIGNACIONES (
    idAsignacion     INT IDENTITY(1,1) PRIMARY KEY,
    idSolicitud      INT NOT NULL,
    idUsuario        INT NOT NULL,
    fechaAsignacion  DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_Asignaciones_Solicitudes
        FOREIGN KEY (idSolicitud) REFERENCES SOLICITUDES(idSolicitud),
    CONSTRAINT FK_Asignaciones_Usuarios
        FOREIGN KEY (idUsuario) REFERENCES USUARIOS(idUsuario)
);
GO

/* =====================================================================
   Índices recomendados sobre las llaves foráneas
   ===================================================================== */

CREATE INDEX IX_Correos_idResidente        ON CORREOS(idResidente);
CREATE INDEX IX_Solicitudes_idCorreo       ON SOLICITUDES(idCorreo);
CREATE INDEX IX_Solicitudes_idCategoria    ON SOLICITUDES(idCategoria);
CREATE INDEX IX_Solicitudes_idEstado       ON SOLICITUDES(idEstado);
CREATE INDEX IX_Notificaciones_idSolicitud ON NOTIFICACIONES(idSolicitud);
CREATE INDEX IX_Notificaciones_idUsuario   ON NOTIFICACIONES(idUsuario);
CREATE INDEX IX_Asignaciones_idSolicitud   ON ASIGNACIONES(idSolicitud);
CREATE INDEX IX_Asignaciones_idUsuario     ON ASIGNACIONES(idUsuario);
CREATE INDEX IX_Reportes_idUsuario         ON REPORTES(idUsuario);
GO

PRINT 'Base de datos CorreosCRM creada correctamente.';
