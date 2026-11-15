# MailFlow B1 — Backend multi-conjunto, acceso OTP y sesión real

> **Para quien ejecute:** usar `superpowers:subagent-driven-development` (tareas en serie, un commit por tarea, sin push). Los pasos usan `- [ ]`. Al aprobarse, copiar este plan a `docs/plan-mailflow-b1.md` (como `docs/plan-mailflow-f1.md`).

**Objetivo:** que el login de `apps/web` funcione contra Fastify + SQL Server con conjuntos en BD, código OTP por correo, sesión en cookie `httpOnly` y rutas actuales protegidas y filtradas por conjunto.

**Arquitectura:** migración `0007` añade `CONJUNTOS`, `USUARIO_CONJUNTOS`, `RETOS_ACCESO`, `SESIONES` e `idConjunto` en `RESIDENTES`/`CORREOS`/`GATEWAY_CHECKPOINT`. Los módulos nuevos (`conjuntos`, `acceso`, `sesiones`) siguen el patrón existente: Zod + `withTx` + SQL parametrizado + reloj inyectable. Fastify valida la cookie en un `preHandler` y pasa `idConjuntoActivo` a las consultas. El panel cambia mocks por clientes `fetch` y deja de guardar la sesión en `localStorage`.

**Stack:** Fastify 5, `mssql`, Zod 4, Vitest (integración contra SQL Server real). Dependencias nuevas en la raíz: `@fastify/cookie`, `nodemailer`, `@types/nodemailer`.

**Spec:** `docs/mailflow-backend-entrevista.md` (decisiones 1–12, borrador SQL y contratos HTTP). Este plan no repite sus tablas: se leen juntos.

## Contexto

F1 dejó el panel MailFlow completo pero con servicios simulados y cuatro objeciones abiertas (`docs/arquitectura.md` §6): buzón sin noción de conjunto, cambio de conjunto sin validar en servidor, sesión en `localStorage` y ADR 9. La API real (`apps/api/src/http/app.ts`) es solo lectura, sin login, y `consultas.ts` no filtra por conjunto. B1 cierra las tres primeras objeciones; B2 (buzón, solicitudes, escrituras T2–T4/T7 en MailFlow) queda fuera.

## Decisiones confirmadas en esta sesión (usuario, 2026-11-14)

1. **Sin `DEFAULT` de `idConjunto` en la BD.** Olvidar el conjunto falla. Las ~35 inserciones SQL crudas de las pruebas se editan (las aserciones no cambian). Solo `ingestarCorreo` conserva valor por defecto (decisión 5 del spec).
2. **Manda `USUARIO_CONJUNTOS.rol`.** Sesión y trigger de `ASIGNACIONES` usan la membresía. `USUARIOS.rol` queda heredada; sus lectores (T2, `resumen()`) migran en B2.
3. **Un reto por `(idConjunto, correo)`**: índice único y reutilización con `UPDATE`. Sin límite por IP en B1: es requisito previo a exponer la API fuera de `127.0.0.1`. Esto precisa la decisión 7 del spec (se actualiza el doc).

## Decisiones mías (refutables)

| Decisión | Porqué | Descartado |
|---|---|---|
| Clave HMAC en `AUTH_SECRETO` (≥32 caracteres, obligatoria, sin valor por defecto) | El spec pide HMAC pero no dice de dónde sale la clave; sin ella la API no arranca, igual que `DB_PASSWORD` | Clave derivada de `DB_PASSWORD` (acopla dos secretos) |
| El correo se envía **después** del COMMIT y sin esperar la respuesta SMTP | `withTx` puede reejecutar `fn` (no admite efectos externos) y esperar SMTP delataría por tiempo qué correos existen | Enviar dentro de la transacción |
| Un fallo de SMTP responde `200` igual y se registra solo el tipo de error | Responder distinto rompería la no-enumeración | `502` al fallar el envío |
| Las horas de retos y sesiones se calculan en Node (`ahora()` inyectable) y viajan como parámetros | Permite probar vencimientos sin esperar; mismo patrón que `OpcionesMock.ahora` | `SYSUTCDATETIME()` en SQL |
| `ultimaActividad` se escribe como mucho cada 60 s | Evita un `UPDATE` por petición | Escribir en cada petición |
| El panel avisa al servidor de la actividad con `GET /api/auth/sesion` cada ≤5 min mientras haya actividad | El servidor solo ve peticiones: alguien leyendo 30 min sin pedir datos perdería la sesión | Confiar solo en el reloj del navegador |
| Cookie sin `Max-Age` (de sesión); `Secure` solo si `COOKIE_SEGURA=true` | En desarrollo todo es `http://localhost` tras el proxy de Vite | `Secure` siempre |
| Los `POST` rechazan un `Origin` ajeno (`WEB_ORIGENES`, por defecto `http://localhost:5173,http://127.0.0.1:5173`) | `SameSite=Lax` no cubre todo; es una comprobación barata junto a `hostsPermitidos` | Token CSRF |
| Se conserva `FK_Correos_Residentes` y se **añade** `FK_Correos_Residentes_conjunto` | La prueba actual espera el nombre `FK_Correo…`; la compuesta añade la garantía entre conjuntos | Reemplazar la FK |
| Rama `mailflow-b1` desde `mailflow` | La integración de `mailflow` sigue pendiente de decisión del usuario | Trabajar sobre `mailflow` |

