# MailFlow F2–F4 y Salida a Producción — Conexión Backend ↔ Frontend y Buzones Gmail en BD

> **Para quien ejecute:** usar `superpowers:subagent-driven-development` (tareas en serie, pruebas de integración primero contra SQL Server real en backend y Vitest + Playwright `ui-verifier` en frontend, sin `git push`).

**Objetivo:** eliminar los datos quemados de desarrollo (buzón único de Gmail en `.env`, usuarios `@demo.mailflow.test` en el arranque y conjunto fijo en código), permitir que cada conjunto conecte su propio buzón de Gmail desde el panel web (guardado cifrado en SQL Server) y conectar las 11 secciones del panel `apps/web` contra la API Fastify y SQL Server real en tres olas.

**Arquitectura:**
- **Correo saliente de plataforma (OTP):** `SMTP_*` en `.env` (p. ej. `soc.crm26@gmail.com`) actúa como el emisor global de MailFlow para entregar los códigos OTP de 6 dígitos al correo de cada usuario.
- **Correo entrante por conjunto (Gateway IMAP):** nueva tabla `dbo.BUZONES_CONJUNTO` (migración `0008`) que almacena por conjunto el correo de Gmail, host/puerto y la contraseña de aplicación cifrada con `AES-256-GCM` (derivando la llave de `AUTH_SECRETO`). `apps/gateway` deja de exigir `IMAP_USER` / `IMAP_APP_PASSWORD` en `.env` y recorre todos los buzones activos de la BD; además, la API expone conexión en vivo (probando `FuenteImap.abrir()` antes de guardar) y sincronización bajo demanda (`POST /api/buzon/sincronizar`).
- **Aprovisionamiento sin datos demo:** `apps/api/src/server.ts` deja de sembrar `admin@demo.mailflow.test` y `soporte@demo.mailflow.test` (que quedan exclusivos para `npm test`). El conjunto y administrador inicial se leen de `.env` (`CONJUNTO_INICIAL_SLUG`, `CONJUNTO_INICIAL_NOMBRE`, `ADMIN_INICIAL_CORREO`), desactivando `parque-central-occidente` si se configura otro conjunto.
- **Panel (`apps/web`):** clientes HTTP en `apps/web/src/services/http` para todas las pantallas, estados de carga (`EsqueletoCarga`), vacío (`EmptyState`) y error (`EstadoError`), manejo de conflictos `409` con recarga de versión y verificación visual con Playwright a `375px` y escritorio.

---

## 1. Decisiones confirmadas en entrevista (`/grill-me`, 2026-11-16)

