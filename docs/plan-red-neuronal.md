# Plan — Red neuronal propia para las sugerencias (requisito del curso)

Reemplaza la llamada a un modelo externo (OpenRouter / OpenCode Go) por una red neuronal entrenada por el
equipo, que corre dentro del worker de IA. Complementa a `docs/plan-desarrollo.md` (sección "Sugerencias de IA").

## 1. Objetivo y alcance

**Objetivo:** una red neuronal propia que, dado un correo (asunto + cuerpo), sugiera **categoría** y
**prioridad**, con una **justificación** y un **resumen**, y que se pueda medir contra el clasificador por
reglas y contra el modelo externo.

**La red clasifica; no genera texto libre.** Un modelo que escribe español coherente necesita millones de
palabras de entrenamiento, y el conjunto tendrá cientos o pocos miles de correos. Con esos datos una red
generativa entrenada desde cero produce frases sin sentido. En cambio, la justificación y el resumen se
obtienen *de la propia red* (sección 7): qué palabras pesaron en la decisión y qué frase la sostiene.

**Qué no cambia:**
- T1 sigue clasificando por reglas: un correo nunca depende de la IA (regla 8).
- La red solo **sugiere**: escribe en `SUGERENCIAS_IA` con T7, nunca en `SOLICITUDES`.
- La regla de negocio "seguridad nunca BAJA" (`prioridadPermitida`) se sigue aplicando en T7.
- OpenRouter / OpenCode Go quedan como proveedores alternativos: sirven para comparar.

## 2. Decisiones

| # | Decisión | Recomendación | Alternativa |
|---|---|---|---|
| D1 | ¿Librería o red escrita a mano? | **Decidido (noviembre de 2026): TensorFlow.js.** Se usan `@tensorflow/tfjs-core`, `tfjs-layers` y `tfjs-backend-cpu` 4.22: CPU en JavaScript puro, sin `tfjs-node` (dependencias nativas) ni WebGL | Desde cero en TypeScript: descartada por el equipo |
| D2 | Lenguaje | **TypeScript**, el mismo del proyecto: un solo stack, pruebas en Vitest y el modelo se usa directo en el worker | Python (Keras/PyTorch) para entrenar y exportar a ONNX; el worker lo usa con `onnxruntime-node`. Suma un segundo entorno |
| D3 | ¿Qué predice? | **Categoría (5 clases, incluida `SIN_CLASIFICAR`) y prioridad (3 clases)** en una sola red con dos salidas | Dos redes separadas (más simple de explicar, peor con pocos datos) |
| D4 | Confianza | La red entrega probabilidades. Se guardan en `SUGERENCIAS_IA` (migración `0007`, opcional) | No guardarla y solo mostrarla en la justificación |

**Estado:** RN-04 y RN-05 implementadas en `apps/red-neuronal`, con 27 pruebas. Falta el corpus (RN-01, RN-02).

## 3. Entradas y salidas

Encaja en la interfaz que ya usa el worker (`apps/worker-ia/src/proveedor.ts`):

```
EntradaIA { asunto, cuerpo }            ← ya enmascarado y recortado a 4.000 caracteres por el worker
        │
        ▼  ProveedorLocal.sugerir()
SugerenciaIA {
  categoria      ← argmax de la salida de categoría (o SIN_CLASIFICAR si la confianza < umbral)
  prioridad      ← argmax de la salida de prioridad
  justificacion  ← palabras que más pesaron + confianza (sección 7)
  resumen        ← frase del correo que más sostiene la decisión (sección 7)
  modelo         ← "rn-v1" (versión del modelo entrenado)
}
```

## 4. Datos

### 4.1 Fuentes de etiquetas

| Fuente | Uso | Cuidado |
|---|---|---|
| **Corpus etiquetado a mano** (`data/corpus.jsonl`) | Fuente principal de entrenamiento | Variedad de redacción: formal, informal, con errores, largo, corto, varios temas en un correo |
| **Correos reales del gateway**, exportados enmascarados y etiquetados por personas | Entrenamiento y prueba | Etiquetar **a ciegas**, sin ver lo que dijeron las reglas |
| Solicitudes `RESUELTA`/`CERRADA` (aceptación implícita) y reclasificadas con T4 (corrección explícita) | Reentrenamiento posterior (RN-10) | La aceptación implícita es una etiqueta débil: el personal pudo no corregirla |
| Etiquetas del clasificador por reglas | **Solo como punto de comparación**, nunca para entrenar | Entrenar con ellas enseña a copiar las reglas |
| Correos sintéticos generados con un LLM | Solo entrenamiento, revisados por una persona; **nunca en el conjunto de prueba** | La red aprendería el estilo del LLM |

