# SOC-CRM — Funcionalidades del sistema

Explicación, desde el punto de vista de quien usa el sistema, de **qué hace cada funcionalidad, cómo se ve, qué reglas cumple y qué pasa cuando algo sale mal**. Para el detalle técnico de la base de datos ver [`estudio-funcionalidad-y-bd-transaccional.md`](estudio-funcionalidad-y-bd-transaccional.md).

> **Estado:** las funcionalidades de esta guía están implementadas y probadas (180 pruebas automáticas). Hoy se usan desde un **visor de demostración local**; la API con inicio de sesión y el panel definitivo llegan en las semanas 4 y 5 del plan (§6).

---

## 1. El sistema en una frase

**SOC-CRM convierte cada correo que un residente envía a la administración en una solicitud organizada**: clasificada, priorizada, con un responsable, un estado y un historial completo, para que nada se pierda, nada se duplique y siempre se sepa quién está atendiendo qué.

### ¿Quién lo usa?

| Persona | Qué hace con el sistema |
|---|---|
| **Residente** | No entra al sistema: solo escribe un correo a la cuenta del conjunto, como siempre. |
| **Administrador** (`ADMIN`) | Revisa la bandeja, asigna responsables, cambia estados, corrige clasificaciones y consulta indicadores. |
| **Personal de soporte** (`SOPORTE`) | Atiende las solicitudes que le asignan y registra su avance. |

---

## 2. El recorrido de una solicitud (ejemplo)

1. **Ana Torres (apto T1-101)** escribe: *«Fuga de agua en el parqueadero — Hay agua saliendo de una tubería, es urgente.»*
2. El sistema **recibe el correo** una sola vez y reconoce que Ana es residente.
3. Lo **clasifica** como **MANTENIMIENTO** («fuga», «tubería») y, como dice «urgente», le da prioridad **ALTA** (en vez de la MEDIA habitual de mantenimiento).
4. Crea la solicitud **SOL-000035** en estado **NUEVA** y anota en el historial: *«Creada automáticamente desde correo»*.
5. El administrador la ve arriba en la bandeja (las ALTA van primero) y la **asigna a Laura (Soporte)** → pasa a **ASIGNADA**.
6. Laura empieza a atenderla → **EN_PROCESO**. El sistema registra la hora de la **primera respuesta**.
7. Laura la arregla → **RESUELTA**.
8. El administrador confirma → **CERRADA**. Laura queda libre de esa solicitud y ya no cuenta en su carga.
9. En cualquier momento, el **historial** muestra cada paso: qué cambió, quién lo hizo y cuándo.

```
 NUEVA ──asignar──► ASIGNADA ──► EN_PROCESO ──► RESUELTA ──► CERRADA
   ▲                   │              ▲              │        (final)
   └──desasignar───────┘              └──reabrir─────┘
```

---

## 3. Las funcionalidades una por una

### F1 · Recepción de correos

**Qué hace:** registra cada correo que llega y lo convierte en una solicitud.

- **Nunca duplica:** si el mismo correo llega dos veces (un reintento, un reinicio del sistema), la segunda vez no crea nada. Se reconoce por el identificador único que trae todo correo (*Message-ID*).
- **Nunca pierde un correo:**
  - si el remitente no es un residente registrado, igual se guarda (queda «sin residente vinculado»);
  - si la dirección del remitente es inválida, se guarda como `desconocido@invalid`;
  - si el asunto es muy largo, se recorta (500 caracteres) en vez de rechazar el correo;
  - emojis, tildes y cualquier alfabeto se conservan tal cual (*«Fuga 🚰 en el sótano»*).
- **Recuerda hasta dónde leyó** el buzón, para retomar desde ahí si se reinicia.

**En el visor:** panel lateral *«✉ Simular un correo entrante»* → escribir remitente, asunto y cuerpo → **Recibir correo**. Aparece al instante la solicitud ya clasificada y priorizada.

> Hoy los correos entran por el visor o con los datos de ejemplo. La lectura automática de la cuenta de Gmail es la semana 3.

### F2 · Clasificación automática

