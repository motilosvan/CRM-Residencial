# Especificación: Flujo de Atención de Soporte, Evidencias y Notificaciones SMTP

> **Estado:** Diseño acordado (2026-11-17). Listo para implementar en rama/worktree aparte o encadenar tras el cierre de la Ola 2 de `docs/plan-mailflow-f2-f4-produccion.md`.

## 1. Objetivo y división de trabajo

Permitir que el personal con rol **`SOPORTE`** atienda de forma autónoma las solicitudes sencillas sin esperar asignación manual del **`ADMIN`**, manteniendo la integridad transaccional (`UPDLOCK`, `versionEsperada`, triggers de ciclo de vida y trazabilidad), mientras el **`ADMIN`** supervisa el rendimiento del equipo y atiende los casos complejos.

---

## 2. Decisiones confirmadas

| # | Tema | Decisión acordada | Motivo |
|---|---|---|---|
| 1 | Toma y liberación de solicitudes | **Opción A:** `SOPORTE` puede **tomar** solicitudes `NUEVA` (`NUEVA → ASIGNADA` a sí mismo) y **desasignarse / devolver a pendientes** (`ASIGNADA → NUEVA`) con **comentario obligatorio** (`>= 5` caracteres) | Evita crear una tabla/bandeja intermedia de transferencias con aceptación, conserva `TR_Solicitudes_integridad` (`THROW 50022`) y deja trazabilidad del motivo en `HISTORIAL_ESTADOS` |
| 2 | Evidencia al resolver | **Opcional.** Selector de imágenes (`JPG`, `PNG`, `WebP`) de hasta **5 MB**; el navegador las comprime en cliente antes de subirlas (`<= 500 KB`, máx. `1600 px`) | Permite adjuntar pruebas visuales sin inflar SQL Server con archivos pesados ni exigir adjuntos en consultas que solo requieren texto |
| 3 | Notificaciones al residente | Registro en `dbo.NOTIFICACIONES` dentro de `withTx` y envío SMTP **fuera de la transacción** usando la cuenta Gmail del conjunto (`dbo.BUZONES_CONJUNTO`), con respaldo a `SMTP_*` / `EnviadorLocal` | Cumple ADR 12 (sin E/S de red dentro de transacciones SQL) y garantiza que la comunicación salga desde el correo del conjunto |
| 4 | Métricas para `ADMIN` | Contar por cada miembro operativo: **`abiertas`** (asignaciones vigentes no finales), **`tomadas`** (histórico en `ASIGNACIONES`) y **`resueltas`** (transiciones a `RESUELTA` en `HISTORIAL_ESTADOS`) | Evita perder el conteo histórico cuando `cambiarEstado` libera la asignación al pasar a `CERRADA` |

---

## 3. Especificación técnica por capa

### 3.1 Base de datos (nueva migración `0009_evidencias_resolucion.sql`)
- **Regla 6:** No editar migraciones `0002`–`0008` ni `ScriptBaseDatosCRM.sql`.
- Crear tabla `dbo.EVIDENCIAS_SOLICITUD` vinculada a la solicitud y/o historial de estado:
  - `idEvidencia INT IDENTITY(1,1) PRIMARY KEY`
  - `idSolicitud INT NOT NULL REFERENCES dbo.SOLICITUDES(idSolicitud)`
  - `idHistorial BIGINT NULL REFERENCES dbo.HISTORIAL_ESTADOS(idHistorial)`
  - `idUsuario INT NOT NULL REFERENCES dbo.USUARIOS(idUsuario)`
  - `nombreArchivo NVARCHAR(200) NOT NULL`
  - `mimeType VARCHAR(50) NOT NULL` (`image/webp`, `image/jpeg`, `image/png`)
  - `tamanoBytes INT NOT NULL` (`CHECK (tamanoBytes BETWEEN 1 AND 524288)`)
  - `datos VARBINARY(MAX) NOT NULL`
  - `fechaCarga DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`
- Permisos para el rol de aplicación `crm_app`: `GRANT SELECT, INSERT ON dbo.EVIDENCIAS_SOLICITUD TO crm_app;` (sin `DELETE` ni `ALTER`, cumpliendo Regla 5).
- `dbo.NOTIFICACIONES` ya existe en `ScriptBaseDatosCRM.sql` con `GRANT INSERT, UPDATE` para `crm_app` (desde `0005`).

### 3.2 Backend (`apps/api`)
1. **Bandeja y detalle de `SOPORTE` (`apps/api/src/modules/consultas.ts`):**
   - `listarSolicitudes` y `detalleSolicitud` permiten al rol `SOPORTE` consultar solicitudes en estado `'NUEVA'` (bolsa común sin asignar) además de las que tiene asignadas (`a.idUsuario = @idActor`).
   - Las solicitudes asignadas a otro usuario siguen devolviendo `403` para `SOPORTE`.