Lección del propio proyecto (plan, S2): los 34 correos de ejemplo los escribió el mismo equipo que las reglas
y por eso las reglas sacan 100 %. **El conjunto de prueba lo escriben o recolectan personas distintas** de
quienes escriben el de entrenamiento y las reglas.

### 4.2 Guía de etiquetado (RN-01)

Un documento corto con la definición de cada clase y ejemplos límite, para que dos personas etiqueten igual:

- **Categorías:** SEGURIDAD, MANTENIMIENTO, FACTURACION, ADMINISTRATIVO y SIN_CLASIFICAR (saludos,
  agradecimientos, publicidad, respuestas sin pedido).
- **Prioridades:** ALTA (riesgo para personas o bienes, o servicio esencial caído), MEDIA, BAJA.
- **Casos límite:** un correo con dos temas se etiqueta por el más urgente; "gracias, ya lo arreglaron"
  es SIN_CLASIFICAR.
- **Acuerdo entre etiquetadores:** dos personas etiquetan el mismo 10 % y se calcula κ de Cohen. Si κ < 0,7,
  se ajusta la guía antes de seguir.

### 4.3 Tamaño y división

- **Meta:** ≥ 500 correos etiquetados, ≥ 60 por categoría y ≥ 60 por prioridad.
- **Prueba:** 100 correos apartados desde el inicio (estratificados) y usados **una sola vez**, al final.
- **Resto:** validación cruzada estratificada de 5 particiones para elegir los hiperparámetros.

### 4.4 Formato y privacidad

```jsonl
{"id":"c-0001","asunto":"…","cuerpo":"…","categoria":"MANTENIMIENTO","prioridad":"ALTA","fuente":"manual","etiquetador":"A"}
```

- El texto se guarda **ya enmascarado** con `domain/enmascarar.ts`, la misma función que usa el worker antes
  de llamar al proveedor (Ley 1581, y evita que la red aprenda nombres o teléfonos).
- `data/` va en `.gitignore`. Un correo real **nunca** se versiona.
- El vocabulario solo admite palabras que aparezcan en ≥ 3 correos distintos. Así no entran nombres ni
  direcciones que el enmascarado haya dejado pasar.

## 5. Representación del texto (RN-04)

El mismo código en entrenamiento y en uso. Si difieren (*train/serve skew*), la red falla en silencio.

1. Recortar a 4.000 caracteres (`LIMITE_TEXTO` del worker) y enmascarar.
2. `normalizar()` de `domain/clasificador.ts`: minúsculas y sin tildes.
3. Separar en palabras; agregar bigramas ("fuga de" → "fuga_de"). El asunto se repite dos veces, como en las
   reglas, porque resume la intención.
4. Vocabulario: hasta 3.000 términos, con frecuencia en ≥ 3 correos.
5. Vector **TF-IDF** normalizado (L2) de tamaño V.

Experimento opcional: n-gramas de caracteres (3 a 5), que toleran faltas de ortografía ("tuveria").

## 6. Arquitectura y entrenamiento (RN-05)

```
x ∈ ℝ^V (TF-IDF)
   │
Dense(64, ReLU) + L2(1e-4)                         ← capa oculta compartida
   ├── Dense(5, softmax)  → categoría
   └── Dense(3, softmax)  → prioridad
pérdida = entropía cruzada(categoría) + entropía cruzada(prioridad), con pesos por clase
```

- **Por qué tan pequeña:** con ~500 ejemplos, una red profunda memoriza. Con un vocabulario de 3.000
  términos son ~200 mil parámetros.
- **Optimización:** Adam, lotes de 32, hasta 100 épocas, parada temprana con paciencia 10 sobre la pérdida
  de validación. Al terminar se restauran los pesos de la mejor época.
- **Tasa de aprendizaje 1e-2 (provisional):** con vectores TF-IDF de norma 1 y pocos lotes por época, 1e-3
  se quedaba corto. En el corpus sintético de las pruebas, a 60 épocas la prioridad acertaba el 73 % con
  1e-3 y el 84 % con 1e-2. RN-06 la ajusta con validación cruzada.
- **Sin dropout por defecto:** en TF.js, una semilla fija repite la misma máscara en cada paso, y sin
  semilla el entrenamiento deja de ser reproducible. La regularización la hacen L2 y la parada temprana.
  El dropout queda como opción para experimentos.
- **Reproducible:** semilla fija para la inicialización y para el orden de los lotes (generador propio; el
  `shuffle` de TF.js usa `Math.random`). Una prueba verifica que dos entrenamientos dan pesos idénticos.