| # | Tema | Decisión confirmada | Motivo |
|---|---|---|---|
| 1 | Conexión de Gmail por conjunto | Guardar en la BD por conjunto el correo + contraseña de aplicación IMAP cifrada (`AES-256-GCM`), configurados por el `ADMIN` desde el panel («Conectar el buzón») | OAuth2 de Google para leer correos (`gmail.readonly`) es un *scope restringido*: en modo *Testing* el token caduca cada 7 días y limita cuentas manuales; en *Production* exige auditoría CASA y rompería `FuenteImap` (`UID`/`UIDVALIDITY`, T6) |
| 2 | Separación SMTP (OTP) vs. IMAP (Solicitudes) | `SMTP_*` en `.env` (`soc.crm26@gmail.com`) queda como correo emisor de la plataforma MailFlow para mandar los OTPs de acceso; `IMAP_*` sale de `.env` y pasa 100 % a la BD por conjunto | Si el OTP dependiera del buzón del conjunto, el primer `ADMIN` no podría recibir el código para su primer inicio de sesión ni podría entrar al panel si caduca la clave del Gmail del conjunto |
| 3 | Autenticación de usuarios | Se mantiene el login sin contraseña por código OTP de 6 dígitos enviado al correo real del usuario (ADR 10) | Evita construir flujos de creación/recuperación de contraseñas y aprovecha B1 completo en verde |
| 4 | Aprovisionamiento inicial sin datos quemados | Sin usuarios `@demo.mailflow.test` en `server.ts`. El conjunto inicial y su primer `ADMIN` se definen en `.env` (`CONJUNTO_INICIAL_SLUG`, `CONJUNTO_INICIAL_NOMBRE`, `ADMIN_INICIAL_CORREO`); si el slug es distinto de `parque-central-occidente`, este se desactiva (`activo = 0`). El resto del personal se gestiona desde la pantalla **Usuarios** | Cumple la regla 6 (no editar la migración `0007`) y elimina los datos de prueba en el entorno real mientras en el futuro se construye un super-panel de MailFlow |
| 5 | Validación y sincronización del buzón | Al guardar el buzón desde el panel, la API verifica la conexión IMAP en vivo antes de persistir; el Gateway lee todos los buzones activos de la BD y la Bandeja incluye el botón **«Sincronizar ahora»** | Evita guardar contraseñas inválidas que fallen en silencio y permite traer correos al instante desde la UI |
| 6 | Alcance de pantallas (`Validación`, `Catálogos`, `Laboratorio IA`) | Sin estado ficticio en memoria (a diferencia de `web-legacy`): **Validación** tiene 2 pestañas reales (sugerencias IA `LISTA` para aprobar/reclasificar con T7→T4, y remitentes con `idResidente IS NULL` para vincular a residente); **Catálogos** muestra las categorías, prioridades con SLA, transiciones de estado y palabras clave reales del dominio (sin umbral de confianza ficticio); **Laboratorio IA** prueba en vivo el enmascarador Ley 1581 y el clasificador sin insertar solicitudes falsas en la BD | Alinea la interfaz con las reglas reales del dominio y la base de datos transaccional |

---

## 2. Decisiones mías (refutables)

| Decisión | Porqué | Alternativa descartada |
|---|---|---|
| Tabla separada `dbo.BUZONES_CONJUNTO` (`1:1` con `CONJUNTOS`) en vez de columnas en `dbo.CONJUNTOS` | `GET /api/conjuntos` es público y lee `dbo.CONJUNTOS`; separar las credenciales cifradas en su propia tabla impide por diseño que una consulta de conjuntos toque o filtre secretos del buzón | Añadir `imapUsuario` e `imapPasswordCifrado` en `dbo.CONJUNTOS` |
| Cifrado `AES-256-GCM` con clave derivada por `HKDF-SHA256(AUTH_SECRETO, 'mailflow-buzon-imap-v1')` e IV aleatorio de 12 bytes + tag de 16 bytes | `node:crypto` lo incluye sin dependencias nuevas, autentica integridad (detecta manipulación en BD) y no reutiliza en crudo la clave HMAC de los retos OTP | Guardar en claro o pedir otra variable obligatoria más en `.env` |
| Protección del último `ADMIN` activo del conjunto en `withTx` (`UPDLOCK, HOLDLOCK` sobre `USUARIO_CONJUNTOS`) | Si el único `ADMIN` se desactiva a sí mismo o pasa su rol a `SOPORTE`, el conjunto queda acéfalo sin nadie que pueda asignar o administrar usuarios | Permitir cambiar rol/estado sin contar cuántos `ADMIN` activos quedan |
| Candado en memoria por `idConjunto` en `POST /api/buzon/sincronizar` | Aunque T1 (`UX_Correos_messageId`) y T6 (`ultimoUid`) son idempotentes en BD, abrir dos conexiones IMAP concurrentes a la misma cuenta de Gmail desde el botón manual gasta sesiones IMAP innecesarias | Permitir múltiples sincronizaciones manuales simultáneas del mismo conjunto |

---

## 3. Esquema SQL — Migración `0008_buzones_y_administracion.sql`

Respeta la regla 6 (no edita `0002`–`0007` ni `ScriptBaseDatosCRM.sql`) y la regla 5 (`crm_app` sin `DELETE` ni `ALTER`):