## Objeciones que quedan abiertas (no bloquean B1)

- **`apps/web-legacy` deja de funcionar contra `npm run api`** desde la tarea 6 (recibe `401`: no tiene login). `npm run demo` no se ve afectado. Si se necesita el legado con datos reales antes de B2, hay que decirlo antes de ejecutar.
- **`RETOS_ACCESO` y `SESIONES` no se podan** (`crm_app` sin `DELETE`). Con una fila por correo el crecimiento es lento, pero la poda (tarea del migrador) queda sin dueño.
- **ADR 9** dice "panel servido por la API"; hoy es el proxy de Vite. La cookie funciona igual (mismo origen `localhost:5173`, `Path=/api`). Se documenta, no se reescribe el ADR.
- **`.env.example`** aparece borrado en `git status` y el sandbox enmascara `./.env.*`: es un artefacto del sandbox, no un cambio real. Editarlo exige ejecutar fuera del sandbox; si se deniega, se entrega el bloque de variables al usuario.

## Restricciones globales

- Reglas de `CLAUDE.md`: dominio puro, SQL parametrizado (`request.input`), `crm_app` sin `DELETE`/`ALTER`, no editar migraciones 0002–0006 ni `ScriptBaseDatosCRM.sql`, pruebas primero, español.
- Ningún correo real en fixtures ni logs: usar `@demo.mailflow.test` y `@mail.com`. El código OTP nunca se guarda en claro ni se registra fuera de `EnviadorLocal`.
- Valores del spec: código de 6 dígitos, vigencia 10 min, reenvío 60 s, 5 intentos, bloqueo 15 min, inactividad 30 min, cookie `mailflow_sesion` (`HttpOnly; SameSite=Lax; Path=/api`).
- Slug inicial `parque-central-occidente`, nombre `Parque Central de Occidente`, paleta `#355E3B` / `#D6A64F` / `#789653`.
- Fechas hacia el panel en **epoch ms** (así están los contratos de `apps/web/src/services/contratos.ts`). `Conjunto.id` y `Usuario.id` son el entero como texto.
- Cuerpo de error: `{ error: string, codigo?: string, intentosRestantes?: number, desbloqueoEn?: number }` (se conserva `error` de hoy).
- Modelos de subagente: tareas 1–5 `opus`; 6–9 `sonnet`; 10 `haiku`; revisión final `fable`. `db-reviewer` tras la tarea 5; `ui-verifier` tras la 9. El orquestador corre `npm run gate` y el build él mismo.

## Foco de revisión (cada línea tiene su prueba en la tarea indicada)

1. Correo con mayúsculas o espacios (`" Admin@Demo.Mailflow.Test "`) → se normaliza (`trim` + minúsculas) en `codigo` y `verificar`; el reto es el mismo. (T4)
2. Dos `verificar` simultáneos con el código correcto → exactamente una sesión; el otro recibe `CODIGO_INCORRECTO`. (T4)
3. Usuario desactivado o membresía retirada con sesión viva → `401 NO_AUTENTICADO` en la siguiente petición y la sesión queda revocada. (T5)
4. Cookie ausente, vacía, alterada o de 10 000 caracteres → `401`, nunca `500`. (T6)
5. Pedir un código nuevo no reinicia `intentosFallidos` (no se evade el tope de 5 reenviando). (T4)

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `db/migrations/0007_conjuntos_y_acceso.sql` (nuevo) | Esquema, relleno, índices, FK compuesta, trigger, permisos |
| `apps/api/src/db/migration0007.test.ts` (nuevo) | Relleno de datos previos y garantías de la 0007 |
| `apps/api/test/helpers/testDb.ts` | `SLUG_INICIAL`, `CONJ_SQL`, `idConjuntoInicial(db)`, `crearUsuario(db, …)` |
| `apps/api/src/modules/conjuntos.ts` (nuevo) | `listarConjuntos`, `idConjuntoPorSlug`, `SLUG_CONJUNTO_INICIAL` |
| `apps/api/src/modules/ingesta.ts`, `consultas.ts` | `idConjunto` en T1/T6 y en las lecturas del buzón |
| `apps/api/src/modules/acceso.ts` (nuevo) | Retos OTP: `solicitarCodigo`, `verificarCodigo` |
| `apps/api/src/modules/sesiones.ts` (nuevo) | `crearSesion`, `leerSesion`, `cambiarConjuntoActivo`, `revocarSesion` |
| `apps/api/src/modules/enviador.ts` (nuevo) | `EnviadorCodigo`, `EnviadorSmtp`, `EnviadorLocal` |
| `apps/api/src/modules/semilla.ts` (nuevo) | `asegurarUsuariosIniciales` |
| `apps/api/src/errors.ts`, `config.ts` | `ErrorAcceso`; `accesoConfigFromEnv` |
| `apps/api/src/http/app.ts`, `server.ts` | Cookie, `preHandler`, rutas de acceso, cableado |
| `apps/gateway/src/config.ts`, `main.ts`, `sincronizar.ts` | `IMAP_CONJUNTO_SLUG` → `idConjunto` |
| `apps/web/src/services/http/{cliente,conjuntosHttp,authHttp}.ts` (nuevos) | Clientes `fetch` de `/api/*` |
| `apps/web/src/services/{contratos,index}.ts`, `mock/*` | Contrato ampliado, selector mock/HTTP, datos alineados |
| `apps/web/src/store/sesion.ts`, `hooks/useInactividad.ts`, `features/app/*`, `features/auth/PasoCodigo.tsx` | Sesión rehidratada desde el servidor |