**Qué hace:** decide la categoría de la solicitud leyendo el asunto (que cuenta doble) y el cuerpo.

| Categoría | Ejemplos de palabras que la activan |
|---|---|
| **SEGURIDAD** | robo, intruso, sospechoso, alarma, cámaras, portería, pelea, amenaza, incendio, humo, emergencia |
| **MANTENIMIENTO** | fuga, gotera, humedad, tubería, ascensor, bombillo, luz, daño, reparación, portón, citófono, gas |
| **FACTURACION** | cuota, factura, pago, recibo, cobro, mora, saldo, deuda, paz y salvo, extracto |
| **ADMINISTRATIVO** | asamblea, certificado, permiso, reglamento, queja, ruido, mascota, mudanza, reserva, salón comunal |
| **SIN_CLASIFICAR** | ninguna palabra coincide (p. ej. *«Hola, quisiera hablar con alguien»*) |

- No importan las tildes ni las mayúsculas (*«CÁMARA»* = *«camara»*).
- Si hay empate, gana el orden de la tabla (seguridad primero).
- Lo que queda `SIN_CLASIFICAR` lo revisa una persona y lo corrige (F8).

**Límite conocido:** es un clasificador simple por palabras clave; basta una coincidencia para decidir y no entiende negaciones.

### F3 · Priorización automática

**Qué hace:** asigna ALTA, MEDIA o BAJA, cada una con un tiempo objetivo de respuesta (SLA).

| Prioridad | Tiempo objetivo (SLA) | Cuándo |
|---|---|---|
| **ALTA** | 4 horas | Toda solicitud de SEGURIDAD, y cualquiera con señales de urgencia |
| **MEDIA** | 24 horas | MANTENIMIENTO y SIN_CLASIFICAR |
| **BAJA** | 72 horas | FACTURACION y ADMINISTRATIVO |

**Señales de urgencia** que suben a ALTA cualquier categoría: «urgente», «emergencia», «incendio», «inundación», «fuga de gas», «olor a gas», «cortocircuito», «robo», «amenaza», «persona atrapada», «ascensor atascado», «sin agua», «sin luz», «herido».

Una solicitud de seguridad **nunca** queda en BAJA.

### F4 · Bandeja de solicitudes

**Qué hace:** muestra todas las solicitudes, **las más urgentes primero** (por prioridad y luego por antigüedad).

**En el visor:** la tabla central muestra código (`SOL-000035`), asunto, categoría, prioridad (con color), estado y responsable. Arriba, tarjetas con el total y cuántas hay en cada estado.

La bandeja también admite filtros por estado, categoría, prioridad y responsable, y paginación. Los usará el panel definitivo; el visor muestra todo.

### F5 · Detalle e historial de una solicitud

**Qué hace:** al hacer clic en una solicitud se ve todo sobre ella:
- el correo original (remitente y texto);
- categoría, prioridad, estado y **versión** (un número que sube con cada cambio);
- responsable actual, fecha de creación y de primera respuesta;
- **Historial (inmutable):** cada cambio con quién, cuándo y el comentario. Nadie puede editarlo ni borrarlo, ni siquiera con acceso a la base de datos como aplicación;
- **Asignaciones:** todos los responsables que ha tenido, con fecha de asignación y de liberación.

Toda la información del detalle se lee **en el mismo instante**: nunca se mezcla un estado nuevo con un historial viejo.

### F6 · Asignar y reasignar responsable

**Qué hace:** vincula la solicitud con una persona de soporte.

- Si la solicitud estaba **NUEVA**, pasa a **ASIGNADA**.
- **Reasignar** a otra persona libera a la anterior; ambas quedan en el registro de asignaciones y el historial anota *«Reasignada a …»*.
- Asignar a la misma persona que ya la tiene no hace nada.
- Una solicitud **nunca tiene dos responsables a la vez**.
- **No se puede** asignar una solicitud RESUELTA o CERRADA, ni a un usuario inexistente o inactivo.

**En el visor:** en el detalle, el selector **«Asignar a…»**.

### F7 · Cambiar el estado (seguimiento)

**Qué hace:** registra el avance de la solicitud.

