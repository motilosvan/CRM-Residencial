# Arquitectura

## 1. Estilo

Arquitectura en **tres capas** (presentación, lógica de negocio, datos) más un **Email Gateway**, como propone el informe del proyecto. La lógica de negocio sigue el patrón **Transaction Script** (Fowler): cada caso de uso es una función que abre una transacción, valida, escribe y deja historial. La capa de datos no es solo «tablas»: incluye las restricciones, triggers y permisos que hacen cumplir las reglas aunque alguien se salte la aplicación.

## 2. Contexto y contenedores

```text
 Residente ──correo──► Gmail del conjunto
                           │ IMAP (S3)
                 ┌─────────▼─────────┐
                 │  Email Gateway    │  proceso aparte; llama a T1 en el mismo proceso
                 └─────────┬─────────┘  (importa backend/api/src/modules)
                           │
 Administrador /  ┌────────▼───────────────────────────────┐
 Soporte ─HTTPS──►│ API (Fastify, S4) + panel estático (S5) │  mismo origen (cookie httpOnly)
                  │  modules/  T1–T4 (escritura)            │
                  │  modules/consultas.ts (lectura SNAPSHOT)│
                  │  domain/   reglas puras                 │
                  └────────┬───────────────────────────────┘
                           │ login soc_app (rol crm_app)
                  ┌────────▼───────────────────────────────┐
                  │ SQL Server 2022                          │
                  │  tablas + FK/CHECK/UNIQUE                │
                  │  índices filtrados, triggers de reglas   │
                  │  RCSI + SNAPSHOT, rol de mínimo privilegio│
                  └──────────────────────────────────────────┘
                     ▲ login migrador (solo npm run db:migrate)
```

## 3. Correspondencia capas ↔ carpetas

| Capa | Carpeta | Contenido |
|---|---|---|
| Presentación | `index.html`, `css/`, `js/` (S5); hoy `backend/api/src/demo/` | Panel; el visor demo es provisional |
| Lógica de negocio | `backend/api/src/domain/` | Clasificador, priorizador, máquina de estados (sin BD) |
| Lógica de negocio | `backend/api/src/modules/` | Transacciones T1–T4 y consultas |
| Acceso a datos | `backend/api/src/db/` | `withTx`, pool, migraciones, login de la app |
| Datos | SQL Server + `backend/db/migrations/` | Esquema, restricciones, triggers, permisos |
| Integración | `backend/gateway/` (S3) | Lectura IMAP → T1 |

## 4. Decisiones (ADR resumidos)