---

### Tarea 0: Preparación

- [ ] Crear rama `mailflow-b1` desde `mailflow`. Commit de `docs/mailflow-backend-entrevista.md` y de este plan en `docs/plan-mailflow-b1.md`.
- [ ] `docker compose up -d db` y `npm run gate`: anotar el número real de pruebas en verde como línea base (el spec dice 311).
- [ ] `npm install @fastify/cookie nodemailer` y `npm install -D @types/nodemailer` en la raíz. Commit: "Agrega dependencias de acceso y prepara B1".

### Tarea 1: Migración `0007_conjuntos_y_acceso.sql` (opus)

**Archivos:** crear `db/migrations/0007_conjuntos_y_acceso.sql`, `apps/api/src/db/migration0007.test.ts`; modificar `apps/api/test/helpers/testDb.ts` y las pruebas con SQL crudo (`constraints.test.ts`, `migration0002.test.ts` líneas posteriores a la migración completa, `roles.test.ts`, `app.test.ts`, `buzon.test.ts`, `ingesta.test.ts`, `sugerencias.test.ts`, `transacciones.test.ts`, `apps/worker-ia/src/procesar.test.ts`, `apps/api/src/demo/seed.ts`).

**Produce:**
- `testDb.ts`: `export const SLUG_INICIAL = 'parque-central-occidente'`; `export const CONJ_SQL = "(SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = 'parque-central-occidente')"`; `idConjuntoInicial(db: TestDb): Promise<number>`; `crearUsuario(db, { nombre, correo, rol, slug?, activo? }): Promise<number>` (inserta `USUARIOS` + `USUARIO_CONJUNTOS`).
- Tablas del borrador del spec más: `CK_UsuConj_rol CHECK (rol IN ('ADMIN','SOPORTE'))`; `CK_Conjuntos_color*` (`LIKE '#[0-9A-Fa-f]…'` × 6 o `NULL`); `UX_Retos_conjunto_correo UNIQUE (idConjunto, correo)`; `IX_Sesiones_idUsuario`.

- [ ] **Paso 1 — prueba que falla** (`migration0007.test.ts`, mismo esquema que `migration0002.test.ts`: migrar hasta 0006 con una carpeta temporal, sembrar, aplicar todo):
  - Datos previos (1 residente, 2 usuarios `ADMIN`/`SOPORTE`, 2 correos, 1 checkpoint) quedan con `idConjunto` = Parque Central; cada usuario tiene fila en `USUARIO_CONJUNTOS` con su rol y `activo`.
  - `CONJUNTOS` tiene exactamente una fila: slug, nombre y los tres colores del spec.
  - Reaplicar `migrate` no cambia nada (`aplicadas` vacío).
  - Con un segundo conjunto insertado por el migrador: mismo `correo` de residente y mismo `messageId` se aceptan en conjuntos distintos y se rechazan en el mismo (`/UX_Residentes_correo/`, `/UX_Correos_messageId/`).
  - `CORREOS` del conjunto A con `idResidente` del conjunto B → `/FK_Correos_Residentes_conjunto/`; con `idResidente NULL` se acepta.
  - `INSERT INTO RESIDENTES (nombre, unidad)` sin `idConjunto` → error por `NULL` (no hay `DEFAULT`).
  - `ASIGNACIONES` con responsable sin membresía activa en el conjunto de la solicitud → `/50020/`; ídem si quien asigna no la tiene; con ambas membresías activas se acepta.
  - Como `crm_app` (patrón de `roles.test.ts`): `INSERT`/`UPDATE` en `RETOS_ACCESO`, `SESIONES`, `USUARIO_CONJUNTOS` permitidos; `DELETE` en las tres y `INSERT` en `CONJUNTOS` denegados.
