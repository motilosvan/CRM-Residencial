# Alcance del proyecto

## 1. Propósito

Plataforma centralizada que convierte los correos de los residentes de un conjunto en solicitudes clasificadas, priorizadas, asignadas y trazables, con indicadores de gestión para la administración.

## 2. Usuarios del MVP

| Rol (`USUARIOS.rol`) | Qué hace |
|---|---|
| `ADMIN` — Administrador | Asigna y reasigna responsables, cambia estados, reclasifica, consulta reportes, gestiona usuarios |
| `SOPORTE` — Personal de soporte | Atiende y avanza las solicitudes que tiene asignadas |

El **residente no usa el sistema**: solo escribe a la cuenta de Gmail del conjunto (así lo define el informe). Un portal para residentes queda fuera del MVP.

## 3. Módulos

| Módulo | Propósito | En el MVP |
|---|---|---|
| Ingesta de correos | Recibir cada correo una sola vez y convertirlo en solicitud | Sí (T1; el gateway de Gmail es S3) |
| Solicitudes | Clasificar, priorizar, asignar, cambiar estado, reclasificar, con historial | Sí (T2–T4) |
| Dashboard y reportes | Carga por responsable, tiempos de respuesta, % dentro del SLA | Sí (indicadores básicos; T5 formal en S5) |
| Usuarios | Alta y baja lógica del personal | S4 |
| Residentes | Directorio para vincular remitentes | Solo lectura / carga inicial; la gestión completa queda fuera del MVP |
| Configuración | Preferencias | Fuera del MVP |

## 4. Entregas

1. **Primera entrega:** propuesta visual navegable (`index.html`), sin persistencia.
2. **MVP (en curso):** núcleo transaccional terminado (semanas 1–2); gateway, API, panel conectado y endurecimiento en las semanas 3–6. Detalle en [`plan-desarrollo.md`](plan-desarrollo.md).
