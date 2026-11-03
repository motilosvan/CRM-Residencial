# SOC-CRM: Sistema Organizador de Correos y Capa CRM Residencial
**Conjunto Residencial Parques del Occidente (Cll 77B # 129-70, Bogotá D.C.)**

## 1. Instalación y Ejecución Rápida
```bash
npm install
npm run dev      # Inicia el servidor de desarrollo en http://localhost:5173
npm run test     # Ejecuta las pruebas unitarias con Vitest
npm run build    # Compila para producción con verificación estricta de TypeScript
```

## 2. Usuarios Demo Preconfigurados
En la pantalla `/login` (y en la barra lateral inferior del panel) cuentas con botones de cambio rápido de rol:
- **Administrador (`administracion@parquesoccidente.demo`)**: Acceso completo a validación de IA, asignación de responsables, residentes, usuarios, catálogos, reportes y auditoría.
- **Encargado de Soporte (`mantenimiento@parquesoccidente.demo`)**: Gestiona sus solicitudes asignadas, cambia estados y responde a residentes. Recibe bloqueo `403` si intenta acceder a validación de IA o administración.
- **Nota de Negocio**: Los residentes **NO** tienen cuenta ni portal; solo envían correos electrónicos a `administracion@parquesoccidente.demo`.

## 3. Matriz de Trazabilidad (RF01 a RF16 y RNF01 a RNF08)

| Código | Requerimiento Cubierto | Archivo / Módulo |
| :--- | :--- | :--- |
| **RF01** | Recepción y sincronización de correos Gmail | `src/features/emails/InboxPage.tsx` |
| **RF02** | Preprocesamiento y enmascarado de PII (Ley 1581) | `src/lib/piiMasker.ts` |
| **RF03** | Vinculación con residentes y alerta "No registrado" | `src/data/seed.ts` + `InboxPage.tsx` |
| **RF04** | Sugerencia de IA (categoría, prioridad, resumen, confianza) | `src/features/validation/ValidationQueuePage.tsx` |
| **RF05** | Respaldo por reglas léxicas cuando confianza < umbral | `src/lib/keywordClassifier.ts` |
| **RF06** | Validación humana obligatoria por el Administrador | `ValidationQueuePage.tsx` |
| **RF07** | Trazabilidad de quién validó, cuándo y si modificó | `src/store/useAppStore.ts` |
| **RF08** | Asignación bloqueada hasta que la solicitud sea validada | `src/features/requests/RequestsPage.tsx` |
| **RF09** | Gestión del ciclo de 6 estados con observaciones | `src/features/requests/RequestDetailPage.tsx` |
| **RF10** | Filtros combinables, vistas guardadas y Kanban | `RequestsPage.tsx` + `DashboardPage.tsx` |
| **RF11** | Respuesta al residente por correo con plantillas | `RequestDetailPage.tsx` |
| **RF12** | Línea de tiempo completa por solicitud | `RequestDetailPage.tsx` |
| **RF13** | Directorio de residentes con desactivación e historial | `src/features/residents/ResidentsPage.tsx` |
| **RF14** | Gestión de usuarios y control RBAC (403) | `src/features/users/UsersPage.tsx` |
| **RF15** | Catálogos y slider del umbral de confianza IA (0-1) | `src/features/catalogs/CatalogsPage.tsx` |
| **RF16** | Reportes y exportación real a CSV y vista PDF | `src/features/reports/ReportsPage.tsx` |
| **RNF01-08**| Seguridad, rendimiento, accesibilidad WCAG y auditoría | `src/features/audit/AuditPage.tsx` |
