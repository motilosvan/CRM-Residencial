# Sistema Organizador de Correos & CRM Residencial (SOC-CRM)

![Estado](https://img.shields.io/badge/estado-MVP%20en%20desarrollo%20(S1%E2%80%93S2)-4e9292)
![Versión](https://img.shields.io/badge/versión-0.2.0-123e46)
![Tecnologías](https://img.shields.io/badge/tecnologías-SQL%20Server%20%7C%20Node.js%20%7C%20TypeScript-orange)

## 📌 Descripción

**SOC-CRM** es un sistema transaccional para la administración de un conjunto residencial: convierte cada correo de un residente en una **solicitud** con categoría, prioridad, responsable, estado e historial, de forma que nada se pierda, nada se duplique y todo cambio quede registrado.

El foco del proyecto es la **base de datos transaccional** (SQL Server): las reglas de integridad viven en la base de datos y se demuestran con pruebas automáticas contra un servidor real.

## 🎯 Problemática

- Falta de organización de la información y de trazabilidad de las comunicaciones.
- Mensajes urgentes mezclados con la correspondencia rutinaria.
- Demoras en la atención y ningún indicador de gestión.

## ✅ Estado actual (semanas 1 y 2 del plan)

| Funcionalidad | Estado |
|---|---|
| Base de datos transaccional (migraciones 0002–0005, triggers, rol de mínimo privilegio) | Hecho |
| Ingesta idempotente de correos (T1) + checkpoint IMAP (T6) | Hecho |
| Clasificación y priorización automáticas | Hecho (reglas por palabras clave) |
| Asignar / reasignar (T2), cambiar estado (T3), reclasificar (T4) | Hecho |
| Consultas de bandeja, detalle e indicadores (lectura consistente SNAPSHOT) | Hecho |
| 180 pruebas automáticas contra SQL Server real + pruebas de mutación | Hecho |
| Visor local de demostración | Provisional |
| Email Gateway con Gmail (S3), API REST con login (S4), panel real (S5) | Pendiente |

Detalle y justificación: [`docs/estudio-funcionalidad-y-bd-transaccional.md`](docs/estudio-funcionalidad-y-bd-transaccional.md) · Plan: [`docs/plan-desarrollo.md`](docs/plan-desarrollo.md) · Arquitectura: [`docs/arquitectura.md`](docs/arquitectura.md).

## 🛠️ Tecnologías

- **Microsoft SQL Server 2022** (Docker) — base de datos transaccional.
- **Node.js 20+ y TypeScript** — lógica de negocio (`mssql`, `zod`).
- **Vitest** — pruebas de integración contra SQL Server real.
- **HTML, CSS y JavaScript** — panel (la interfaz original de la primera entrega, que se conectará a la API en S5).

## ▶️ Ejecución local

Requisitos: Docker Desktop y Node.js 20 o superior.

```bash
cp .env.example .env        # y reemplazar cada <cambiar> por una contraseña propia
npm install
docker compose up -d db     # SQL Server, solo accesible desde este equipo
npm run db:migrate          # crea la BD, aplica migraciones y el login de la aplicación
npm run gate                # migraciones + lint + tipos + 180 pruebas
npm run demo                # visor en http://127.0.0.1:3100 con datos de ejemplo
```

La interfaz original (maqueta de la primera entrega, con datos de ejemplo) se sigue pudiendo abrir directamente con `index.html`.

## 📁 Estructura

```text
CRM-Residencial/
├── ScriptBaseDatosCRM.sql          # línea base del modelo relacional (no se edita)
├── db/migrations/                  # 0002 … 0005: integridad, fechas, invariantes, rol de la app
├── apps/api/src/
│   ├── domain/                     # clasificador, priorizador, máquina de estados (puro)
│   ├── modules/                    # transacciones T1–T4 y consultas
│   ├── db/                         # withTx, pool, migraciones, login de la app
│   └── demo/                       # visor provisional
├── apps/api/test/                  # utilidades y datos solo de pruebas
├── index.html, css/, js/           # interfaz de la primera entrega
├── docs/                           # plan, estudio, arquitectura, alcance
├── AGENTS.md, opencode.jsonc, .opencode/   # flujo de desarrollo con agentes
└── docker-compose.yml, .env.example
```

## 🗺️ Evolución

### Etapa 1 — Propuesta visual
- [x] Repositorio, dashboard, navegación y módulos visuales.

### Etapa 2 — Persistencia y núcleo transaccional (semanas 1–2)
- [x] Diseño y script de la base de datos.
- [x] Migraciones con integridad transaccional, triggers y roles.
- [x] Transacciones de ingesta, asignación, estados y reclasificación.
- [x] Pruebas automáticas de concurrencia, atomicidad y permisos.

### Etapa 3 — Integración (semanas 3–5)
- [ ] Email Gateway con Gmail.
- [ ] API REST, autenticación y permisos por rol.
- [ ] Panel conectado a la API y reportes.

### Etapa 4 — Endurecimiento (semana 6)
- [ ] Pruebas con correos reales y de carga.
- [ ] Backup y restauración probados; CI.

## 👨‍💻 Proyecto académico

**Nombre:** Sistema Organizador de Correos & CRM Residencial
**Asignatura:** Sistemas Transaccionales / Arquitectura de Software — Universidad Manuela Beltrán
**Tipo:** Sistema transaccional
**Versión:** 0.2.0
**Estado:** MVP en desarrollo (núcleo transaccional terminado)
