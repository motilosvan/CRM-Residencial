# Arquitectura inicial

## Primera etapa

La aplicación está construida como una interfaz web estática:

```text
Usuario
   │
   ▼
index.html
   │
   ├── css/styles.css
   │      └── Diseño y responsive
   │
   └── js/app.js
          └── Navegación e interacciones
```

## Arquitectura prevista para siguientes etapas

```text
┌──────────────────────┐
│      Frontend        │
│ Dashboard / módulos  │
└──────────┬───────────┘
           │ HTTP / API
┌──────────▼───────────┐
│       Backend        │
│ reglas / seguridad   │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│      Base de datos   │
│ residentes / correos │
│ solicitudes / logs   │
└──────────────────────┘
```

La arquitectura definitiva se establecerá cuando se definan el lenguaje de backend, el motor de base de datos y los requisitos de integración.