```sql
/* 1. Estado activo en RESIDENTES (desactivar sin borrar, compatible con crm_app) */
IF COL_LENGTH('dbo.RESIDENTES', 'activo') IS NULL
    ALTER TABLE dbo.RESIDENTES ADD activo BIT NOT NULL CONSTRAINT DF_Residentes_activo DEFAULT 1;
GO

/* 2. Buzón IMAP por conjunto (credencial cifrada con AES-256-GCM) */
IF OBJECT_ID('dbo.BUZONES_CONJUNTO', 'U') IS NULL
    CREATE TABLE dbo.BUZONES_CONJUNTO (
        idConjunto          INT            NOT NULL CONSTRAINT PK_BuzonesConjunto PRIMARY KEY
                            CONSTRAINT FK_Buzones_Conjuntos REFERENCES dbo.CONJUNTOS (idConjunto),
        imapHost            VARCHAR(120)   NOT NULL CONSTRAINT DF_Buzones_host DEFAULT 'imap.gmail.com',
        imapPort            INT            NOT NULL CONSTRAINT DF_Buzones_port DEFAULT 993,
        correo              NVARCHAR(320)  NOT NULL,
        contrasenaCifrada   VARBINARY(512) NOT NULL, -- IV (12B) + AuthTag (16B) + Ciphertext
        buzon               NVARCHAR(200)  NOT NULL CONSTRAINT DF_Buzones_buzon DEFAULT N'INBOX',
        diasIniciales       INT            NOT NULL CONSTRAINT DF_Buzones_dias DEFAULT 7,
        marcarLeido         BIT            NOT NULL CONSTRAINT DF_Buzones_leido DEFAULT 0,
        activo              BIT            NOT NULL CONSTRAINT DF_Buzones_activo DEFAULT 1,
        actualizadoEn       DATETIME2      NOT NULL CONSTRAINT DF_Buzones_fecha DEFAULT SYSUTCDATETIME(),
        CONSTRAINT CK_Buzones_port CHECK (imapPort BETWEEN 1 AND 65535),
        CONSTRAINT CK_Buzones_dias CHECK (diasIniciales BETWEEN 0 AND 365)
    );
GO

/* 3. Permisos para el rol de aplicación (crm_app: sin DELETE ni ALTER) */
GRANT INSERT, UPDATE ON dbo.CONJUNTOS        TO crm_app;
GRANT INSERT, UPDATE ON dbo.BUZONES_CONJUNTO TO crm_app;
GO
```

---

## 4. Contratos HTTP (`apps/api`)

### 4.1 Ya implementados (B1 + B2 en árbol de trabajo)
- **Públicos:** `GET /api/salud`, `GET /api/conjuntos`, `POST /api/auth/codigo`, `POST /api/auth/verificar`
- **Sesión:** `GET /api/auth/sesion`, `POST /api/auth/conjunto`, `POST /api/auth/salir`
- **Buzón (lectura):** `GET /api/correos`, `GET /api/correos/:id`, `GET /api/gateway/estado`
- **Solicitudes (T2–T4 y T7→T4):** `GET /api/solicitudes`, `GET /api/solicitudes/:id`, `POST /api/solicitudes/:id/asignar`, `POST /api/solicitudes/:id/estado`, `POST /api/solicitudes/:id/reclasificar`, `POST /api/solicitudes/:id/aceptar-sugerencia`
- **Personal y Analítica:** `GET /api/usuarios`, `GET /api/resumen`, `GET /api/reportes` (`JSON` y `?formato=csv`)

### 4.2 Nuevos endpoints por agregar