| # | Decisión | Motivo | Alternativa descartada |
|---|---|---|---|
| 1 | SQL Server 2022 | El equipo ya tenía el script de la línea base en T-SQL | PostgreSQL (la guía inicial) |
| 2 | RCSI + SNAPSHOT | Lectores sin bloquear escritores; reportes con foto consistente | READ COMMITTED con bloqueos |
| 3 | `UPDLOCK` + columna `version` en toda escritura | Serializa escritores y detecta vistas desactualizadas (409) | Solo una de las dos |
| 4 | Reglas del ciclo de vida también en un trigger | La BD las garantiza ante SQL directo; el código da mensajes claros | Solo en el código |
| 5 | Rol `crm_app` sin DELETE/ALTER; migrador aparte | Con `sa` las garantías se pueden desactivar | Un único usuario administrador |
| 6 | `ASIGNADA` solo se alcanza asignando | Nunca hay una solicitud asignada sin responsable | Permitirla en «cambiar estado» |
| 7 | Clasificación por reglas en código | Simple y probable sin BD; suficiente para el MVP | Tabla editable de reglas / modelo de ML |
| 8 | Gateway en proceso aparte que reutiliza los módulos | Sin duplicar SQL ni depender de la API HTTP (S3 va antes que S4) | Gateway que llama a la API REST |
| 9 | Panel servido por la API (mismo origen) | Cookies `httpOnly` sin CORS | Abrir `index.html` como archivo |
| 10 | Multi-conjunto en la BD y acceso por código OTP por correo (B1) | El conjunto es la frontera de los datos (`idConjunto` en las tablas y membresía en `USUARIO_CONJUNTOS`); el acceso no usa contraseña: un código de 6 dígitos por correo, con solo su HMAC guardado. Motivo no escrito en la entrevista; ver `docs/mailflow-backend-entrevista.md` | Login con contraseña (argon2, previsto en S4-01) |
| 11 | Buzón IMAP por conjunto en la BD (`BUZONES_CONJUNTO`, 0008) con la contraseña de aplicación cifrada (AES-256-GCM, clave HKDF-SHA256 de `AUTH_SECRETO`, info `mailflow-buzon-imap-v1`; se guarda IV ‖ tag ‖ texto). El ADMIN lo conecta desde la API tras una prueba IMAP en vivo, y el gateway recorre todos los buzones activos | Cada conjunto trae su propia cuenta sin tocar `.env` ni reiniciar procesos; GCM detecta un blob manipulado o una clave distinta en vez de devolver basura | Credenciales `IMAP_*` en `.env` (un solo buzón por despliegue); OAuth2 de Google (alcance restringido: caduca en modo Testing y exige verificación CASA) |
| 12 | La conexión IMAP llega inyectada a la API (`DepsBuzon`): `modules/` y `http/` nunca importan `backend/gateway` ni `imapflow`; solo `server.ts` (raíz de composición) cablea `backend/gateway/src/adaptadorBuzon.ts` | El gateway ya depende de la API (ADR 8); la dependencia inversa crearía un ciclo y ataría las pruebas de la API a IMAP (se prueban con dobles) | Mover `FuenteImap` a `backend/api` (la API cargaría imapflow y la lógica del ciclo) |
| 13 | Servidores IMAP en lista blanca (`IMAP_HOSTS_PERMITIDOS`, por defecto solo `imap.gmail.com`) y solo el puerto 993: `guardarBuzon` responde 422 antes de abrir cualquier conexión | La prueba de conexión la dispara un ADMIN desde la API: con host y puerto libres, el servidor serviría para abrir conexiones a hosts y puertos internos (SSRF) | Host y puerto libres (cualquier servidor IMAP sin configurar nada) |

**Notas a los ADR 11 y 12.**
- *Rotar `AUTH_SECRETO` invalida las contraseñas de buzón guardadas.* El gateway no puede descifrarlas: marca `ultimoError = 'CLAVE'`, omite ese buzón y sigue con los demás; la sincronización manual responde 422 pidiendo reconectar. El ADMIN vuelve a conectar el buzón (se cifra con el secreto nuevo). Descartado: guardar varias claves con versión, innecesario mientras la rotación sea manual.
- *El candado de sincronización manual es por proceso* (un `Set` en memoria de la API, por `idConjunto`): evita dos sincronizaciones manuales simultáneas del mismo conjunto, pero no coordina la API con el gateway. Si ambos leen a la vez, T1 (Message-ID único) y el checkpoint T6 absorben la repetición. Descartado: un candado en la BD (`sp_getapplock`) que mantendría una transacción abierta durante E/S de red.
- *La telemetría del buzón no sube `version`.* `registrarResultadoSincronizacion` solo escribe `ultimaSincronizacion` y `ultimoError` (sin auditoría): si subiera la versión, cada ciclo del gateway (cada 45 s) invalidaría la vista del ADMIN y su siguiente escritura daría 409. `version` y `actualizadoEn` cambian solo con conectar/desconectar, que sí auditan en `AUDITORIA_ADMIN` sin la dirección ni la contraseña.
- *`ultimoError` admite `INTERNO`*: un ciclo (gateway o sincronización manual) que falla por algo que no es la conexión (un correo que no se pudo guardar, la BD caída) lo anota así; el log solo lleva tipo y código, y la sincronización manual lo devuelve como 500. Carrera aceptada: un ciclo en curso con la contraseña vieja puede escribir `AUTENTICACION` justo después de una reconexión; el siguiente ciclo lo corrige.
- *La prueba de conexión al conectar dura como máximo 15 s* (esperas de imapflow para conexión, saludo y socket, más un temporizador global que cierra la sesión); el ciclo normal conserva las esperas por defecto de imapflow.
- *Ninguna transacción abierta durante E/S de red*: la prueba IMAP va antes de `withTx`, y la sincronización fuera de toda transacción (T1 abre la suya por correo).
- *Clave del checkpoint = `idConjunto:usuario/carpeta`* (`cuentaCheckpoint`). `TR_Checkpoint_conjunto_fijo` ata cada fila de `GATEWAY_CHECKPOINT` a un conjunto, y una cuenta desconectada de un conjunto puede reconectarse en otro. El checkpoint antiguo `usuario/carpeta` queda huérfano: la primera lectura relee `diasIniciales` días y, dentro del MISMO conjunto, T1 los absorbe por Message-ID (`UX_Correos_messageId` es `(idConjunto, messageId)`). Si una cuenta se desconecta del conjunto A y se conecta en el conjunto B, esa absorción no aplica: la primera lectura en B trae los correos de los últimos `diasIniciales` días y los guarda en B como solicitudes nuevas. Quien conecta la cuenta ya posee su contraseña, pero es un efecto a tener presente (datos personales, Ley 1581) y se evita conectando con `diasIniciales = 0`. Si la clave superara 255 caracteres se rechaza al conectar (422), nunca se trunca.
- *La lista blanca de servidores IMAP se aplica al guardar el buzón, no en cada sincronización*: reducir `IMAP_HOSTS_PERMITIDOS` no desconecta los buzones ya guardados (para sacarlos hay que desconectarlos).

