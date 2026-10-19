# Plan de desarrollo del MVP — SOC-CRM (SQL Server)

Backlog ejecutable por agentes. Cada tarea tiene ID, alcance, agente responsable y **criterio de aceptación verificable**. Una tarea está terminada cuando `npm run gate` pasa y `@reviewer` aprueba el diff.

## Brecha entre la línea base y el MVP

`ScriptBaseDatosCRM.sql` ya define: RESIDENTES, CATEGORIAS, ESTADOS, USUARIOS, CORREOS, REPORTES, SOLICITUDES, NOTIFICACIONES, ASIGNACIONES. Para que sea realmente transaccional falta:

| Brecha | Solución (migración nueva) |
|---|---|
| Un correo puede insertarse dos veces | `CORREOS.messageId` + índice `UNIQUE`; `imapUid` |
| Residente desconocido rompe la ingesta (`idResidente NOT NULL`) | `CORREOS.idResidente` pasa a `NULL` |
| `ESTADOS.fecha` no pertenece a un catálogo | Se deja sin uso; el historial lleva las fechas |
| No hay historial de estados | Tabla `HISTORIAL_ESTADOS` + trigger de inmutabilidad |
| Cualquier salto de estado es válido | Tabla `TRANSICIONES_ESTADO` |
| `SOLICITUDES.prioridad` es texto libre | Tabla `PRIORIDADES` + FK `idPrioridad` + `CHECK` |
| Sin control de concurrencia | `SOLICITUDES.version INT` |
| Sin métricas de respuesta | `primeraRespuesta`, `fechaCierre` en SOLICITUDES |
| Dos asignaciones activas posibles | `ASIGNACIONES.liberadaEn`, `asignadaPor` + índice único filtrado |
| Sin credenciales/roles | `USUARIOS.passwordHash`, `activo`; `CHECK` de rol |
| Sin checkpoint IMAP | Tabla `GATEWAY_CHECKPOINT` |
| `GETDATE()` local | Migración a `SYSUTCDATETIME()` en defaults nuevos |

## Transacciones

| ID | Transacción | Aislamiento | Mecanismo |
|---|---|---|---|
| T1 | Ingesta de correo → solicitud | READ COMMITTED (RCSI) | `UNIQUE(messageId)`, captura 2627/2601 |
| T2 | Asignar / reasignar | READ COMMITTED | `UPDLOCK,ROWLOCK` + índice filtrado |
| T3 | Cambiar estado | READ COMMITTED | `UPDLOCK` + `version` + `TRANSICIONES_ESTADO` |
| T4 | Reclasificar | READ COMMITTED | `UPDLOCK` + `version` |
| T5 | Generar reporte | SNAPSHOT (solo lectura) | foto consistente |
| T6 | Checkpoint IMAP | misma tx que T1 | avanza `ultimoUid` con el correo |

Máquina de estados: `NUEVA → ASIGNADA → EN_PROCESO → RESUELTA → CERRADA`; también `RESUELTA → EN_PROCESO` (reabrir) y `ASIGNADA → NUEVA` (desasignar). `CERRADA` es final.

---

## Semana 1 — Fundaciones y base de datos  (hito M1)

**Estado: S1-01 a S1-05 completas** (`npm run gate` en verde, 86 pruebas). Además de lo planeado:
- `0003_fechas_datetime2.sql`: las fechas del sistema pasan a `DATETIME2`. Con `DATETIME` (redondeo de ~3,33 ms) liberar una asignación recién creada podía violar `CK_Asignaciones_fechas` de forma intermitente.
- El runner habilita `READ_COMMITTED_SNAPSHOT` y `ALLOW_SNAPSHOT_ISOLATION` (no pueden ir dentro de la transacción de una migración).
- `SOLICITUDES.prioridad` (texto libre) se eliminó en la 0002: usar `idPrioridad`.