| Desde | Puede pasar a | Significado |
|---|---|---|
| NUEVA | ASIGNADA (solo asignando, F6) | Alguien se hace cargo |
| ASIGNADA | EN_PROCESO | Se empezó a atender |
| ASIGNADA | NUEVA | Desasignar: vuelve a la cola y libera al responsable |
| EN_PROCESO | RESUELTA | Se solucionó |
| RESUELTA | CERRADA | Se confirma y archiva (final) |
| RESUELTA | EN_PROCESO | Reabrir: el problema siguió |

- **Cualquier otro salto se rechaza** (por ejemplo, NUEVA → CERRADA). La base de datos también lo impide, aunque alguien intente hacerlo por fuera de la aplicación.
- Al pasar por primera vez a EN_PROCESO o RESUELTA se registra la **primera respuesta**, que mide el tiempo de atención.
- Al **cerrar** se registra la fecha de cierre, se **libera al responsable** y la solicitud **ya no se puede modificar**.
- Cada cambio queda en el historial, con un comentario opcional.

**En el visor:** botones **«→ EN_PROCESO»**, **«→ RESUELTA»**… Solo aparecen los pasos válidos desde el estado actual. En una NUEVA el visor indica que hay que asignar un responsable.

### F8 · Reclasificar (corregir al clasificador)

**Qué hace:** permite que una persona corrija la categoría o la prioridad que puso el sistema. Por ejemplo, un correo `SIN_CLASIFICAR` que en realidad era un robo.

- Queda en el historial exactamente qué cambió: *«Reclasificada: categoría SIN_CLASIFICAR → SEGURIDAD; prioridad MEDIA → ALTA. Era un robo»*.
- Si no cambia nada, no se registra nada ni se molesta a otros usuarios.
- Una solicitud CERRADA no se reclasifica.

**En el visor:** el selector **«Cambiar prioridad…»**. El cambio de categoría ya existe en el sistema, pero el visor no lo muestra; llegará con el panel definitivo.

### F9 · Indicadores de gestión

**Qué hace:** resume cómo va la atención.
- **Solicitudes por estado:** cuántas hay NUEVAS, ASIGNADAS, EN_PROCESO, RESUELTAS y CERRADAS.
- **Carga por responsable:** cuántas solicitudes abiertas tiene cada persona de soporte. Las cerradas no cuentan.
- **Tiempo medio hasta la primera respuesta** por categoría y **% atendido dentro del SLA**.

**En el visor:** las tarjetas de arriba y el recuadro **«Indicadores»** bajo la bandeja.

> En los datos de ejemplo el tiempo medio sale en 0 minutos porque se generaron en segundos; con uso real refleja la atención real. Los reportes por periodo y la exportación a CSV llegan en la semana 5.

### F10 · Protección cuando dos personas trabajan a la vez

**Qué hace:** evita que una persona sobrescriba sin saberlo el trabajo de otra.

**Ejemplo:** Laura y el administrador tienen abierta la misma solicitud (versión 3). Laura la pasa a RESUELTA (ahora es versión 4). Si el administrador intenta cambiarla desde su pantalla vieja, el sistema **lo detiene**: *«Otra persona modificó esta solicitud»*. El administrador recarga, ve el estado real y decide.

- Vale para cambiar estado, asignar y reclasificar.
- Si 10 personas intentan lo mismo al mismo tiempo, exactamente 1 lo logra y las demás reciben el aviso.

**En el visor:** el botón **«Probar conflicto (versión vieja)»** lo simula. También se puede ver de verdad abriendo la misma solicitud en dos pestañas.

### F11 · Integridad y seguridad (lo que el usuario no ve, pero lo protege)

- **Todo o nada:** cada operación se completa entera o no se aplica. Si algo falla a mitad, no queda una solicitud sin historial ni una asignación a medias.
- **Las reglas viven en la base de datos:** un correo no genera dos solicitudes, no hay dos responsables, no se saltan estados y una solicitud cerrada no se toca. Se cumplen aunque alguien escriba directamente en la base de datos.
- **La aplicación no es administradora de la base de datos:** usa un usuario que no puede borrar datos, ni alterar el historial, ni desactivar las reglas.
- **El servidor de base de datos solo es accesible desde el propio equipo**, y las contraseñas están fuera del código.