**Nota al ADR 9 (B1).** El panel corre hoy detrás del proxy de Vite (`localhost:5173`), no lo sirve la API. La cookie `mailflow_sesion` (`HttpOnly; SameSite=Lax; Path=/api`) funciona igual porque panel y API comparten origen en desarrollo, sin CORS. Se agrega `Secure` cuando `COOKIE_SEGURA=true`. El ADR no se reescribe.

## 5. Garantías y dónde viven

Ver la sección 5 de [`estudio-funcionalidad-y-bd-transaccional.md`](estudio-funcionalidad-y-bd-transaccional.md).

## 6. Frontend MailFlow

El panel `frontend` se rehace como MailFlow (multi-conjunto, solo personal). Spec: [`mailflow-entrevista.md`](mailflow-entrevista.md); plan de F1: [`plan-mailflow-f1.md`](plan-mailflow-f1.md). Decisiones de implementación (React Router en modo datos, `tsconfig` único, `culori`, sesión en `localStorage`) están en la sección «Decisiones mías» de ese plan.

- Servicios definidos como interfaces, con implementación simulada en `frontend/src/services/mock` y cliente `fetch` en `services/http` (B1). Con `VITE_USAR_MOCK=1` o en las pruebas se usa el mock.
- Tema por conjunto: sobrescribe las variables CSS de shadcn en `<html>`; si la paleta del conjunto no cumple AA, se usa la de MailFlow.
- Solo modo claro. Esto elimina el modo oscuro de la entrevista (decisión 16) y no reescribe ningún ADR de esta tabla.
- El panel anterior vive en `frontend-legacy` como referencia hasta F4.

Objeciones abiertas (no bloquean F1; se argumentan antes de F2):

1. **Buzón real sin noción de conjunto (resuelta en B1):** `/api/correos`, `/api/correos/:id` y `/api/gateway/estado` filtran por el conjunto activo de la sesión; un correo de otro conjunto responde 404.
2. **Cambio de conjunto sin código nuevo (resuelta en B1):** `POST /api/auth/conjunto` valida en el servidor la membresía activa en cada cambio; sin membresía responde 403.
3. **Sesión en `localStorage` (resuelta en B1):** la sesión vive en la cookie `httpOnly` `mailflow_sesion` (token aleatorio, solo su hash en `SESIONES`); `localStorage` guarda solo `ultimaActividad` y `motivoCierre`.
4. **ADR 9 vigente:** el panel hoy corre detrás del proxy de Vite, no lo sirve la API. Documentado en la nota bajo la tabla de decisiones; el ADR no se reescribe.
