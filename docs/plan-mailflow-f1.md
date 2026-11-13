# MailFlow F1 — Plan de implementación (frontend)

> **Para quien ejecute:** usar `superpowers:subagent-driven-development`. Un subagente nuevo por tarea, con el modelo indicado en cada una (regla "Subagentes y modelos" de `CLAUDE.md`; nunca `fork`). El orquestador (Fable) ejecuta él mismo build/test/lint, hace los commits y no se fía del "terminó" del subagente.

**Objetivo:** reemplazar el panel de un solo conjunto por MailFlow F1: landing de producto, login OTP en 2 pasos, tema dinámico por conjunto y layout con sidebar, todo contra servicios simulados.

**Arquitectura:** proyecto nuevo en `apps/web`; el panel actual se mueve a `apps/web-legacy` como referencia ejecutable hasta F4. Los servicios se definen como interfaces (contrato futuro del backend) con implementación mock; el tema se aplica sobrescribiendo variables CSS de shadcn en `<html>`.

**Stack:** React 19 · Vite 7 · Tailwind v4 (`@tailwindcss/vite`) · shadcn (última CLI, `cssVariables: true`, OKLCH) · React Router 7 · TanStack Query 5 · Zustand 5 · React Hook Form + Zod · Vitest + Testing Library · `@fontsource-variable`.

**Spec:** `docs/mailflow-entrevista.md` (los ejecutores leen ambos). Este plan se copia a `docs/plan-mailflow-f1.md` en la Tarea 0.

## Modo de ejecución (indicado por el usuario)

- **Orquestación por modelos:** Fable orquesta y revisa; `sonnet` para pantallas, servicios y pruebas; `haiku` para movimientos mecánicos y documentación; `ui-verifier` (sonnet) para lo visual. Cada `Agent` lleva `model` explícito; nunca `fork`.
- **graphify primero:** antes de leer archivos del proyecto, el orquestador y cada subagente consultan `/graphify` (`graphify-out/`) para ubicar el código; solo después abren los archivos puntuales.
- **caveman al codificar:** cada subagente implementador activa la skill `caveman` para sus respuestas e informes (el código, las pruebas y los commits se escriben normales).
- **MCP y skills:** MCP de shadcn antes de crear o añadir componentes; MCP de Playwright / `ui-verifier` para toda verificación visual; skills `frontend-design` (landing y pantallas), `superpowers:test-driven-development` (pruebas primero), `superpowers:verification-before-completion` (antes de dar por terminada una tarea) y `superpowers:requesting-code-review` (revisión final).
- Se cumplen todas las reglas de `CLAUDE.md` y las bitácoras se actualizan al cerrar cada tarea.

## Contexto

La entrevista del 2026-11-13 convierte el panel de Parques del Occidente en MailFlow (multi-conjunto, solo personal). Decidido con el usuario para este plan: **F1 detallada, F2–F4 en esbozo**; panel viejo a **`apps/web-legacy`**; **commit de lo pendiente en `main` y luego rama `mailflow`** con un commit por tarea, sin push.

Hallazgos de la exploración que condicionan el plan:
- El único cliente real es `apps/web/src/services/api.ts` (`/api` relativo, proxy de Vite con `changeOrigin`, la API rechaza otro `Host` con 421 y no tiene CORS). No se toca en F1.
- `mockApi.ts` es código muerto; `useAppStore.ts` (503 líneas) mezcla estado y reglas; hay dos vocabularios de tipos (`types/domain.ts` en español vs. `api.ts` en MAYÚSCULAS). Se resuelve en F2, no en F1.
- El lint del panel actual no tiene `eslint` declarado; el nuevo proyecto lleva ESLint 9 flat propio.
- El hook `pre-commit-gate.py` ejecuta `tsc --noEmit` dentro de `apps/web` y `stop-ui-check.py` vigila `apps/web/src/`: ambos siguen sirviendo si el proyecto nuevo conserva la ruta y un `tsconfig.json` que incluya `src` directamente.

## Restricciones globales