---

## 4. Mensajes que puede ver el usuario

| Situación | Respuesta del sistema | Qué hacer |
|---|---|---|
| Otra persona cambió la solicitud antes | **Conflicto (409):** «La solicitud cambió… Recárguela» | Recargar y volver a decidir |
| Paso de estado no permitido (p. ej. NUEVA → CERRADA) | **Regla de negocio (422):** «Transición no permitida» | Seguir el ciclo de estados |
| Asignar a alguien inactivo o inexistente | **422:** «El responsable … no existe o está inactivo» | Elegir otra persona |
| Asignar una solicitud resuelta o cerrada | **422:** «No se puede asignar una solicitud en estado …» | — |
| Datos incompletos o inválidos | **422:** «Datos inválidos — …» | Corregir el dato indicado |
| La solicitud no existe | **404** | Verificar el código |
| Mismo correo recibido dos veces | Sin error: se ignora el duplicado | — |

---

## 5. Guion de demostración (5 minutos, para la sustentación)

Requisitos: Docker Desktop abierto y `npm run demo` en la carpeta del proyecto. Abrir http://127.0.0.1:3100.

1. **Bandeja:** mostrar que las ALTA están arriba y las tarjetas por estado.
2. **Correo nuevo (F1–F3):** en *Simular un correo entrante*, enviar *«Fuga de gas en la cocina del salón, es urgente»*. Aparece clasificada como MANTENIMIENTO con prioridad ALTA.
3. **Asignar (F6):** abrir esa solicitud y asignarla a Laura. Cambia a ASIGNADA y el historial lo registra.
4. **Avanzar (F7):** EN_PROCESO → RESUELTA → CERRADA. Mostrar la línea de tiempo, la primera respuesta y que Laura quedó liberada.
5. **Regla (F7):** en otra solicitud NUEVA, pulsar *«Probar salto inválido → CERRADA»* y mostrar el rechazo.
6. **Conflicto (F10):** abrir la misma solicitud en dos pestañas, cambiarla en una y luego intentar en la otra: aparece el aviso de conflicto.
7. **Corrección (F8):** cambiar la prioridad de una solicitud y mostrar el comentario en el historial.
8. **Indicadores (F9):** mostrar la carga por responsable antes y después de cerrar.
9. **Cierre técnico (opcional):** desde SQL, intentar `UPDATE HISTORIAL_ESTADOS …` o saltar un estado por SQL directo. La base de datos lo rechaza (experimentos de la §8 de la guía de estudio).

---

## 6. Qué no hace todavía

| Funcionalidad | Cuándo (plan) |
|---|---|
| Leer automáticamente la cuenta de Gmail del conjunto | Semana 3 |
| Inicio de sesión y permisos por rol (que soporte solo vea y cambie lo suyo) | Semana 4 |
| Panel definitivo conectado (con filtros, cambio de categoría, gestión de usuarios) | Semana 5 |
| Reportes por periodo y exportación CSV | Semana 5 |
| Responder automáticamente al residente | Después del MVP |
| Portal para residentes | Fuera del MVP |

El visor actual actúa siempre como **Administrador** y no tiene inicio de sesión: es solo para uso local y demostración.

---

## 7. Glosario rápido

- **Solicitud:** el «caso» que nace de cada correo; tiene código `SOL-000123`.
- **Responsable vigente:** la persona que hoy atiende la solicitud.
- **SLA:** tiempo objetivo de respuesta según la prioridad (4, 24 o 72 horas).
- **Primera respuesta:** momento en que la solicitud pasa por primera vez a EN_PROCESO o RESUELTA.
- **Versión:** número que sube con cada cambio; sirve para detectar que otra persona la modificó.
- **Historial:** registro permanente de todos los cambios; no se puede editar ni borrar.
- **SIN_CLASIFICAR:** categoría de los correos que el sistema no supo clasificar; una persona los revisa.