| ID | Tarea | Agente | Aceptación |
|---|---|---|---|
| S1-01 | Andamiaje Node/TS: `package.json`, `tsconfig`, Vitest, ESLint, scripts `db:migrate`, `lint`, `typecheck`, `test`, `gate` | `tx-engineer` | `npm run gate` corre (aunque haya 1 test trivial) |
| S1-02 | Runner de migraciones: aplica `ScriptBaseDatosCRM.sql` y `db/migrations/*.sql` en orden, registra en tabla `__MIGRACIONES`, idempotente | `db-architect` | Correrlo 2 veces no falla ni duplica |
| S1-03 | Migración `0002_integridad.sql`: todas las brechas de la tabla de arriba + semillas (categorías, prioridades, estados, transiciones) | `db-architect` | Aplica sobre BD limpia y sobre BD con datos de la línea base |
| S1-04 | `withTx()` con aislamiento configurable y reintento en 1205/3960 | `tx-engineer` | Test: forzar deadlock ⇒ reintenta y termina |
| S1-05 | Tests de constraints: FK, `UNIQUE(messageId)`, índice filtrado de asignación, trigger de historial, `CHECK` de prioridad/rol | `qa` | Cada constraint tiene un test que prueba el rechazo |

## Semana 2 — Núcleo transaccional  (hito M2)

**Estado: S2-01 a S2-06 completas** (140 pruebas al cierre de S2; 180 tras la auditoría). Código en `apps/api/src/{domain,modules}`.
Decisiones a tener presentes:
- Las reglas de clasificación y urgencia viven en código (`domain/`), no en BD; el plan original las ponía en una tabla editable.
- `ASIGNADA` solo se alcanza con `asignar()` (T2), nunca con `cambiarEstado()`: así no existe una solicitud ASIGNADA sin responsable. Desasignar (`→ NUEVA`) sí pasa por T3 y libera la asignación.
- El conjunto de 34 correos de ejemplo lo escribió el mismo equipo que las reglas: el 100 % de acierto es optimista. La medición real es S6-01.
- Los módulos aceptan un parámetro `hooks` solo para inyectar fallos en las pruebas de atomicidad.

| ID | Tarea | Agente | Aceptación |
|---|---|---|---|
| S2-01 | `domain/`: clasificador por reglas, priorizador (máximo entre base de categoría y palabras clave), máquina de estados | `tx-engineer` | Tabla de ≥30 correos de ejemplo, ≥80 % de acierto; seguridad nunca BAJA |
| S2-02 | T1 ingesta idempotente | `tx-engineer` | Mismo `messageId` 50 veces en paralelo ⇒ 1 correo, 1 solicitud, 1 historial |
| S2-03 | T3 cambiar estado | `tx-engineer` | 2 cambios simultáneos con la misma `version` ⇒ uno OK, otro `ConflictError`; salto inválido ⇒ `TransicionInvalida` |
| S2-04 | T2 asignar/reasignar | `tx-engineer` | 20 asignaciones paralelas ⇒ siempre 1 vigente |
| S2-05 | T4 reclasificar | `tx-engineer` | Deja historial con comentario |
| S2-06 | Prueba de atomicidad: fallo inyectado a mitad de T1 | `qa` | Cero filas huérfanas tras el rollback |

## Auditoría tras S2 (completada)

Auditoría con agentes especializados (BD, transacciones, seguridad, arquitectura, pruebas). Correcciones en `0004_invariantes_y_texto.sql`, `0005_rol_aplicacion.sql`, módulos, visor, configuración y documentos; detalle en la sección 12 de `docs/estudio-funcionalidad-y-bd-transaccional.md`. Puerta: 180 pruebas + pruebas de mutación.

