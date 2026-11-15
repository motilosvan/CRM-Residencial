# Arquitectura

## 1. Estilo

Arquitectura en **tres capas** (presentación, lógica de negocio, datos) más un **Email Gateway**, como propone el informe del proyecto. La lógica de negocio sigue el patrón **Transaction Script** (Fowler): cada caso de uso es una función que abre una transacción, valida, escribe y deja historial. La capa de datos no es solo «tablas»: incluye las restricciones, triggers y permisos que hacen cumplir las reglas aunque alguien se salte la aplicación.

## 2. Contexto y contenedores

```text
 Residente ──correo──► Gmail del conjunto
                           │ IMAP (S3)
                 ┌─────────▼─────────┐
                 │  Email Gateway    │  proceso aparte; llama a T1 en el mismo proceso
                 └─────────┬─────────┘  (importa apps/api/src/modules)
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
| Presentación | `index.html`, `css/`, `js/` (S5); hoy `apps/api/src/demo/` | Panel; el visor demo es provisional |
| Lógica de negocio | `apps/api/src/domain/` | Clasificador, priorizador, máquina de estados (sin BD) |
| Lógica de negocio | `apps/api/src/modules/` | Transacciones T1–T4 y consultas |
| Acceso a datos | `apps/api/src/db/` | `withTx`, pool, migraciones, login de la app |
| Datos | SQL Server + `db/migrations/` | Esquema, restricciones, triggers, permisos |
| Integración | `apps/gateway/` (S3) | Lectura IMAP → T1 |

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

**Nota al ADR 9 (B1).** El panel corre hoy detrás del proxy de Vite (`localhost:5173`), no lo sirve la API. La cookie `mailflow_sesion` (`HttpOnly; SameSite=Lax; Path=/api`) funciona igual porque panel y API comparten origen en desarrollo, sin CORS. Se agrega `Secure` cuando `COOKIE_SEGURA=true`. El ADR no se reescribe.

## 5. Garantías y dónde viven

Ver la sección 5 de [`estudio-funcionalidad-y-bd-transaccional.md`](estudio-funcionalidad-y-bd-transaccional.md).

## 6. Frontend MailFlow

El panel `apps/web` se rehace como MailFlow (multi-conjunto, solo personal). Spec: [`mailflow-entrevista.md`](mailflow-entrevista.md); plan de F1: [`plan-mailflow-f1.md`](plan-mailflow-f1.md). Decisiones de implementación (React Router en modo datos, `tsconfig` único, `culori`, sesión en `localStorage`) están en la sección «Decisiones mías» de ese plan.

- Servicios definidos como interfaces, con implementación simulada en `apps/web/src/services/mock` y cliente `fetch` en `services/http` (B1). Con `VITE_USAR_MOCK=1` o en las pruebas se usa el mock.
- Tema por conjunto: sobrescribe las variables CSS de shadcn en `<html>`; si la paleta del conjunto no cumple AA, se usa la de MailFlow.
- Solo modo claro. Esto elimina el modo oscuro de la entrevista (decisión 16) y no reescribe ningún ADR de esta tabla.
- El panel anterior vive en `apps/web-legacy` como referencia hasta F4.

Objeciones abiertas (no bloquean F1; se argumentan antes de F2):

1. **Buzón real sin noción de conjunto (resuelta en B1):** `/api/correos`, `/api/correos/:id` y `/api/gateway/estado` filtran por el conjunto activo de la sesión; un correo de otro conjunto responde 404.
2. **Cambio de conjunto sin código nuevo (resuelta en B1):** `POST /api/auth/conjunto` valida en el servidor la membresía activa en cada cambio; sin membresía responde 403.
3. **Sesión en `localStorage` (resuelta en B1):** la sesión vive en la cookie `httpOnly` `mailflow_sesion` (token aleatorio, solo su hash en `SESIONES`); `localStorage` guarda solo `ultimaActividad` y `motivoCierre`.
4. **ADR 9 vigente:** el panel hoy corre detrás del proxy de Vite, no lo sirve la API. Documentado en la nota bajo la tabla de decisiones; el ADR no se reescribe.