- Textos de interfaz, código de dominio, commits y documentación en español. Commits cortos en indicativo presente; **sin push**.
- Solo modo claro: ningún bloque `.dark`, ninguna clase `dark:`.
- Colores solo por tokens (variables CSS); ningún hex suelto en componentes. Hex permitidos únicamente en `src/tema/` y en los datos mock.
- MailFlow: primario `#1E3A5F`, fondo `#FAF9F6`, acento `#E0A458`. Parques del Occidente: `#355E3B`, `#789653`, `#D6A64F`.
- Tipografías Plus Jakarta Sans (títulos) + Inter (texto) con `@fontsource-variable`; sin Google Fonts.
- Toda pantalla: carga (skeleton), vacío y error (con "Reintentar"), contraste AA, foco visible, teclado.
- Login: mensaje neutro exacto "Si el correo está registrado en este conjunto, recibirás un código"; código de 6 dígitos, vence a los 10 min, reenvío a los 60 s, 5 intentos, bloqueo 15 min; demo `123456` visible solo con `import.meta.env.DEV`.
- Sesión: cierre por inactividad a los 30 min, aviso 1 min antes.
- Sin datos personales reales en mocks, pruebas ni commits (correos de demo bajo `@demo.mailflow.test`). No leer `.env`.
- No tocar `apps/api`, `db/`, ni el contrato de `/api`.
- Componentes shadcn: se instalan todos en la Tarea 2; las tareas posteriores no ejecutan `shadcn add` ni `npm install` (permite paralelizar).
- Verificación visual con `ui-verifier` a 375 px y escritorio, consola limpia; **el paso de modo oscuro se omite** (decisión 16).

## Decisiones mías (refutables antes de ejecutar)

| Decisión | Por qué | Descartado |
|---|---|---|
| React Router 7 en **modo datos** (`createBrowserRouter` de `react-router`), no modo framework | "SPA" se cumple sin el plugin de Vite de RR ni generación de tipos; menos piezas y pruebas simples | Modo framework con `ssr: false` |
| `tsconfig.json` único que incluye `src` (no estilo solución con `references`) | El hook de pre-commit corre `tsc --noEmit` en `apps/web`; con `references` no comprobaría nada y no puedo editar el hook | Plantilla por defecto de Vite (`tsc -b`) |
| `culori` para hex→OKLCH y contraste WCAG | Evita escribir y probar a mano la conversión de color | Conversión propia |
| Sesión persistida en `localStorage` (Zustand `persist`) | Sobrevive a recargas y permite que la actividad en otra pestaña cuente; **válido solo mientras el backend sea mock** | `sessionStorage`; memoria |
| `Paleta` gana un tercer campo opcional `secundario` | La spec da 3 colores para Parques pero el borrador del modelo solo 2; sin esto `#789653` se pierde | Derivarlo del primario |
| Entradas de F2–F4 visibles en el sidebar apuntando a una página "Disponible próximamente" | Permite verificar el layout completo y los permisos por rol en F1 | Sidebar con una sola entrada |

## Objeciones abiertas (no bloquean F1; hay que argumentarlas antes de F2)

1. **Buzón real sin noción de conjunto** (decisión 6 + 13): `/api/correos` no filtra por conjunto, así que todos los conjuntos verían el mismo buzón bajo URLs distintas. ¿Se muestra solo para `parques-occidente`, o se espera al backend?
2. **Cambiar de conjunto sin código nuevo** (decisión 11): aceptable en mock; con backend real la pertenencia debe validarse en servidor en cada cambio.
3. **Sesión en `localStorage`**: choca con la cookie httpOnly de `docs/arquitectura.md`; debe migrar cuando exista login real.
4. **ADR 9 "panel servido por la API (mismo origen)"** sigue vigente en `docs/arquitectura.md` y el panel hoy vive detrás del proxy de Vite. La Tarea 10 solo lo anota como pendiente; no lo reescribe.

## Foco de revisión

