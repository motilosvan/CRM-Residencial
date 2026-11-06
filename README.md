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

## ✅ Estado actual (semanas 1 a 3 del plan)

| Funcionalidad | Estado |
|---|---|
| Base de datos transaccional (migraciones 0002–0005, triggers, rol de mínimo privilegio) | Hecho |
| Ingesta idempotente de correos (T1) + checkpoint IMAP (T6) | Hecho |
| Clasificación y priorización automáticas | Hecho (reglas por palabras clave) |
| Asignar / reasignar (T2), cambiar estado (T3), reclasificar (T4) | Hecho |
| Consultas de bandeja, buzón, detalle e indicadores (lectura consistente SNAPSHOT) | Hecho |
| Email Gateway con Gmail por IMAP (S3) | Hecho |
| API HTTP de solo lectura para el buzón (Fastify, inicio de S4) | Hecho, sin login todavía |
| Panel React/Vite: buzón unificado con datos reales | Hecho; las demás pantallas siguen con datos simulados |
| Sugerencias de IA vía OpenRouter u OpenCode Go (worker aparte, solo sugiere) | Hecho, apagado por defecto; aceptarlas llega con el login |
| 311 pruebas automáticas contra SQL Server real + pruebas de mutación | Hecho |
| Visor local de demostración | Provisional |
| Login y rutas de escritura en la API (S4), resto del panel conectado (S5) | Pendiente |

Detalle y justificación: [`docs/estudio-funcionalidad-y-bd-transaccional.md`](docs/estudio-funcionalidad-y-bd-transaccional.md) · Plan: [`docs/plan-desarrollo.md`](docs/plan-desarrollo.md) · Arquitectura: [`docs/arquitectura.md`](docs/arquitectura.md).

## 🛠️ Tecnologías

- **Microsoft SQL Server 2022** (Docker) — base de datos transaccional.
- **Node.js 20+ y TypeScript** — lógica de negocio (`mssql`, `zod`) y API HTTP (`fastify`).
- **imapflow + mailparser** — Email Gateway que lee Gmail por IMAP.
- **OpenRouter u OpenCode Go** (opcional) — modelo para las sugerencias de clasificación.
- **React + Vite + Tailwind** (`apps/web`) — panel administrativo.
- **Vitest** — pruebas de integración contra SQL Server real.

## ▶️ Ejecución local

Requisitos: Docker Desktop y Node.js 20 o superior.

```bash
cp .env.example .env        # y reemplazar cada <cambiar> por una contraseña propia
npm install
npm run web:install         # dependencias del panel (apps/web)
docker compose up -d db     # SQL Server, solo accesible desde este equipo
npm run db:migrate          # crea la BD, aplica migraciones y el login de la aplicación
npm run gate                # migraciones + lint + tipos + 311 pruebas
```

### Ver el buzón unificado de Gmail