| Método y ruta | Rol | Descripción | Respuesta / Errores |
|---|---|---|---|
| `PUT /api/buzon` | `ADMIN` | Verifica conexión IMAP en vivo (`FuenteImap.abrir()`), cifra la contraseña de aplicación y guarda/actualiza `dbo.BUZONES_CONJUNTO` | `200 EstadoGateway` · `422` si Gmail rechaza credenciales o TLS |
| `POST /api/buzon/desconectar` | `ADMIN` | Marca `activo = 0` en `dbo.BUZONES_CONJUNTO` del conjunto activo (sin `DELETE`) | `200 EstadoGateway` |
| `POST /api/buzon/sincronizar` | `ADMIN` / `SOPORTE` | Ejecuta un ciclo `sincronizar()` sobre el buzón activo del conjunto | `200 { revisados, nuevos, duplicados, respaldos, pendientes }` · `409` si ya hay una sincronización en curso · `422` si no hay buzón conectado |
| `POST /api/usuarios` | `ADMIN` | Crea o reactiva el usuario en `dbo.USUARIOS` y su membresía en `dbo.USUARIO_CONJUNTOS` (`ADMIN` o `SOPORTE`) en una transacción `withTx` | `201 UsuarioConjunto` · `422` validación |
| `PATCH /api/usuarios/:id` | `ADMIN` | Cambia `rol` y/o `activo` en `dbo.USUARIO_CONJUNTOS` del conjunto activo (rechaza con `422` si dejaría al conjunto sin ningún `ADMIN` activo) | `200 UsuarioConjunto` · `404` · `422` |
| `GET /api/residentes` | `ADMIN` | Lista residentes del conjunto (`?q=&soloActivos=`) con su conteo de solicitudes | `200 ResidenteConjunto[]` |
| `POST /api/residentes` | `ADMIN` | Registra un residente en el conjunto y vincula automáticamente los correos previos del mismo conjunto cuyo `remitente` coincida y tengan `idResidente IS NULL` | `201 ResidenteConjunto` · `409` si el correo ya pertenece a otro residente del conjunto |
| `PATCH /api/residentes/:id` | `ADMIN` | Actualiza datos (`nombre`, `unidad`, `correo`, `telefono`, `activo`) del residente dentro del conjunto | `200 ResidenteConjunto` · `404` · `409` · `422` |
| `GET /api/validacion` | `ADMIN` | Devuelve en `SNAPSHOT`: 1) solicitudes con sugerencia IA en estado `LISTA` pendientes de decidir y 2) correos del conjunto con `idResidente IS NULL` | `200 { sugerencias, remitentesSinResidente }` |
| `POST /api/correos/:id/vincular-residente` | `ADMIN` | Vincula un correo del conjunto a un `idResidente` existente del mismo conjunto (o crea el residente en la misma transacción y vincula los correos de ese remitente) | `200 DetalleCorreo` · `404` · `422` |
| `PATCH /api/conjunto/identidad` | `ADMIN` | Actualiza `nombre`, `logoUrl`, `colorPrimario`, `colorAcento`, `colorSecundario` del conjunto activo en `dbo.CONJUNTOS` | `200 ConjuntoPublico` · `422` |
| `GET /api/catalogos` | `ADMIN` | Devuelve categorías, prioridades con `slaHoras`, estados con `esFinal` y `TRANSICIONES_ESTADO`, y palabras clave del clasificador/priorizador de `domain/` | `200 CatalogosDominio` |
| `GET /api/auditoria` | `ADMIN` | Bitácora paginada del conjunto en `SNAPSHOT` combinando cambios en `HISTORIAL_ESTADOS` y `ASIGNACIONES` (`?q=&limite=&desplazamiento=`) | `200 { total, eventos }` |
| `POST /api/laboratorio/probar` | `ADMIN` / `SOPORTE` | Ejecuta en memoria `enmascarar()`, `clasificar()` y `priorizar()` sobre `{ asunto, cuerpo }` sin escribir en la BD | `200 { asuntoEnmascarado, cuerpoEnmascarado, categoria, prioridad, palabrasDetectadas }` |

---

## 5. Plan de Ejecución por Olas

### Ola 1 — Salida a producción sin datos quemados, Buzón Gmail en BD y Núcleo Operativo (`Inicio`, `Bandeja`, `Solicitudes`, `Usuarios`)

- [ ] **Tarea 0 — Consolidar B2 actual y verificar línea base:**
  - Ejecutar `npm run gate` sobre los cambios actuales de B2/S4/S5-01 en el árbol de trabajo y confirmar que todas las pruebas están en verde.
- [ ] **Tarea 1 — Migración `0008_buzones_y_administracion.sql` (`opus` + `db-reviewer`):**
  - Crear `db/migrations/0008_buzones_y_administracion.sql` y `apps/api/src/db/migration0008.test.ts`.
  - Probar constraints de `BUZONES_CONJUNTO`, columna `RESIDENTES.activo` y permisos de `crm_app` (`INSERT`/`UPDATE` permitidos, `DELETE` denegado).