- **Tiempo:** en CPU con JavaScript puro, 240 correos × 100 épocas tardan unos 15 s.
- **Lección del corpus sintético:** con 8 correos por combinación (120 en total), la red se aferraba a
  palabras de relleno y fallaba la prioridad en correos nuevos. Con 240 acertó el 100 %. Confirma que el
  tamaño del corpus (RN-02) es lo que más pesa.
- **Hiperparámetros** (elegidos con validación cruzada): capa oculta {32, 64, 128}, dropout {0,2; 0,5},
  representación {palabras, palabras + bigramas, n-gramas de caracteres}.
- **Umbral de confianza:** si la mayor probabilidad de categoría queda bajo el umbral, la sugerencia es
  SIN_CLASIFICAR y la decide una persona. El umbral se calibra en validación.
- **Guardar y cargar:** sin `tfjs-node` no existe `file://`. Se usa `tf.io.withSaveHandler` para escribir
  `model.json` y `pesos.bin`, y `tf.io.fromMemory` para cargarlos. Con el modelo se guardan el vocabulario
  (con IDF) y las métricas.

## 7. Justificación y resumen, sin generar texto (RN-07)

**Justificación por oclusión:** para cada palabra presente en el correo, se quita y se vuelve a predecir. La
importancia de esa palabra es lo que cae la probabilidad de la clase elegida. Con una red así de pequeña son
unas 100 predicciones por correo, menos de 50 ms.

> Clasificado como MANTENIMIENTO (confianza 87 %) por: *fuga*, *tubería*, *humedad*. Prioridad ALTA (92 %) por: *urgente*.

**Resumen extractivo:** se divide el correo en frases y se elige la que, **por sí sola**, da más
probabilidad a la clase elegida. Se agrega una segunda frase si cabe en 500 caracteres. Si el correo no tiene
frases, se usa el asunto. El resumen nunca queda vacío: `CK_SugerenciasIA_lista` lo exige.

Así la justificación y el resumen salen del modelo y se pueden auditar, a diferencia de un texto generado.

## 8. Evaluación (RN-06)

**Comparaciones, todas sobre el mismo conjunto de prueba:**

| Experimento | Qué es |
|---|---|
| E0 | Clasificador por reglas actual (`domain/clasificador.ts` + `priorizador.ts`) |
| E1 | Red sin capa oculta (equivale a una regresión logística): línea base |
| E2 | **Red de la sección 6** (la propuesta) |
| E3 | Variante con n-gramas de caracteres (opcional) |
| E4 | Modelo externo (OpenRouter), con el texto enmascarado (opcional) |

**Métricas:**
- Exactitud y **F1 macro** por salida (macro porque las clases están desbalanceadas).
- Matriz de confusión de categoría y de prioridad.
- **Sensibilidad (recall) de SEGURIDAD y de ALTA:** no detectar un correo urgente cuesta más que una falsa
  alarma.
- Latencia por correo, tamaño del modelo y curva de aprendizaje (rendimiento vs. tamaño del corpus).
- Análisis de errores: 20 correos mal clasificados, agrupados por causa.

**Metas (se reportan aunque no se cumplan; no se ajusta nada mirando el conjunto de prueba):**
- E2 ≥ E0 en F1 macro de categoría.
- Recall de SEGURIDAD ≥ 0,90 y de ALTA ≥ 0,85.
- Menos de 50 ms por correo en CPU, con justificación incluida.
- Mismo corpus y misma semilla ⇒ mismas métricas.

## 9. Integración en el sistema (RN-08)

```
apps/red-neuronal/
  src/texto.ts         normalización, tokens, vocabulario, TF-IDF (puro)
  src/modelo.ts        interfaz Modelo + implementación TF.js (o a mano, según D1)
  src/explicar.ts      oclusión → justificación; resumen extractivo
  src/metricas.ts      F1, recall, matriz de confusión, κ de Cohen (puro)
  src/cli/exportar.ts  BD → data/*.jsonl (enmascarado; lectura SNAPSHOT en modules/consultas.ts)
  src/cli/entrenar.ts  data/ → modelos/rn-vN/
  src/cli/evaluar.ts   modelo + prueba → metricas.json
apps/worker-ia/src/local.ts   ProveedorLocal: implementa ProveedorIA y carga el modelo una vez
data/        (fuera de git) corpus etiquetado
modelos/     model.json, pesos.bin, vocabulario.json, metricas.json
```

- **Configuración:** `IA_PROVEEDOR=local` y `IA_MODELO=rn-v1`. Sin llave, y con `IA_PAUSA_ENTRE_S=0` porque no
  hay cuota.