2. **Auto-asignación T2 (`apps/api/src/modules/asignaciones.ts`):**
   - `POST /api/solicitudes/:id/asignar` permite a `SOPORTE` asignarse **únicamente a sí mismo** (`idResponsable === actor.idUsuario`) y **solo cuando la solicitud está en `'NUEVA'`**.
   - Usa `UPDLOCK` + `versionEsperada`: si dos asistentes intentan tomarla simultáneamente, uno gana y el segundo recibe `409 ConflictError`.
   - El `ADMIN` mantiene permiso para asignar o reasignar a cualquier miembro activo (`SOPORTE` o `ADMIN` para casos complejos).
3. **Desasignación y resolución T3 (`apps/api/src/modules/solicitudes.ts`):**
   - En `cambiarEstado`:
     - Si `nuevoEstado === 'NUEVA'` (desde `'ASIGNADA'`), exige `comentario` no vacío (`trim().length >= 5`, si no `422 ValidationError`). Libera la asignación vigente y registra el motivo en `HISTORIAL_ESTADOS`.
     - Si `nuevoEstado === 'RESUELTA'`, exige texto de solución (`comentario`) y acepta evidencia opcional (`nombreArchivo`, `mimeType`, `datosBase64` validado `<= 500 KB` y MIME de imagen permitido).
   - Al pasar a `'EN_PROCESO'` o `'RESUELTA'`, mantiene la actualización de `primeraRespuesta` si estaba `NULL`.
4. **Notificaciones SMTP fuera de `withTx`:**
   - **Al tomar/asignar (`NUEVA → ASIGNADA`):** dentro de `withTx` se inserta la fila en `dbo.NOTIFICACIONES` (`idSolicitud`, `idUsuario`, `mensaje`, `destinatario`). Tras el `commit`, un servicio de despacho envía el correo al residente (incluyendo `[SOL-XXXXXX]` en el asunto) informando que su caso está siendo atendido.
   - **Al solucionar (`→ RESUELTA`):** dentro de `withTx` se inserta en `dbo.NOTIFICACIONES` y se guarda la evidencia (si existe); tras el `commit`, se envía el correo al residente con el texto de solución y la imagen adjunta (`attachments` en Nodemailer).
   - El envío usa las credenciales del conjunto en `dbo.BUZONES_CONJUNTO` (descifradas en memoria solo para el envío) con respaldo en `SMTP_*` / `EnviadorLocal` en desarrollo. Un fallo de red SMTP no revierte la transacción ya confirmada.
5. **Métricas del `ADMIN` (`apps/api/src/modules/consultas.ts`):**
   - `resumen()` (`GET /api/resumen`) y `generarReporte()` (`GET /api/reportes`) incluyen por cada miembro operativo activo:
     - `abiertas`: asignaciones vigentes (`liberadaEn IS NULL`) de solicitudes no finales.
     - `tomadas`: `COUNT(DISTINCT a.idSolicitud)` en `ASIGNACIONES`.
     - `resueltas`: `COUNT(DISTINCT h.idSolicitud)` en `HISTORIAL_ESTADOS` donde el usuario transicionó a `'RESUELTA'`.
6. **Consulta de evidencias (`apps/api/src/http/app.ts`):**
   - Incluir metadatos de evidencias en `detalleSolicitud` (`id`, `nombreArchivo`, `mimeType`, `tamanoBytes`, `fechaCarga`) y un endpoint protegido `GET /api/solicitudes/:id/evidencias/:idEvidencia` (con aislamiento por conjunto y rol) para visualizar/descargar la imagen.

### 3.3 Frontend (`apps/web`)
1. **Compresión de imagen en cliente (`apps/web/src/lib/`):**
   - Utilidad pura con `<canvas>`: valida tipo (`image/jpeg`, `image/png`, `image/webp`) y peso original `<= 5 MB`; redimensiona a máx. `1600 px` y comprime (`image/webp` o `image/jpeg`) hasta obtener `<= 500 KB`.
2. **Pantalla de Solicitudes (`apps/web/src/features/app/SolicitudesPage.tsx`):**
   - Para `SOPORTE`: ve solicitudes `NUEVA` (con botón **«Tomar solicitud»**) y las propias; al tomarla pasa a `ASIGNADA` y puede dejarla en `EN_PROCESO`, **«Devolver a pendientes»** (diálogo con comentario obligatorio) o **«Resolver»** (texto de solución + selector opcional de imagen con vista previa y tamaño comprimido).
   - Para `ADMIN`: en el selector de asignación aparecen tanto `SOPORTE` como `ADMIN` (casos complejos), y en el detalle puede ver las evidencias adjuntas.
3. **Métricas para `ADMIN` (`InicioPage.tsx` y `ReportesPage.tsx`):**
   - Mostrar en «Carga actual de soporte» (`InicioPage`) y en la tabla de carga (`ReportesPage`) las columnas **Abiertas**, **Tomadas** y **Solucionadas** por cada asistente.

---

## 4. Cómo desarrollarlo sin interferir con el swarm actual

Para trabajar esta funcionalidad en paralelo sin pisar la rama `mailflow-f2-f4`:

```bash
git worktree add ../CRM-Residencial-soporte -b feat/flujo-soporte-evidencias mailflow-f2-f4
```

Abrir la nueva sesión de Claude dentro de `../CRM-Residencial-soporte` tomando este documento como especificación base.