- [ ] **Tarea 2 — Módulo `buzones.ts` y Gateway multi-conjunto desde BD (`opus`):**
  - Crear `apps/api/src/modules/buzones.ts` y `buzones.test.ts`: cifrado/descifrado `AES-256-GCM`, guardar buzón tras verificar conexión con una fábrica `FuenteCorreo` inyectable, desconectar buzón, ampliar `estadoGateway` para informar `{ conectado, correo, imapHost, imapPort, buzon, marcarLeido }` sin exponer jamás la contraseña, y `sincronizarConjunto`.
  - Actualizar `apps/gateway/src/config.ts` y `main.ts` para que no exijan `IMAP_USER` ni `IMAP_APP_PASSWORD` en `.env` y sincronicen en cada ciclo todas las filas activas de `dbo.BUZONES_CONJUNTO`.
- [ ] **Tarea 3 — Semilla de producción por `.env` y SMTP real (`sonnet`):**
  - Actualizar `apps/api/src/config.ts`, `apps/api/src/modules/semilla.ts`, `apps/api/src/server.ts` y `.env.example`:
    - Soportar `CONJUNTO_INICIAL_SLUG` y `CONJUNTO_INICIAL_NOMBRE` en `.env` junto a `ADMIN_INICIAL_CORREO`.
    - Si se define un conjunto inicial distinto de `parque-central-occidente`, crear/activar el nuevo y desactivar (`activo = 0`) `parque-central-occidente` si no tiene solicitudes.
    - Quitar `demo: acceso.desarrollo` de `server.ts` para que el arranque de la API nunca cree `admin@demo.mailflow.test` ni `soporte@demo.mailflow.test` (manteniéndolos solo en las suites de prueba).
    - Documentar en `.env.example` la configuración SMTP con `soc.crm26@gmail.com` (`smtp.gmail.com:587`) y la eliminación de `IMAP_USER` / `IMAP_APP_PASSWORD`.
- [ ] **Tarea 4 — Escritura de `Usuarios` del conjunto en el backend (`sonnet`):**
  - Ampliar `listarUsuariosConjunto` (para devolver también `activo` cuando lo pide `ADMIN`) y añadir `guardarUsuarioConjunto` y `actualizarMembresiaUsuario` en `apps/api/src/modules/usuarios.ts` con pruebas de integración (incluyendo rechazo `422` al intentar desactivar o degradar al último `ADMIN` activo del conjunto).
  - Exponer `POST /api/usuarios` y `PATCH /api/usuarios/:id` en `apps/api/src/http/app.ts`.
- [ ] **Tarea 5 — Frontend Ola 1 en `apps/web` (`Inicio`, `Bandeja`, `Solicitudes`, `Usuarios`) (`sonnet` + `ui-verifier`):**
  - Añadir clientes HTTP y contratos en `apps/web/src/services/` para `buzon`, `solicitudes`, `usuarios` y `resumen`.
  - **Inicio (`InicioPage.tsx`):** conectar con `GET /api/resumen` y `GET /api/gateway/estado` para mostrar métricas reales del conjunto y marcar automáticamente como completados los pasos del checklist según el estado real en BD.
  - **Bandeja (`BandejaPage.tsx`):** estado sin buzón con diálogo «Conectar buzón de Gmail» (correo + contraseña de aplicación), botón «Sincronizar ahora», buscador, lista paginada de correos y panel de detalle con conmutador «Texto original / Texto enmascarado (Ley 1581)», sugerencia de IA y enlace directo a la solicitud generada.
  - **Solicitudes (`SolicitudesPage.tsx` y `DetalleSolicitudSheet/Page.tsx`):** tabla filtrable por estado, categoría, prioridad y responsable; vista de detalle con cuerpo del correo, línea de tiempo inmutable (`HISTORIAL_ESTADOS` + `ASIGNACIONES`), asignación de responsable (`T2`), cambio de estado (`T3`), reclasificación (`T4`), aceptación de sugerencia de IA (`T7→T4`) y alerta de conflicto `409` con botón para recargar la versión actual.
  - **Usuarios (`UsuariosPage.tsx`):** listado del personal del conjunto, formulario para agregar/invitar usuario (`ADMIN` / `SOPORTE`) y conmutador para cambiar rol o activar/desactivar membresía.
  - Verificar en navegador con `ui-verifier` (Playwright a `375px` y escritorio, sin errores de consola).