- [ ] **Paso 2:** `npx vitest run apps/api/src/db/migration0007.test.ts` → falla (no existe la migración).
- [ ] **Paso 3 — migración**, idempotente como 0002–0006 (`IF OBJECT_ID(...) IS NULL`, `COL_LENGTH`), en este orden: `CONJUNTOS` + fila inicial → `USUARIO_CONJUNTOS` + copia desde `USUARIOS` → `idConjunto` (añadir `NULL`, rellenar, `ALTER … NOT NULL`, FK a `CONJUNTOS`) en las tres tablas → recrear `UX_Residentes_correo (idConjunto, correo) WHERE correo IS NOT NULL` y `UX_Correos_messageId (idConjunto, messageId)` → `UQ_Residentes_conjunto_id UNIQUE (idConjunto, idResidente)` y `FK_Correos_Residentes_conjunto` → `RETOS_ACCESO`, `SESIONES` → `CREATE OR ALTER TRIGGER dbo.TR_Asignaciones_membresia` (`AFTER INSERT, UPDATE`; une `inserted` → `SOLICITUDES` → `CORREOS`; `THROW 50020`) → `GRANT INSERT, UPDATE` a `crm_app` sobre las tres tablas nuevas de escritura.
- [ ] **Paso 4 — fixtures:** añadir `idConjunto` (con `CONJ_SQL`) a cada `INSERT` crudo en `RESIDENTES`/`CORREOS`/`GATEWAY_CHECKPOINT` posterior a la migración completa; donde se asigna, crear usuarios con `crearUsuario`. `seed.ts` inserta membresías y `idConjunto`. No se cambia ninguna aserción.
- [ ] **Paso 5:** `npm run gate` → verde, con la línea base de la tarea 0 más las pruebas nuevas. (`ingesta.ts` aún no pasa `idConjunto`: este paso solo queda verde junto con el paso 3 de la tarea 2; si el gate falla únicamente por `INSERT INTO CORREOS` de `ingesta.ts`, continuar con la tarea 2 y commitear ambas juntas.)
- [ ] **Paso 6:** commit "Agrega conjuntos, membresías, retos y sesiones a la base de datos".

### Tarea 2: Ingesta y gateway por conjunto (opus)

**Archivos:** `apps/api/src/modules/conjuntos.ts` (nuevo), `ingesta.ts`, `ingesta.test.ts`, `apps/gateway/src/{config,main,sincronizar}.ts` y sus pruebas.

**Produce:**
- `conjuntos.ts`: `SLUG_CONJUNTO_INICIAL`; `interface ConjuntoPublico { id: string; slug: string; nombre: string; logoUrl?: string; paleta?: { primario: string; acento: string; secundario?: string } }`; `listarConjuntos(pool): Promise<ConjuntoPublico[]>` (solo `activo = 1`, orden por nombre, `paleta` solo si hay primario y acento); `idConjuntoPorSlug(pool, slug): Promise<number>` (lanza `NotFound`).
- `CorreoEntranteSchema` gana `idConjunto: z.number().int().positive().optional()`.
- `ConfigGateway.conjuntoSlug: string` (de `IMAP_CONJUNTO_SLUG`, por defecto el inicial); `OpcionesSincronizar.idConjunto: number`.

- [ ] **Prueba primero** (`ingesta.test.ts`, bloque nuevo "multi-conjunto"): sin `idConjunto` el correo queda en Parque Central; el mismo `messageId` en dos conjuntos crea dos solicitudes y repetido en el mismo da `{ duplicado: true }`; el residente se vincula solo si su correo está en **ese** conjunto (mismo correo registrado en otro conjunto → `idResidente: null`); un checkpoint cuya `cuenta` ya pertenece a otro conjunto hace fallar la transacción sin guardar el correo. `listarConjuntos` devuelve la fila inicial con su paleta y omite un conjunto inactivo.
- [ ] Ejecutar → falla. Implementar: `@idConjunto` resuelto con `COALESCE(@idConjunto, (SELECT idConjunto FROM dbo.CONJUNTOS WHERE slug = @slugInicial))`; búsqueda de residente por `(idConjunto, correo)`; `avanzarCheckpoint` filtra y escribe `idConjunto`.
- [ ] Gateway: `main.ts` resuelve `idConjuntoPorSlug` al arrancar (slug inexistente → mensaje y `exit 1`) y lo pasa a `sincronizar`, que lo añade a cada `ingestarCorreo`. Pruebas en `config.test.ts` (valor por defecto y explícito) y `sincronizar.test.ts` (los correos quedan en el conjunto indicado).
- [ ] `npm run gate` → verde. Commit "Asocia la ingesta y el gateway a un conjunto".

### Tarea 3: Consultas del buzón filtradas por conjunto (opus)

**Archivos:** `apps/api/src/modules/consultas.ts`, `buzon.test.ts`, `apps/api/src/demo/server.ts`, `apps/api/src/http/app.ts` (ajuste mínimo provisional de firma).

**Produce:** `listarCorreos(pool, idConjunto: number, filtro?)`, `detalleCorreo(pool, idConjunto: number, idCorreo: number)`, `estadoGateway(pool, idConjunto: number)`. `idConjunto` es obligatorio y posicional: no existe la variante "sin filtro".

- [ ] **Prueba primero** (`buzon.test.ts`): con correos en dos conjuntos, `listarCorreos` devuelve `total` y filas solo del pedido (también con `q`); `detalleCorreo` de un correo ajeno lanza `NotFound`; `estadoGateway` cuenta solo cuentas y correos del conjunto.
- [ ] Implementar: `AND c.idConjunto = @idConjunto` en `BUZON_FILTRO` y en el detalle; `WHERE idConjunto = @idConjunto` en ambas consultas de `estadoGateway`. Los llamadores actuales (`demo/server.ts`, `app.ts`, pruebas) pasan el id del conjunto inicial resuelto una vez al arrancar.
- [ ] `npm run gate` → verde. Commit "Filtra el buzón y el estado del gateway por conjunto".