1. En la cuenta de Gmail, active la verificación en 2 pasos y cree una
   [contraseña de aplicación](https://myaccount.google.com/apppasswords).
   Es mejor usar una cuenta dedicada al conjunto, no un correo personal: todo lo que se lee se guarda en la BD.
2. Complete `IMAP_USER` e `IMAP_APP_PASSWORD` en `.env`.
3. En tres terminales:

```bash
npm run gateway             # lee Gmail cada 45 s y crea las solicitudes (Ctrl+C para detener)
npm run api                 # API en http://127.0.0.1:3000/api
npm run web                 # panel en http://localhost:5173 → menú "Bandeja Gmail"
```

La primera lectura de una cuenta trae solo los correos de los últimos `IMAP_DIAS_INICIALES` días (7 por defecto).
Por defecto el gateway abre el buzón en solo lectura y no marca nada como leído (`IMAP_MARCAR_LEIDO`).
Para probar las credenciales con una sola lectura: `npm run gateway -- --una-vez`.

**Error `SELF_SIGNED_CERT_IN_CHAIN`:** un antivirus con análisis de correo (Avast, AVG…) o un proxy intercepta la
conexión cifrada con Gmail. Node no usa los certificados de Windows, así que hay que indicarle el del antivirus
antes de arrancar (en Avast: `C:\ProgramData\Avast Software\Avast\wscert.pem`):

```bat
set NODE_EXTRA_CA_CERTS=C:\ProgramData\Avast Software\Avast\wscert.pem
npm run gateway -- --una-vez
```

Con `setx` en lugar de `set` queda guardado para las terminales nuevas. La otra opción es desactivar en el
antivirus el análisis de IMAP. Nunca use `NODE_TLS_REJECT_UNAUTHORIZED=0`: expondría la contraseña.

### Activar las sugerencias de IA

El worker `npm run ia` toma las solicitudes NUEVAS, enmascara el texto en el servidor, pide una sugerencia al
modelo y la guarda aparte en `SUGERENCIAS_IA`. **Solo sugiere:** nunca cambia una solicitud, y si está apagado
o el modelo falla, todo sigue funcionando con la clasificación por reglas. La bandeja muestra la sugerencia y el
texto exacto que recibe el modelo.

1. Elija proveedor y cree la llave: [OpenRouter](https://openrouter.ai/keys) (gratis, pero sus modelos gratuitos
   se saturan a ratos) u [OpenCode Go](https://opencode.ai/docs/go) (de pago desde $10/mes).
2. En `.env`, defina `IA_PROVEEDOR` (`openrouter` u `opencode-go`) y su llave (`OPENROUTER_API_KEY` u `OPENCODE_API_KEY`).
3. Pruebe con `npm run ia -- --una-vez` y luego déjelo corriendo con `npm run ia`.

Con **OpenCode Go** se usa `glm-5.3-flash`: no entrena con los datos y tiene 0 días de retención según su
documentación. Go no permite exigir esa política por solicitud, así que el worker solo arranca con una lista cerrada
de modelos que la cumplen. Go está pensado para agentes de código, y sus términos limitan el uso a fines internos
propios: sirve para desarrollo y demostración, pero revíselos antes de usarlo en producción.

Con **OpenRouter**, cada solicitud exige `data_collection: deny`: si ningún proveedor del modelo cumple esa política, el worker se
detiene y lo informa, sin enviar los datos a otro proveedor. Varios modelos gratuitos no la cumplen porque entrenan
con los datos. El modelo se cambia con `IA_MODELO` y debe aceptar esquema JSON. OpenRouter permite 20 solicitudes por minuto a modelos gratuitos, y 50 o 1.000 al día según los
créditos comprados; los proveedores gratuitos pueden limitar más las ráfagas. Ante un límite, el worker se pausa
sin descontarle intentos a los correos.

El enmascarado es por patrones y puede dejar pasar algún dato. Antes de usarlo con correos reales de residentes,
revise la Ley 1581 con quien corresponda: el texto sale del país hacia un tercero.

`npm run demo` sigue sirviendo el visor provisional en http://127.0.0.1:3100 con datos de ejemplo (BD aparte).

## 📁 Estructura

```text
CRM-Residencial/
├── ScriptBaseDatosCRM.sql          # línea base del modelo relacional (no se edita)
├── db/migrations/                  # 0002 … 0006: integridad, fechas, invariantes, rol de la app, sugerencias de IA
├── apps/api/src/
│   ├── domain/                     # clasificador, priorizador, enmascarado, máquina de estados (puro)
│   ├── modules/                    # transacciones T1–T4 y consultas
│   ├── db/                         # withTx, pool, migraciones, login de la app
│   ├── http/, server.ts            # API HTTP (Fastify), hoy solo lectura
│   └── demo/                       # visor provisional
├── apps/api/test/                  # utilidades y datos solo de pruebas
├── apps/gateway/                   # Email Gateway IMAP (Gmail) → T1 + checkpoint T6
├── apps/worker-ia/                 # worker de sugerencias de IA (OpenRouter, OpenCode Go)
├── apps/web/                       # panel React/Vite (proyecto npm propio)
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
- [x] Email Gateway con Gmail.
- [ ] API REST, autenticación y permisos por rol (hoy: API de solo lectura para el buzón).
- [ ] Panel conectado a la API y reportes (hoy: el buzón unificado ya usa datos reales).

### Etapa 4 — Endurecimiento (semana 6)
- [ ] Pruebas con correos reales y de carga.
- [ ] Backup y restauración probados; CI.

## 👨‍💻 Proyecto académico

**Nombre:** Sistema Organizador de Correos & CRM Residencial
**Asignatura:** Sistemas Transaccionales / Arquitectura de Software — Universidad Manuela Beltrán
**Tipo:** Sistema transaccional
**Versión:** 0.2.0
**Estado:** MVP en desarrollo (núcleo transaccional terminado)