Cada línea tiene su prueba en la tarea indicada.
1. Paleta de un conjunto que no cumple AA o con hex mal formado → se aplica el tema MailFlow, sin romper (T3).
2. Correo no registrado → misma respuesta y mismos tiempos visibles que uno registrado; nunca se revela existencia (T4, T8).
3. Pestaña que vuelve tras 30+ min o recarga con sesión vieja → se descarta la sesión y se llega al login con aviso y conjunto preseleccionado; actividad en otra pestaña evita el cierre (T5).
4. Slug escrito a mano: inexistente → 404; existente pero ajeno → 403; sin sesión → login (T6).
5. Código pegado con espacios o no numérico, doble envío del formulario, reenvío antes de los 60 s → se normaliza o se ignora sin gastar intentos (T8).

## Estructura de archivos (`apps/web/src`)

```
main.tsx · index.css · router.tsx · proveedores.tsx
types/conjunto.ts
tema/{paletas,derivarTema,aplicarTema}.ts (+ .test.ts)
services/{contratos,index}.ts · services/mock/{datos,conjuntosMock,authMock}.ts (+ .test.ts)
store/{sesion,preferencias}.ts (+ .test.ts)
hooks/{useConjuntos,useInactividad}.ts
components/ui/…            (shadcn)
components/marca/{Isotipo,Logo}.tsx
components/{EmptyState,EstadoError,AvatarConjunto}.tsx
features/landing/LandingPage.tsx (+ secciones/)
features/auth/{LoginPage,PasoConjuntoCorreo,PasoCodigo,esquemas}.tsx
features/app/{GuardaConjunto,AppLayout,SidebarApp,MenuUsuario,PantallaPreparando,DialogoInactividad,InicioPage,ProximamentePage}.tsx
features/errores/{Pagina403,Pagina404}.tsx
```

---

### Tarea 0 — Preparar git (orquestador)

- [ ] Leer `git diff` y proponer al usuario los commits de lo pendiente en `main` (sugerencia: "Ajusta los datos de demostración del panel", "Inicializa shadcn en el panel", "Limpia las referencias a opencode", "Documenta la entrevista de diseño de MailFlow"). Confirmar mensajes con el usuario antes de ejecutar.
- [ ] `git switch -c mailflow`; copiar este plan a `docs/plan-mailflow-f1.md`; commit "Agrega el plan de MailFlow F1".
- [ ] Actualizar `.claude/progreso-codigo.md` (objetivo: MailFlow F1; siguiente paso: Tarea 1) y `.claude/progreso-arquitectura.md` (decisiones de la tabla anterior). Se actualizan al cerrar **cada** tarea.

### Tarea 1 — Mover el panel actual a `apps/web-legacy` (haiku)

**Archivos:** mover `apps/web/` → `apps/web-legacy/`; modificar `package.json` raíz (añadir `"web:legacy": "cd apps/web-legacy && npm run dev --"`), `eslint.config.js` (añadir `apps/web-legacy/**` a `ignores`).

- [ ] `mv apps/web apps/web-legacy` y `git add -A apps/web apps/web-legacy` (git registra renombres).
- [ ] Verificar: `cd apps/web-legacy && npm run build && npm test` pasan; en la raíz `npm run lint && npm run typecheck` pasan.
- [ ] Commit: "Mueve el panel actual a apps/web-legacy".

### Tarea 2 — Scaffold de `apps/web` (sonnet)

**Archivos:** crear `apps/web/{package.json,index.html,vite.config.ts,tsconfig.json,eslint.config.js,components.json}`, `src/{main.tsx,index.css,lib/utils.ts,test/setup.ts}`, `src/components/ui/*`.

**Produce:** scripts `dev` (puerto 5173), `build` (`tsc --noEmit && vite build`), `test` (`vitest run`), `lint`, `typecheck`; alias `@/`; proxy `/api` copiado de `apps/web-legacy/vite.config.ts` (mismo `loadEnv(mode, '../..', 'API_')` y `changeOrigin: true`); tokens MailFlow en `:root` de `index.css`; clases `font-heading` / `font-sans`.