---

### Ola 2 — Residentes, Cola de Validación, Identidad del Conjunto y Catálogos (`F3`)

- [ ] **Tarea 6 — Backend de `Residentes`, `Validación`, `Identidad` y `Catálogos` (`opus` + `db-reviewer`):**
  - Crear `apps/api/src/modules/residentes.ts`: listar, crear (vinculando correos huérfanos del mismo remitente en el conjunto), editar/desactivar y vincular correo manual (`POST /api/correos/:id/vincular-residente`).
  - Añadir consulta `colaValidacion` en `consultas.ts` (`GET /api/validacion`) y `obtenerCatalogos` (`GET /api/catalogos`).
  - Añadir `actualizarIdentidadConjunto` en `conjuntos.ts` (`PATCH /api/conjunto/identidad`).
  - Cubrir todo con pruebas de integración contra SQL Server real (incluyendo aislamiento entre conjuntos).
- [ ] **Tarea 7 — Frontend Ola 2 en `apps/web` (`Validación`, `Residentes`, `Identidad`, `Catálogos`) (`sonnet` + `ui-verifier`):**
  - **Validación (`ValidacionPage.tsx`):** pestaña 1 de *Sugerencias de IA pendientes* (aprobar con `aceptar-sugerencia` o corregir con `reclasificar`) y pestaña 2 de *Remitentes sin residente* (asociar a residente existente o registrar nuevo residente).
  - **Residentes (`ResidentesPage.tsx`):** directorio con búsqueda, registro de residente, activación/desactivación y modal/drawer con sus solicitudes en el conjunto.
  - **Identidad (`IdentidadPage.tsx`):** editor de nombre, logo y colores (`primario`, `acento`, `secundario`) con vista previa en vivo, validador de contraste WCAG AA (`derivarTema.ts`) y guardado en `PATCH /api/conjunto/identidad` que actualiza la sesión y el tema activo al instante.
  - **Catálogos (`CatalogosPage.tsx`):** visualización de categorías oficiales, tabla de prioridades con horas de SLA, diagrama/tabla de transiciones de estado permitidas y diccionario de palabras clave del motor de dominio.
  - Verificar con Playwright (`ui-verifier`).

---

### Ola 3 — Reportes T5, Auditoría Global, Laboratorio IA y Limpieza (`F4`)

- [ ] **Tarea 8 — Backend de `Auditoría` y `Laboratorio IA` (`sonnet`):**
  - Añadir `listarAuditoriaConjunto` en `consultas.ts` (`GET /api/auditoria` en aislamiento `SNAPSHOT`) y `POST /api/laboratorio/probar` en `app.ts` usando `enmascarar`, `clasificar` y `priorizar` de `apps/api/src/domain`.
- [ ] **Tarea 9 — Frontend Ola 3 en `apps/web` (`Reportes`, `Auditoría`, `Laboratorio IA`) y retiro de marcadores (`sonnet` + `ui-verifier`):**
  - **Reportes (`ReportesPage.tsx`):** filtro de fechas (`desde`/`hasta`), tarjetas de KPIs globales (% dentro de SLA, tiempo promedio de primera respuesta, totales), distribución por estado/categoría/prioridad, tabla de carga por responsable y botón de descarga CSV (`GET /api/reportes?formato=csv`).
  - **Auditoría (`AuditoriaPage.tsx`):** tabla cronológica de eventos del conjunto con buscador por código de solicitud o usuario.
  - **Laboratorio IA (`LaboratorioIaPage.tsx`):** área de prueba en vivo que muestra el paso a paso real (texto original → texto enmascarado Ley 1581 → clasificación y priorización por reglas del dominio).
  - Eliminar `ProximamentePage.tsx` de `router.tsx` y ejecutar verificación completa (`npm run gate` + `npm run build` y `npm test` en `apps/web` + `ui-verifier` en todas las rutas).