### Tarea 4: Retos de acceso OTP (opus)

**Archivos:** `apps/api/src/modules/acceso.ts`, `acceso.test.ts`, `enviador.ts`, `enviador.test.ts` (nuevos); `apps/api/src/errors.ts`.

**Produce:**
- `errors.ts`: `class ErrorAcceso extends Error { constructor(readonly estado: 400|401|403|410|429, readonly codigo: 'CODIGO_INCORRECTO'|'CODIGO_VENCIDO'|'BLOQUEADO'|'REENVIO_PRONTO'|'NO_AUTENTICADO'|'SESION_INACTIVA'|'SIN_MEMBRESIA', readonly detalle?: { intentosRestantes?: number; desbloqueoEn?: number }) }`.
- `enviador.ts`: `interface EnviadorCodigo { enviar(m: { correo: string; codigo: string; conjunto: string; venceEn: Date }): Promise<void> }`; `class EnviadorSmtp` (`nodemailer.createTransport({ host, port, secure: port === 465, auth })`, asunto "Su código de acceso a MailFlow", texto en español con el código y los 10 minutos); `class EnviadorLocal` (guarda `ultimo` y escribe `[acceso] código (solo desarrollo): NNNNNN` sin el correo).
- `acceso.ts`: `interface DepsAcceso { secreto: string; enviador: EnviadorCodigo; ahora?: () => Date; generarCodigo?: () => string; registrarError?: (d: string) => void }`; `solicitarCodigo(pool, deps, { conjuntoId, correo }): Promise<{ venceEn: number; reenvioDisponibleEn: number }>`; `verificarCodigo(pool, deps, { conjuntoId, correo, codigo }): Promise<{ idUsuario: number; idConjunto: number }>`; `hashCodigo(secreto, idConjunto, correo, codigo): Buffer` = HMAC-SHA256 de `` `${idConjunto}|${correo}|${codigo}` ``.

**Reglas** (las mismas de `apps/web/src/services/mock/authMock.ts`, que es la referencia de comportamiento):
- Entrada: `conjuntoId` `/^\d{1,9}$/`, `correo` `trim().toLowerCase()` con forma de correo y ≤320, `codigo` sin espacios y `/^\d{6}$/`; si no, `ValidationError` (422). Conjunto inexistente o inactivo → `ValidationError`.
- `existeUsuario` = usuario `activo` con membresía `activo` en ese conjunto.
- `solicitarCodigo`, en `withTx` con `SELECT … WITH (UPDLOCK, HOLDLOCK)` sobre `(idConjunto, correo)`: bloqueado vigente → `429 BLOQUEADO` + `desbloqueoEn`; bloqueo vencido → `intentosFallidos = 0`, `bloqueadoHasta = NULL`; antes de `reenvioDisponibleEn` → `429 REENVIO_PRONTO`; si no, `UPDATE` o `INSERT` con hash nuevo, `venceEn = ahora + 10 min`, `reenvioDisponibleEn = ahora + 60 s`, `consumidoEn = NULL`, **sin tocar `intentosFallidos`**. Tras el COMMIT, y solo si `existeUsuario`: `void enviador.enviar(...).catch(...)` registrando el tipo de error, nunca el correo ni el código.
- `verificarCodigo`, misma fila con `UPDLOCK`; la transacción **devuelve** un resultado y el error se lanza después del COMMIT (un `throw` dentro revertiría el contador): sin fila → `400 CODIGO_INCORRECTO` con `intentosRestantes: 5` (sin escribir); bloqueado → `429`; `consumidoEn IS NULL` y `ahora > venceEn` → `410 CODIGO_VENCIDO` (sin contar); hash igual (`timingSafeEqual`), no consumido y `existeUsuario = 1` con membresía aún activa → `consumidoEn = ahora`, `intentosFallidos = 0`, éxito; cualquier otro caso → `intentosFallidos + 1`; al llegar a 5 → `bloqueadoHasta = ahora + 15 min`, `consumidoEn = ahora`, `429 BLOQUEADO`; si no, `400` con `intentosRestantes = 5 - intentosFallidos`.

- [ ] **Prueba primero** (`acceso.test.ts`, BD real, `EnviadorLocal`, reloj y `generarCodigo` inyectados):
  - Flujo feliz: `solicitarCodigo` devuelve `venceEn = t + 600_000` y `reenvioDisponibleEn = t + 60_000`; el enviador recibió el código; `verificarCodigo` devuelve `{ idUsuario, idConjunto }`; `codigoHash` en BD mide 32 bytes y no contiene el código.
  - Correo no registrado: misma respuesta, fila con `existeUsuario = 0`, enviador **no** llamado, el código "correcto" da `CODIGO_INCORRECTO`.
  - `REENVIO_PRONTO` a los 59 s y aceptado a los 60 s; `CODIGO_VENCIDO` a los 10 min + 1 ms; código ya usado → `CODIGO_INCORRECTO`.
  - 5 fallos → `BLOQUEADO` con `desbloqueoEn = t + 900_000`; bloqueado también para `solicitarCodigo`; a los 15 min se puede pedir de nuevo con el contador en 0.
  - Foco 1: `" Admin@Demo.Mailflow.Test "` opera sobre el mismo reto. Foco 2: `Promise.allSettled` de dos `verificarCodigo` correctos → 1 cumplido, 1 `CODIGO_INCORRECTO`. Foco 5: 3 fallos, nuevo código, 2 fallos más → `BLOQUEADO`.
  - Un enviador que rechaza no cambia la respuesta y `registrarError` recibe un texto sin `@`.
  - Usuario inactivo o con membresía inactiva se comporta como no registrado. `conjuntoId: 'abc'`, código `'12345'` y conjunto inexistente → `ValidationError`.
  - `enviador.test.ts`: `EnviadorSmtp` con `nodemailer` `jsonTransport` compone destinatario, asunto y un texto que incluye el código.