- [ ] Crear el proyecto Vite 7 + React 19 + TS, Tailwind v4 con `@tailwindcss/vite`, `shadcn init` (`cssVariables: true`). Necesita red (`npm`, registro de shadcn).
- [ ] Instalar de una vez: `react-router`, `@tanstack/react-query`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`, `culori` (+ tipos), `lucide-react`, `@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/inter`; dev: `vitest`, `jsdom`, `@testing-library/{react,user-event,jest-dom}`, `eslint` 9 + `typescript-eslint` + `eslint-plugin-react-hooks`.
- [ ] `shadcn add`: button, input, label, card, form, input-otp, command, popover, dialog, alert-dialog, alert, sidebar, dropdown-menu, avatar, skeleton, empty, separator, tooltip, sheet, badge, sonner. Consultar antes el MCP de shadcn.
- [ ] `index.css`: `@import "tailwindcss"`, fuentes, `:root` con la paleta MailFlow en OKLCH (fondo `#FAF9F6`, primario `#1E3A5F`, acento `#E0A458`, neutros pizarra cálidos); borrar el bloque `.dark` y el `@custom-variant dark` que genere shadcn; `:focus-visible` y `prefers-reduced-motion`.
- [ ] `index.html`: `lang="es-CO"`, título "MailFlow", sin Google Fonts.
- [ ] Prueba de humo `src/test/humo.test.tsx`: renderiza `<Button>Hola</Button>` y `expect(screen.getByRole('button', { name: 'Hola' })).toBeInTheDocument()`.
- [ ] Verificar: `npm run build`, `npm test`, `npm run lint` en `apps/web`; `grep -rn "dark" src/index.css` sin resultados.
- [ ] Commit: "Crea el proyecto nuevo del panel con Tailwind v4 y shadcn".

### Tarea 3 — Motor de tema (sonnet) · paralela con T4

**Archivos:** `src/tema/paletas.ts`, `derivarTema.ts`, `aplicarTema.ts`, `derivarTema.test.ts`, `aplicarTema.test.ts`.

**Produce:**
```ts
export interface Paleta { primario: string; acento: string; secundario?: string } // hex
export const PALETA_MAILFLOW: Paleta = { primario: '#1E3A5F', acento: '#E0A458' };
export const FONDO = '#FAF9F6';
export type VariablesTema = Record<`--${string}`, string>; // valores oklch(...)
export function derivarTema(p: Paleta): VariablesTema;
// claves mínimas: --primary, --primary-foreground, --primary-hover, --primary-claro,
// --accent, --accent-foreground, --secondary, --secondary-foreground, --ring,
// --sidebar-primary, --sidebar-primary-foreground, --sidebar-accent, --sidebar-ring
export interface ProblemaContraste { par: string; razon: number; minimo: number }
export function validarPaleta(p: Paleta): { valida: boolean; problemas: ProblemaContraste[] };
export function aplicarTema(p?: Paleta, raiz?: HTMLElement): 'conjunto' | 'mailflow';
```
Reglas: cada `*-foreground` es el más contrastado entre blanco y la tinta oscura del tema; `validarPaleta` exige ≥ 4.5 para primario sobre `FONDO` y para cada foreground sobre su color; `aplicarTema` usa MailFlow si no hay paleta, si el hex no parsea o si `validarPaleta` falla.

- [ ] Pruebas (escribirlas primero y verlas fallar):
  - `validarPaleta(PALETA_MAILFLOW).valida === true` y lo mismo con `{ primario:'#355E3B', acento:'#D6A64F', secundario:'#789653' }`.
  - `validarPaleta({ primario:'#FFFF00', acento:'#E0A458' }).valida === false` con un problema cuyo `par` nombra primario/fondo.
  - `derivarTema(PALETA_MAILFLOW)['--primary']` empieza por `oklch(`; el foreground del acento ámbar es oscuro, el del primario azul es claro.
  - `aplicarTema({ primario:'verde', acento:'#fff' }, el)` devuelve `'mailflow'` y deja `--primary` igual al de MailFlow; `aplicarTema(undefined, el)` igual.
  - `aplicarTema(parques, el)` devuelve `'conjunto'`; llamar después `aplicarTema(undefined, el)` no deja variables del conjunto anterior.
- [ ] Implementar; `npx vitest run src/tema` en verde.
- [ ] Commit: "Agrega el motor de tema por conjunto con validación de contraste".

### Tarea 4 — Tipos y servicios simulados (sonnet) · paralela con T3