- **Scripts:** `npm run rn:exportar`, `rn:entrenar`, `rn:evaluar`. `apps/red-neuronal` entra en `tsconfig`,
  ESLint y Vitest, así que la puerta de calidad lo cubre.
- **Versionado:** cada sugerencia queda con `proveedor='local'` y `modelo='rn-v1'`. Se puede comparar
  versiones y volver atrás.
- **Modelos en git:** solo el entrenado con el corpus sintético o de demostración. El entrenado con correos
  reales queda fuera.
- **Panel (opcional):** la pantalla "Laboratorio IA" (`apps/web/src/features/ai-lab`, hoy con datos
  simulados) puede mostrar las métricas y la matriz de confusión del modelo activo.

## 10. Tareas

Cada tarea está terminada cuando `npm run gate` pasa, tiene pruebas nuevas y el diff está revisado.

| ID | Tarea | Aceptación | Esfuerzo |
|---|---|---|---|
| RN-01 | Guía de etiquetado y piloto de acuerdo | 50 correos etiquetados por 2 personas; κ ≥ 0,7 o guía corregida | 1–2 días |
| RN-02 | Corpus etiquetado y conjunto de prueba apartado | ≥ 500 correos (≥ 60 por clase); 100 de prueba de autores distintos; `data/` fuera de git | 4–6 días (el cuello de botella) |
| RN-03 | Exportador desde la BD | Lectura SNAPSHOT en `consultas.ts`; texto enmascarado; prueba con datos personales conocidos ⇒ no aparecen en el JSONL | 1 día |
| RN-04 | ✅ `texto.ts`: normalización, vocabulario y TF-IDF | Pruebas: determinista; vocabulario con frecuencia mínima; mismo recorte que el worker | Hecha |
| RN-05 | ✅ `modelo.ts`: red, entrenamiento, guardar y cargar, y `npm run rn:entrenar` | Prueba de cordura (≥ 95 % en correos sintéticos nuevos); guardar → cargar da predicciones idénticas; reproducible con semilla; parada temprana; sin fugas de memoria | Hecha |
| RN-06 | Evaluación y comparación E0–E2 | `metricas.json` con F1 macro, matrices de confusión y recall de SEGURIDAD y ALTA; validación cruzada para hiperparámetros; prueba usada una sola vez | 2 días |
| RN-07 | `explicar.ts`: justificación y resumen | Pruebas: en una red pequeña conocida, la oclusión elige la palabra obvia; el resumen nunca está vacío y cabe en 500 | 1–2 días |
| RN-08 | `ProveedorLocal` en el worker | Prueba contra SQL Server real: `procesarPendientes` con el proveedor local deja sugerencias `LISTA` con `proveedor='local'`; SEGURIDAD nunca sale BAJA | 1–2 días |
| RN-09 | Informe para el curso | Metodología, datos, arquitectura, resultados, análisis de errores, limitaciones y ética (Ley 1581) | 2–3 días |
| RN-10 | *(Opcional)* Confianza en la BD y reentrenamiento | Migración `0007` (`SUGERENCIAS_IA.confianza`); exportador de solicitudes cerradas o reclasificadas; panel con métricas | 2–3 días |

**Orden:** RN-01 y RN-02 empiezan ya, porque etiquetar es lo que más tarda. RN-03 a RN-05 avanzan en paralelo
con datos de prueba. Después vienen RN-06, RN-07, RN-08 y RN-09.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Pocos datos: la red memoriza | Red pequeña, dropout, L2, parada temprana, validación cruzada y comparación con E1 |
| Etiquetas sesgadas por las reglas | Etiquetado a ciegas; conjunto de prueba de otros autores |
| Pocas clases de SEGURIDAD o ALTA | Pesos por clase, división estratificada, F1 macro y recall por clase |
| Datos personales en el corpus o el modelo | Enmascarado antes de exportar, frecuencia mínima ≥ 3, `data/` y modelos reales fuera de git |
| Diferencias entre entrenamiento y uso | Mismo `texto.ts` y mismo recorte; prueba que lo compara |
| Temas nuevos con el tiempo (drift) | Modelos versionados, reentrenamiento con etiquetas confirmadas (RN-10) |
| El resumen solo extrae frases | Se declara como limitación en el informe; el objetivo es apoyar la clasificación |

## 12. Entregables para el curso

1. El código de la red y su entrenamiento (`apps/red-neuronal`), con pruebas.
2. El modelo entrenado `rn-v1` y su `metricas.json`.
3. El informe (RN-09) con la comparación reglas vs. red vs. modelo externo.
4. Una demostración: un correo llega a Gmail, el gateway lo ingesta, la red propia sugiere categoría y
   prioridad con su justificación, y el panel lo muestra.