- [ ] Ejecutar → falla. Implementar. `npm run gate` → verde. Commit "Agrega los retos de acceso con código de un solo uso".

### Tarea 5: Sesiones (opus) + `db-reviewer`

**Archivos:** `apps/api/src/modules/sesiones.ts`, `sesiones.test.ts` (nuevos).

**Produce:**
- `interface SesionPublica { usuario: { id: string; nombre: string; correo: string; rol: 'ADMIN'|'SOPORTE' }; conjuntoActivo: ConjuntoPublico; conjuntos: ConjuntoPublico[]; ultimaActividad: number }` (`rol` = el de la membresía en el conjunto activo; `conjuntos` = membresías activas en conjuntos activos).
- `interface SesionActiva extends SesionPublica { idSesion: number; idUsuario: number; idConjuntoActivo: number }`.
- `crearSesion(pool, { idUsuario, idConjunto }, ahora?): Promise<{ token: string; sesion: SesionPublica }>` — `token = randomBytes(32).toString('base64url')`, se guarda `SHA-256(token)`.
- `leerSesion(pool, token: string | undefined, ahora?): Promise<SesionActiva>`; `cambiarConjuntoActivo(pool, token, conjuntoId: string, ahora?): Promise<SesionPublica>`; `revocarSesion(pool, token: string | undefined, ahora?): Promise<void>` (nunca lanza por token desconocido).
- Constantes `LIMITE_INACTIVIDAD_MS = 30 * 60_000`, `RENOVACION_MIN_MS = 60_000`.

- [ ] **Prueba primero:** crear y leer devuelve el DTO completo y en BD no aparece el token en claro; token ausente, vacío, desconocido o de 10 000 caracteres → `ErrorAcceso 401 NO_AUTENTICADO`; a los 30 min + 1 ms → `401 SESION_INACTIVA` y `revocadaEn` queda puesta (un segundo intento da `NO_AUTENTICADO`); una lectura a los 29 min renueva y permite otra 29 min después; dos lecturas con 10 s de diferencia no cambian `ultimaActividad`; tras `revocarSesion` → `NO_AUTENTICADO` y la fila sigue existiendo; `cambiarConjuntoActivo` a un conjunto con membresía activa devuelve el rol de **ese** conjunto; sin membresía → `403 SIN_MEMBRESIA`; `conjuntoId` no numérico → `ValidationError`. Foco 3: desactivar el usuario, o su membresía en el conjunto activo, hace que la siguiente lectura dé `401` y revoque.
- [ ] Implementar con `withTx` y `UPDLOCK` sobre la fila de `SESIONES` en las rutas que escriben. `npm run gate` → verde.
- [ ] Despachar `db-reviewer` sobre las tareas 1–5; aplicar hallazgos con su prueba. Commit "Agrega las sesiones con vencimiento por inactividad".

### Tarea 6: Rutas HTTP de acceso y protección (sonnet)

**Archivos:** `apps/api/src/http/app.ts`, `app.test.ts`, `acceso.http.test.ts` (nuevo).

**Produce:** `OpcionesApp` gana `acceso: DepsAcceso & { cookieSegura: boolean; origenesPermitidos: ReadonlySet<string> }`. Rutas y códigos exactamente como la tabla "Contratos HTTP de B1" del spec.

- [ ] **Prueba primero** (`acceso.http.test.ts`, con `app.inject`): `GET /api/conjuntos` público devuelve la lista; flujo completo `codigo` → `verificar` → `Set-Cookie` con `mailflow_sesion=`, `HttpOnly`, `SameSite=Lax`, `Path=/api` y sin `Secure` (con `cookieSegura: true` sí lo lleva) → `GET /api/auth/sesion` 200 → `POST /api/auth/conjunto` 200/403/422 → `POST /api/auth/salir` 200 `{ ok: true }` con cookie vaciada → `GET /api/auth/sesion` 401; cada error del contrato con su estado y `codigo` (`400`, `410`, `429` con `desbloqueoEn`, `422`); `POST` con `Origin: http://malicioso.test` → 403; `POST /api/auth/salir` sin cookie → 200. Foco 4: las cuatro cookies inválidas → `401` y `registrarError` no fue llamado. Un correo de otro conjunto por `/api/correos/:id` → 404.
- [ ] Adaptar `app.test.ts`: un `beforeAll` crea usuario y sesión con `crearUsuario` + `crearSesion` y `get()` envía la cookie; se añade "sin cookie ⇒ 401" para las tres rutas protegidas. Las aserciones existentes no cambian.
- [ ] Implementar: registrar `@fastify/cookie`; `onRequest` de `Origin` para métodos distintos de `GET`; `preHandler` `exigirSesion` que llama `leerSesion` y deja `req.sesion`; `setErrorHandler` traduce `ErrorAcceso` a `{ error, codigo, ...detalle }`; `/api/salud`, `/api/conjuntos`, `/api/auth/codigo` y `/api/auth/verificar` quedan públicas; actualizar el comentario de cabecera del archivo.
- [ ] `npm run gate` → verde. Commit "Protege la API con sesión y agrega las rutas de acceso".