**Archivos:** `src/types/conjunto.ts`, `src/services/contratos.ts`, `src/services/mock/{datos,conjuntosMock,authMock}.ts`, `src/services/index.ts`, `src/services/mock/authMock.test.ts`.

**Produce:**
```ts
// types/conjunto.ts
export type Rol = 'ADMIN' | 'SOPORTE';
export interface Conjunto { id: string; slug: string; nombre: string; logoUrl?: string; paleta?: Paleta }
export interface Usuario { id: string; nombre: string; correo: string; rol: Rol }
export interface Sesion { usuario: Usuario; conjuntoActivo: Conjunto; conjuntos: Conjunto[]; ultimaActividad: number }

// services/contratos.ts
export interface ConjuntosService { listar(signal?: AbortSignal): Promise<Conjunto[]> }            // GET /conjuntos
export interface SolicitudCodigo { conjuntoId: string; correo: string }
export interface CodigoEnviado { venceEn: number; reenvioDisponibleEn: number }                     // epoch ms
export interface AuthService {
  solicitarCodigo(p: SolicitudCodigo): Promise<CodigoEnviado>;                                      // POST /auth/codigo
  verificarCodigo(p: SolicitudCodigo & { codigo: string }): Promise<Sesion>;                        // POST /auth/verificar
}
export type CodigoErrorAuth = 'CODIGO_INCORRECTO' | 'CODIGO_VENCIDO' | 'BLOQUEADO' | 'REENVIO_PRONTO' | 'RED';
export class ErrorAuth extends Error { codigo: CodigoErrorAuth; intentosRestantes?: number; desbloqueoEn?: number }

// services/mock/*
export interface OpcionesMock { latenciaMs?: [number, number]; tasaError?: number; sinConjuntos?: boolean; ahora?: () => number }
export function crearConjuntosMock(o?: OpcionesMock): ConjuntosService;
export function crearAuthMock(o?: OpcionesMock): AuthService;
export const CODIGO_DEMO = '123456';
// services/index.ts
export const conjuntosService: ConjuntosService; export const authService: AuthService;
```
`services/index.ts` lee `VITE_MOCK_LATENCIA`, `VITE_MOCK_TASA_ERROR`, `VITE_MOCK_SIN_CONJUNTOS` (documentarlas en `apps/web/.env.example`). Datos: `parques-occidente` (paleta `#355E3B`/`#D6A64F`/`#789653`), un conjunto **sin paleta ni logo** y un tercero con paleta distinta; `admin@demo.mailflow.test` (ADMIN, pertenece a dos conjuntos) y `soporte@demo.mailflow.test` (SOPORTE, uno).

- [ ] Pruebas con `ahora` inyectado y `latenciaMs: [0, 0]`:
  - correo no registrado: `solicitarCodigo` resuelve con la misma forma que uno registrado; `verificarCodigo` con `123456` rechaza con `CODIGO_INCORRECTO`.
  - correo registrado + `123456` → `Sesion` con `conjuntoActivo.slug` del conjunto pedido y `conjuntos.length === 2` para el admin.
  - 5 códigos erróneos → el quinto rechaza con `BLOQUEADO` y `desbloqueoEn === ahora + 15 min`; con `123456` sigue `BLOQUEADO` hasta pasar 15 min; `intentosRestantes` baja 4→0.
  - avanzar 10 min + 1 ms → `CODIGO_VENCIDO`.
  - segundo `solicitarCodigo` antes de 60 s → `REENVIO_PRONTO`; después de 60 s reinicia vencimiento.
  - `sinConjuntos: true` → `listar()` resuelve `[]`; `tasaError: 1` → rechaza con error de red.
- [ ] Implementar; `npx vitest run src/services` en verde.
- [ ] Commit: "Agrega los contratos de servicio y el backend simulado de acceso".

### Tarea 5 — Sesión, preferencias e inactividad (sonnet)

**Archivos:** `src/store/{sesion,preferencias}.ts`, `src/store/sesion.test.ts`, `src/hooks/useInactividad.ts`, `src/hooks/useInactividad.test.tsx`.

