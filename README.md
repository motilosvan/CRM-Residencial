# Sistema Organizador de Correos & CRM Residencial

![Estado](https://img.shields.io/badge/estado-propuesta%20inicial-4e9292)
![Versión](https://img.shields.io/badge/versión-1.0.0-123e46)
![Tecnologías](https://img.shields.io/badge/tecnologías-HTML%20%7C%20CSS%20%7C%20JavaScript-orange)

## 📌 Descripción

**Sistema Organizador de Correos & CRM Residencial** es una propuesta de sistema transaccional orientada a la administración de un conjunto residencial.

El proyecto busca centralizar las comunicaciones de los residentes, organizar los correos electrónicos, gestionar solicitudes y facilitar el seguimiento de la atención administrativa.

Esta versión corresponde al **primer acercamiento práctico al proyecto**. Se presenta una interfaz funcional de demostración, sin conexión a base de datos ni servicios externos.

## 🎯 Problemática

Actualmente, la gestión de un alto volumen de correos puede generar:

- Falta de organización de la información.
- Dificultad para hacer seguimiento a las respuestas.
- Demoras en la atención de solicitudes.
- Información de residentes dispersa.
- Poca trazabilidad de las comunicaciones.

## 🎯 Objetivo general

Implementar progresivamente un sistema estructurado para gestionar correos, facilitar respuestas rápidas y mantener registros claros de las comunicaciones y solicitudes de un conjunto residencial.

## 💡 Alcance del proyecto

El sistema está planteado para incorporar:

1. **Bandeja de correos:** recepción centralizada y categorización.
2. **CRM de residentes:** perfiles, unidades y datos de contacto.
3. **Solicitudes:** tickets de mantenimiento, reservas y requerimientos.
4. **Reportes:** indicadores de atención y eficiencia administrativa.
5. **Control de usuarios:** permisos y trazabilidad en etapas posteriores.

## 🖥️ Primera interfaz

La versión actual incluye:

- Dashboard administrativo.
- Menú lateral y navegación entre módulos.
- Resumen de indicadores.
- Bandeja de correos.
- Filtros y búsqueda.
- Gestión visual de residentes.
- Gestión visual de solicitudes.
- Dashboard de reportes.
- Configuración.
- Ventanas modales para acciones principales.
- Diseño responsive para computador y dispositivos pequeños.

## 🛠️ Tecnologías

Para esta primera etapa se utilizaron:

- **HTML5:** estructura.
- **CSS3:** diseño visual y responsive.
- **JavaScript:** navegación, filtros, búsqueda y simulación de interacciones.

No se utilizan frameworks ni dependencias externas.

## 🚫 Elementos que todavía NO se implementan

De acuerdo con el alcance de esta actividad, esta versión no contiene:

- Base de datos.
- Backend.
- CRUD real.
- APIs.
- Autenticación real.
- Envío de correos real.
- Pruebas automatizadas.
- Integración con servicios externos.

Estos componentes serán incorporados progresivamente en las siguientes actividades.

## ▶️ Ejecución local

No requiere instalación.

1. Descargar o clonar el repositorio.
2. Abrir la carpeta del proyecto.
3. Abrir `index.html` en Google Chrome, Microsoft Edge o Firefox.
4. Navegar por los módulos utilizando el menú lateral.

También puede utilizarse una extensión como **Live Server** en Visual Studio Code para una experiencia de desarrollo más cómoda.

## 📁 Estructura

```text
CRM-Residencial/
├── index.html
├── README.md
├── .gitignore
├── LICENSE
├── css/
│   └── styles.css
├── js/
│   └── app.js
├── docs/
│   ├── alcance.md
│   └── arquitectura.md
└── assets/
    └── .gitkeep
```

## 🗺️ Evolución prevista

### Etapa 1 — Propuesta visual
- [x] Crear repositorio.
- [x] Diseñar dashboard.
- [x] Crear navegación.
- [x] Crear módulos visuales.
- [x] Registrar primer commit.

### Etapa 2 — Persistencia
- [ ] Diseñar base de datos.
- [ ] Crear tablas de residentes, correos y solicitudes.
- [ ] Implementar backend.
- [ ] Conectar formularios.

### Etapa 3 — Sistema transaccional
- [ ] CRUD de residentes.
- [ ] CRUD de solicitudes.
- [ ] Gestión de correos.
- [ ] Autenticación y permisos.

### Etapa 4 — Analítica
- [ ] Reportes reales.
- [ ] Indicadores.
- [ ] Historial y trazabilidad.
- [ ] Mejoras de seguridad.

## 👨‍💻 Proyecto académico

**Nombre:** Sistema Organizador de Correos & CRM Residencial  
**Tipo:** Sistema transaccional  
**Contexto:** Administración de conjunto residencial  
**Versión:** 1.0.0  
**Estado:** Propuesta visual inicial