Decisiones que afectan a las semanas siguientes:
- **Dos identidades de BD:** migrador (`DB_MIGRATOR_*`) y aplicación (`DB_USER`, rol `crm_app`). La API y el gateway usan solo la de la aplicación.
- **El gateway (S3) es un proceso aparte que importa `apps/api/src/modules`** y llama a `ingestarCorreo` (no pasa por HTTP, porque S3 va antes que S4). Debe procesar en orden de UID; un correo que falle N veces se ingesta como `SIN_CLASIFICAR` antes de avanzar el checkpoint.
- **Toda escritura exige `versionEsperada`** (también asignar). Las lecturas para la API salen de `modules/consultas.ts`.
- **S4:** los módulos pasarán a recibir `actor: { idUsuario, rol }` y la autorización ("SOPORTE solo sus asignadas") se evaluará dentro de la transacción, no en las rutas.
- **S5:** el panel lo sirve la API (mismo origen) y toma estados/categorías del modelo, no de listas propias (`js/app.js` hoy usa otro vocabulario).
- **Pendiente de una rama propia:** subir `mssql` a 12.x y `vitest` a 4.x (avisos de `npm audit`, ninguno alcanzable en este uso).

## Semana 3 — Email Gateway  (hito M3)

| ID | Tarea | Agente | Aceptación |
|---|---|---|---|
| S3-01 | Cliente IMAP con `imapflow`, polling 30–60 s sobre `UID > ultimoUid`, manejo de `UIDVALIDITY` | `gateway-dev` | Test con servidor IMAP simulado |
| S3-02 | Parseo con `mailparser`; `messageId` determinista (sha256) si falta | `gateway-dev` | Correo sin Message-ID no se pierde ni duplica |
| S3-03 | Integración con T1/T6; marcar leído **después** del COMMIT; fallback `SIN_CLASIFICAR` tras N fallos | `gateway-dev` | Reiniciar el worker 3 veces ⇒ 0 duplicados |

## Semana 4 — API y autenticación  (hito M4)

| ID | Tarea | Agente | Aceptación |
|---|---|---|---|
| S4-01 | Login con argon2, sesión por cookie `httpOnly`, rate limit | `tx-engineer` | Tests 401/403 |
| S4-02 | Endpoints: listar/detalle solicitudes, asignación, estado, clasificación, usuarios | `tx-engineer` | Códigos 401/403/404/409/422 cubiertos por tests |
| S4-03 | Autorización por rol en servidor (SOPORTE solo sus asignadas) | `tx-engineer` | Matriz de permisos probada |

## Semana 5 — Panel y reportes  (hito M5)

| ID | Tarea | Agente | Aceptación |
|---|---|---|---|
| S5-01 | T5 reportes (tiempo promedio de respuesta, % dentro de SLA, carga por responsable) | `tx-engineer` | Dataset conocido ⇒ valores exactos |
| S5-02 | Panel: login, bandeja con filtros, detalle con línea de tiempo, acciones de estado/asignación | `frontend-dev` | Flujo completo desde el navegador |
| S5-03 | Manejo de 409 en la UI y exportar CSV de reportes | `frontend-dev` | Mensaje claro y recarga |

## Semana 6 — Endurecimiento y entrega  (hito M6)

| ID | Tarea | Agente | Aceptación |
|---|---|---|---|
| S6-01 | E2E con Gmail real y dataset de 30 correos | `qa` | Informe de aciertos del clasificador |
| S6-02 | Carga ligera: 1.000 correos en lote, 20 usuarios concurrentes | `qa` | Sin deadlocks no reintentados, sin duplicados |
| S6-03 | Backup/restore de SQL Server probado; CI en GitHub Actions con servicio mssql | `db-architect` | Restauración documentada y verificada |

## Criterios de aceptación globales

1. Un correo aparece como solicitud en ≤ 2 min.
2. Reprocesar el mismo correo nunca crea una segunda solicitud.
3. El historial de estados no se puede editar ni borrar.
4. Dos usuarios sobre la misma solicitud no se pisan: uno recibe conflicto.
5. Nunca hay dos asignaciones vigentes de una solicitud.
6. Los reportes cuadran con los datos.
7. Un fallo a mitad de operación no deja cambios parciales.