**Consume:** `Sesion`, `Conjunto` (T4). **Produce:**
```ts
export const LIMITE_INACTIVIDAD_MS = 30 * 60_000; export const AVISO_MS = 60_000;
export type MotivoCierre = 'manual' | 'inactividad';
useSesion: { sesion: Sesion | null; motivoCierre: MotivoCierre | null;
  iniciar(s: Sesion): void; cerrar(m: MotivoCierre): void;
  cambiarConjunto(slug: string): boolean;   // false si no pertenece
  registrarActividad(ahora?: number): void } // persist, clave 'mailflow.sesion'
usePreferencias: { ultimoConjuntoSlug: string | null; recordarConjunto(slug: string): void } // 'mailflow.preferencias'
useInactividad(): { avisoVisible: boolean; segundosRestantes: number; seguir(): void }
```
`useInactividad` registra actividad (teclado, puntero, navegación; con tope de una escritura cada 15 s), reacciona al evento `storage` para tomar la `ultimaActividad` de otra pestaña y, al cumplirse el límite, llama `cerrar('inactividad')`.

- [ ] Pruebas (temporizadores falsos): al rehidratar con `ultimaActividad` de hace 31 min → `sesion === null` y `motivoCierre === 'inactividad'`; a los 29 min `avisoVisible === true`; `seguir()` lo oculta y reinicia; a los 30 min se cierra; un evento `storage` con actividad reciente evita el cierre; `cambiarConjunto('ajeno')` devuelve `false` y no cambia nada; `cerrar` conserva `ultimoConjuntoSlug`.
- [ ] Implementar; `npx vitest run src/store src/hooks` en verde.
- [ ] Commit: "Agrega la sesión con cierre por inactividad".

### Tarea 6 — Enrutador, guardas y piezas compartidas (sonnet)

**Archivos:** `src/router.tsx`, `src/proveedores.tsx`, `src/main.tsx`, `src/hooks/useConjuntos.ts`, `src/components/{EmptyState,EstadoError,AvatarConjunto}.tsx`, `src/components/marca/{Isotipo,Logo}.tsx`, `public/favicon.svg`, `src/features/app/GuardaConjunto.tsx`, `src/features/errores/{Pagina403,Pagina404}.tsx`, y **marcadores** de una línea para `LandingPage`, `LoginPage`, `AppLayout`, `InicioPage`, `ProximamentePage` (los rellenan T7–T9). Prueba: `src/features/app/GuardaConjunto.test.tsx`.

**Produce:**
- Rutas: `/` · `/login` · `/app/:conjunto` (→ redirige a `inicio`) · `/app/:conjunto/inicio` · `/app/:conjunto/{bandeja,solicitudes,validacion,residentes,usuarios,catalogos,identidad,reportes,auditoria,laboratorio-ia}` (→ `ProximamentePage`) · `/403` · `*` (404).
- `useConjuntos()` → TanStack Query con `queryKey: ['conjuntos']`.
- `<EmptyState icono titulo descripcion accion? variante="sin-datos" | "sin-resultados" />` (sobre shadcn `empty`), `<EstadoError mensaje alReintentar />`, `<AvatarConjunto conjunto tamano? />` (logo o iniciales), `<Logo />`, `<Isotipo />` (sobre con solapa en trazo de flujo, tinta + detalle ámbar, usando `currentColor`/tokens).
- `GuardaConjunto`: sin sesión → `/login`; slug que no está en `useConjuntos()` → 404; slug existente fuera de `sesion.conjuntos` → 403; slug propio distinto del activo → `cambiarConjunto(slug)`; siempre llama `aplicarTema(conjuntoActivo.paleta)`. Al salir de `/app` se aplica el tema MailFlow.

- [ ] Pruebas con `createMemoryRouter`: los tres desenlaces de la guarda (login / 404 / 403), el cambio de conjunto por URL, y que mientras `useConjuntos` carga se muestra skeleton y no un 404.
- [ ] Implementar; `npm test && npm run build && npm run lint`.
- [ ] Commit: "Agrega el enrutador, las guardas por conjunto y la marca MailFlow".

### Tareas 7, 8 y 9 — en paralelo (cada una toca solo su carpeta; el orquestador hace los commits en serie)

#### Tarea 7 — Landing de producto (sonnet, con skill `frontend-design`)