### Tarea 7: Configuración, semilla y arranque (sonnet)

**Archivos:** `apps/api/src/config.ts`, `config.test.ts` (nuevo), `modules/semilla.ts`, `semilla.test.ts` (nuevos), `server.ts`, `.env.example`, `README.md` si lista variables.

**Produce:**
- `accesoConfigFromEnv(env): { secreto: string; smtp: { host: string; port: number; user: string; password: string; remitente: string } | null; adminInicialCorreo: string | null; cookieSegura: boolean; origenes: Set<string>; desarrollo: boolean }` — `AUTH_SECRETO` obligatorio y ≥32; `smtp` es `null` si falta `SMTP_HOST`; `desarrollo = env.NODE_ENV !== 'production'`; en producción sin SMTP lanza (no hay forma de entregar el código).
- `asegurarUsuariosIniciales(pool, { adminCorreo: string | null; demo: boolean }): Promise<void>` — idempotente; asegura `USUARIOS` + membresía `ADMIN` activa en el conjunto inicial para `adminCorreo`; con `demo`, también `admin@demo.mailflow.test` (`ADMIN`) y `soporte@demo.mailflow.test` (`SOPORTE`).

- [ ] **Prueba primero:** `config.test.ts` (falta `AUTH_SECRETO`, secreto corto, sin SMTP en desarrollo → `smtp: null`, sin SMTP en producción → error que nombra la variable y no su valor); `semilla.test.ts` (dos ejecuciones dejan una fila por usuario y membresía; un usuario existente sin membresía la recibe; `demo: false` no crea los de demostración).
- [ ] Implementar y cablear `server.ts`: `EnviadorSmtp` si hay SMTP, si no `EnviadorLocal`; llamar a la semilla antes de `listen`; pasar `acceso` a `construirApp`.
- [ ] `.env.example` (fuera del sandbox, ver "Objeciones"): `AUTH_SECRETO`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `ADMIN_INICIAL_CORREO`, `COOKIE_SEGURA`, `WEB_ORIGENES`, `IMAP_CONJUNTO_SLUG`, cada una con su comentario.
- [ ] `npm run gate` → verde. Arrancar `npm run api` y comprobar con `curl` que `/api/conjuntos` responde y `/api/correos` da 401. Commit "Configura el envío de códigos y siembra los usuarios iniciales".

### Tarea 8: Servicios HTTP del panel (sonnet)

**Archivos:** `apps/web/src/services/http/{cliente,conjuntosHttp,authHttp}.ts` y sus `.test.ts` (nuevos); `services/{contratos,index}.ts`; `services/mock/{authMock,datos}.ts` y pruebas; `src/tema/paletas.ts`; `src/vite-env.d.ts`.

**Produce:**
- `AuthService` gana `sesion(): Promise<Sesion | null>` (`null` ante 401), `cambiarConjunto(conjuntoId: string): Promise<Sesion>`, `salir(): Promise<void>`. `CodigoErrorAuth` gana `'SIN_MEMBRESIA'`.
- `cliente.ts`: `pedir<T>(ruta: string, esquema: z.ZodType<T>, init?: { metodo?: 'GET'|'POST'; cuerpo?: unknown; signal?: AbortSignal }): Promise<T>` — `fetch('/api' + ruta, { credentials: 'same-origin' })`; fallo de red o respuesta que no cumple el esquema → `ErrorAuth('RED')`; cuerpo con `codigo` conocido → `ErrorAuth(codigo, detalle)`; `AbortError` se propaga.
- `crearConjuntosHttp(): ConjuntosService`, `crearAuthHttp(): AuthService`.
- `index.ts`: `export const usaMock = import.meta.env.MODE === 'test' || import.meta.env.VITE_USAR_MOCK === '1'`; elige mock o HTTP.