**Archivos:** `src/features/landing/LandingPage.tsx` y `secciones/{Hero,ComoFunciona,Beneficios,Seguridad,Pie}.tsx`; prueba `LandingPage.test.tsx`.

- [ ] Prueba: hay un `h1`, el enlace "Iniciar sesión" apunta a `/login`, existen las secciones "Cómo funciona" y "Seguridad", y **no** hay `form` ni la palabra "Contacto".
- [ ] Implementar: cabecera con `<Logo />` y CTA; hero; cómo funciona en 3 pasos (correo → clasificación → seguimiento); beneficios; seguridad / Ley 1581; pie. Único CTA: "Iniciar sesión". Criterio estético dentro de la paleta MailFlow (elegancia, seguridad, cercanía), sin imágenes externas.
- [ ] `ui-verifier` en `/` a 375 px y escritorio. Commit: "Agrega la landing de MailFlow".

#### Tarea 8 — Login OTP en 2 pasos (sonnet)

**Archivos:** `src/features/auth/{LoginPage,PasoConjuntoCorreo,PasoCodigo}.tsx`, `esquemas.ts`; prueba `LoginPage.test.tsx`.

**Consume:** `authService`, `useConjuntos`, `useSesion`, `usePreferencias`, `ErrorAuth`, `CODIGO_DEMO`, `EmptyState`, `EstadoError`.

- [ ] Pruebas (servicios mock con latencia 0, `user-event`):
  - Paso 1 valida conjunto obligatorio y correo; al enviar muestra el mensaje neutro exacto y pasa al paso 2, **igual** con correo registrado y no registrado.
  - Sin conjuntos → "Aún no hay conjuntos habilitados" y Combobox deshabilitado; siempre visible "¿No encuentras tu conjunto? Comunícate con tu administración"; error de carga → "Reintentar".
  - `ultimoConjuntoSlug` preselecciona el conjunto; `?motivo=inactividad` muestra "Tu sesión se cerró por inactividad".
  - Paso 2: pegar `" 123 456 "` se normaliza y entra; código erróneo muestra intentos restantes; al bloquearse se deshabilita el campo y se indica cuándo reintentar; código vencido ofrece reenviar; "Reenviar" deshabilitado con cuenta regresiva de 60 s; "Cambiar correo" vuelve al paso 1 conservando el conjunto; doble clic en enviar produce una sola llamada.
  - Éxito → `iniciar(sesion)`, `recordarConjunto(slug)` y navegación a `/app/:slug`.
  - El texto "Código de demostración: 123456" solo se renderiza si `import.meta.env.DEV`.
- [ ] Implementar con una tarjeta, RHF + Zod, Combobox (`popover` + `command`) e `InputOTP`; foco al primer campo de cada paso; errores anunciados con `aria-live`.
- [ ] `ui-verifier` en `/login`: ambos pasos, error, bloqueo y lista vacía (`VITE_MOCK_SIN_CONJUNTOS=1`), a 375 px y escritorio. Commit: "Agrega el inicio de sesión con código de un solo uso".

#### Tarea 9 — Layout del panel (sonnet)

**Archivos:** `src/features/app/{AppLayout,SidebarApp,MenuUsuario,PantallaPreparando,DialogoInactividad,InicioPage,ProximamentePage}.tsx`, `navegacion.ts`; prueba `AppLayout.test.tsx`.

**Consume:** `useSesion`, `useInactividad`, `AvatarConjunto`, `EmptyState`, `Logo`, shadcn `sidebar`.