- [ ] **Prueba primero** (Vitest con `fetch` simulado por `vi.stubGlobal`): cada método llama la ruta, método y cuerpo del contrato; `429` con `desbloqueoEn` → `ErrorAuth('BLOQUEADO')` con el detalle; `400` con `intentosRestantes`; `fetch` que rechaza → `'RED'`; `sesion()` devuelve `null` ante 401; JSON con forma inesperada → `'RED'`. Mock: `sesion()` devuelve la última sesión verificada, `salir()` la borra, `cambiarConjunto` exige pertenencia.
- [ ] Alinear datos (decisión 2 del spec): `cj-parques` pasa a slug `parque-central-occidente`, nombre "Parque Central de Occidente" y paleta `#355E3B` / `#D6A64F` / `#789653` (renombrar `PALETA_PARQUES` solo si no rompe importaciones); buscar `parques-occidente` y "Parques del Occidente" en `apps/web/src` y actualizar todas las referencias, pruebas incluidas. La paleta debe pasar `validarPaleta` (AA); si no pasa, detenerse y avisar: es un dato del spec.
- [ ] Dentro de `apps/web`: `npm test`, `npm run lint`, `npm run build` → verdes. Commit "Conecta el panel con la API de conjuntos y acceso".

### Tarea 9: Sesión del panel desde el servidor (sonnet) + `ui-verifier`

**Archivos:** `apps/web/src/store/sesion.ts`, `hooks/useInactividad.ts`, `features/app/{GuardaConjunto,MenuUsuario,DialogoInactividad}.tsx`, `features/auth/PasoCodigo.tsx`, `proveedores.tsx`, y sus pruebas.

**Produce:** el store persiste solo `{ ultimaActividad: number | null; motivoCierre }` (sin usuario ni conjuntos: ningún dato personal en `localStorage`); gana `estado: 'cargando' | 'lista'`, `rehidratar(): Promise<void>` (llama `authService.sesion()`), y `cambiarConjunto(slug): Promise<boolean>` (llama `authService.cambiarConjunto` y guarda la `Sesion` devuelta).

- [ ] **Prueba primero:** `rehidratar` con sesión del servidor la deja en el store; con `null` deja `sesion: null`; `localStorage['mailflow.sesion']` no contiene correo ni nombre tras `iniciar`; `GuardaConjunto` muestra el esqueleto mientras `estado === 'cargando'` y no redirige a `/login` antes de terminar; cambio de conjunto rechazado con `SIN_MEMBRESIA` → página 403; cerrar sesión (menú y diálogo de inactividad) llama `authService.salir()` aunque falle la red; `useInactividad` llama `authService.sesion()` como mucho una vez cada 5 min con actividad y cierra con motivo `inactividad` si responde `null`; el texto "Código de demostración" solo aparece si `usaMock`.
- [ ] Implementar; `proveedores.tsx` dispara `rehidratar()` una vez al montar. Adaptar las pruebas existentes de `sesion.test.ts` y `useInactividad.test.tsx` al nuevo almacenamiento.
- [ ] Dentro de `apps/web`: `npm test`, `npm run lint`, `npm run build` → verdes.
- [ ] `ui-verifier` con `npm run api` + `npm run dev`: login real con `admin@demo.mailflow.test` (código leído de la consola de la API), a 375 px y escritorio, sin errores de consola; recargar `/app/parque-central-occidente/inicio` conserva la sesión; código incorrecto, reenvío antes de 60 s y cerrar sesión muestran sus estados; el tema verde del conjunto se aplica. Commit "Rehidrata la sesión del panel desde el servidor".

### Tarea 10: Documentación y cierre (haiku; revisión final fable)

- [ ] `docs/arquitectura.md`: objeciones 1–3 de §6 marcadas como resueltas en B1 con una línea cada una; nota al ADR 9 (cookie `httpOnly` tras el proxy de Vite); fila nueva para multi-conjunto y acceso OTP. `docs/mailflow-backend-entrevista.md`: precisar la decisión 7 (una fila por correo) y añadir las tres decisiones confirmadas. `docs/plan-desarrollo.md` y `CLAUDE.md` (mapa: migraciones 0002–0007; "hoy solo lectura" → con login).
- [ ] Bitácoras `.claude/progreso-codigo.md` y `.claude/progreso-arquitectura.md` (decisiones de este plan con su porqué; siguiente paso: B2). Al cambiar `CLAUDE.md`, correr `claude-code-setup:claude-automation-recommender` como exige el proyecto.
- [ ] Revisión final con `fable` sobre `mailflow..HEAD`; aplicar arreglos con prueba. Commit "Documenta el backend multi-conjunto y el acceso".

---

## Verificación de extremo a extremo

1. `docker compose up -d db && npm run gate` → migración 0007 aplicada, lint, tipos y todas las pruebas (línea base de la tarea 0 + nuevas) en verde.
2. `cd apps/web && npm test && npm run lint && npm run build` → verdes.
3. Manual: `npm run api` (sin SMTP usa `EnviadorLocal`) + `npm run web`; entrar en `http://localhost:5173/login` con `admin@demo.mailflow.test`, tomar el código de la consola de la API, comprobar en DevTools que la cookie `mailflow_sesion` es `HttpOnly` y que `localStorage` no guarda datos del usuario.
4. `curl -i http://127.0.0.1:3000/api/correos` → `401`; con la cookie → `200` y solo correos de Parque Central.
5. `npm run gateway -- --una-vez` con `IMAP_CONJUNTO_SLUG` sin definir → ingiere en el conjunto inicial; con un slug inexistente → mensaje claro y salida 1.
6. Informes de `db-reviewer` (tareas 1–5) y `ui-verifier` (tarea 9) sin hallazgos abiertos.