- [ ] Pruebas: con rol SOPORTE no aparecen las entradas solo-Administrador (validación, residentes, usuarios, catálogos, identidad, reportes, auditoría); el sidebar muestra el nombre del conjunto y "Impulsado por MailFlow"; conjunto sin logo muestra iniciales; el selector de conjunto solo aparece con 2+ conjuntos y al elegir navega a `/app/:otro/inicio`; "Cerrar sesión" lleva a `/login`; el diálogo de inactividad aparece con `avisoVisible` y "Seguir conectado" llama `seguir()`; `PantallaPreparando` muestra "Preparando tu espacio de {nombre}…" y con `prefers-reduced-motion` no anima.
- [ ] Implementar: `navegacion.ts` como lista `{ ruta, etiqueta, icono, soloAdmin }`; `PantallaPreparando` ~400 ms solo al entrar o cambiar de conjunto; `InicioPage` con la bienvenida y checklist del catálogo (conectar buzón, personalizar identidad, invitar usuarios, cargar residentes; acciones solo para ADMIN); `ProximamentePage` con `EmptyState`.
- [ ] `ui-verifier`: `/app/parques-occidente/inicio` (verde), cambio al conjunto sin paleta (tema MailFlow + iniciales), sidebar colapsado en 375 px, 403 y 404. Commit: "Agrega el layout del panel con tema por conjunto".

### Tarea 10 — Documentación y revisión final

- [ ] (haiku) Actualizar `README.md` (stack nuevo, MailFlow, `apps/web-legacy`, `npm run web:legacy`), `docs/plan-desarrollo.md` (referencia a este plan) y añadir en `docs/arquitectura.md` una entrada breve "Frontend MailFlow" que enlaza la entrevista y lista las objeciones abiertas, sin reescribir el ADR 9. Commit: "Documenta el panel MailFlow".
- [ ] (haiku) Archivos locales no versionados: `CLAUDE.md` (mapa, stack, paleta MailFlow, sin modo oscuro, temas por conjunto, quitar el paso 4 de Playwright) y `.claude/agents/ui-verifier.md` (quitar modo oscuro y paleta verde). Si el sandbox impide escribir en `.claude/agents/`, se le entrega el texto al usuario.
- [ ] (orquestador) Verificación completa de la sección siguiente.
- [ ] (fable, subagente nuevo) Revisión de toda la rama contra la spec y el "Foco de revisión"; corregir lo que encuentre.
- [ ] Cerrar bitácoras: hecho, decisiones, siguiente paso = planificar F2.

## Verificación de extremo a extremo

1. En `apps/web`: `npm run build`, `npm test`, `npm run lint` — los tres en verde, con la salida real reportada.
2. En la raíz: `npm run lint && npm run typecheck` (no deben verse afectados). `gate` no aplica: no se toca backend.
3. `cd apps/web-legacy && npm run build` sigue pasando.
4. `grep -rnE "dark:|#[0-9A-Fa-f]{6}" apps/web/src --include=*.tsx` sin resultados fuera de `tema/` y `services/mock/`.
5. Recorrido con Playwright (`npm run dev`, 375 px y escritorio, consola sin errores): landing → "Iniciar sesión" → conjunto Parques + `admin@demo.mailflow.test` → mensaje neutro → `123456` → "Preparando tu espacio de…" → `/app/parques-occidente/inicio` en verde → cambiar de conjunto desde el menú (el tema cambia al instante) → URL con slug ajeno (403) e inexistente (404) → recargar (la sesión persiste) → cerrar sesión (login con el conjunto preseleccionado).
6. Inactividad: comprobada por las pruebas con temporizadores falsos de T5 y T9; no se espera 30 min en el navegador.

## Esbozo F2–F4 (cada fase tendrá su propio plan al cerrar la anterior)

- **F2 — buzón, solicitudes, detalle, validación.** Antes: resolver la objeción 1. Portar `services/api.ts` tal cual y `lib/{etiquetas,keywordClassifier,piiMasker,kpiCalculator}.ts` con su prueba; unificar el vocabulario de tipos en el canónico de la BD (`etiquetas.ts` traduce); extraer las transiciones de `useAppStore.ts` a funciones puras detrás de un `solicitudesService` mock; TanStack Query con `['conjunto', slug, …]`; datos de demostración por conjunto (hoy las semillas están vacías).
- **F3 — residentes, usuarios, catálogos, identidad del conjunto.** La pantalla de identidad reutiliza `derivarTema`/`validarPaleta` de T3 para la vista previa y el bloqueo AA; formularios RHF + Zod.
- **F4 — reportes, auditoría, laboratorio de IA, 403/404 definitivos.** Al final se borra `apps/web-legacy`, el script `web:legacy` y su entrada en eslint.
