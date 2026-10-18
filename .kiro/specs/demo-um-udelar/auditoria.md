# Rumbo — Auditoría del repositorio y plan de la demo (Etapa 1 + Etapa 2 reducida)

- **Repositorio auditado:** `Santi-mz/BUILD-101`, rama `main`, commit `b34a2b2` (merge del PR #19, 17/10/2026 20:02 UY).
- **Cómo se auditó:** lectura del código, los documentos de `docs/` (incluidos los dos PDF), `.kiro/steering/` y el esquema de Supabase; ejecución local de `npm test`, `npx tsc --noEmit` y `npm run lint`; y **simulaciones del motor real** (`runTurn` + `planner`) con usuarios guionados, en modo mock y con un LLM que falla. Las simulaciones corrieron en una copia local: **no se modificó ningún archivo del repo, no hubo commits ni despliegues.**
- **Lo que no tuve:** registros de producción, filas de `vocational_sessions` ni la transcripción de la prueba de las ~30 preguntas. Donde eso limita una conclusión, lo digo.
- **Convención:** **[CONFIRMADO]** = lo verifiqué en el código, en una prueba o en una simulación. **[HIPÓTESIS]** = es plausible, pero hay que probarlo.

> **Actualización (18/10/2026), decisión del equipo para la presentación:** el tope pasa a **8 preguntas como máximo** (objetivo de 5 a 7), y **toda pregunta trae opciones** en botones (hasta 8 después de un "no sé"). Si en este documento queda alguna cifra vieja (12, 6–10), **manda la spec**: `requirements.md`, `design.md` y `tasks.md`.

---

## Resumen para el equipo (1 minuto)

1. **El motor actual está diseñado para conversaciones largas.** No es un error puntual: la especificación (Documento 2, requisito R14) y la rúbrica `rubric.v1.json` fijan **ofrecer el cierre a los 30 mensajes y forzarlo a los 40**. Además exigen recorrer 4 niveles en orden, con un resumen y una confirmación por nivel. **[CONFIRMADO]**
2. **Aun con un usuario ideal, el motor hace 19 preguntas.** Con usuarios ambiguos, que rechazan resúmenes, que no hablan de su "punto de partida" o con el LLM caído, **llega a 40 sin cerrar por sí mismo**. **[CONFIRMADO por simulación]**
3. **La Etapa 2 tiene una buena tubería (A2 → A3 → A4), pero el catálogo no sirve para esta demo.** Son 16 registros DEMO sintéticos, ocupaciones de EE.UU. (O\*NET) y convocatorias que extrae un LLM. Hay dos fallas de criterio: las convocatorias extraídas por el LLM reciben el mismo vector RIASEC que la persona (afinidad perfecta artificial) y quedan marcadas como `verified` con la fecha del momento. **[CONFIRMADO]**
4. **Propuesta:** reutilizar el 80% de la arquitectura y cambiar tres cosas:
   - un **planificador compacto v2**, con presupuesto de 8 preguntas (actualizado) y suficiencia por "casilleros" imprescindibles;
   - un **catálogo curado UM + Udelar** (13 carreras) como único proveedor en modo demo;
   - un **ranking v2** con umbral de relevancia, que devuelve de 3 a 5 opciones o menos si no alcanzan.
5. **Las primeras tres tareas:**
   - (1) pruebas que reproduzcan los ciclos;
   - (2) la rúbrica v2 con el presupuesto y los criterios de suficiencia;
   - (3) el planificador v2 con salida garantizada.

---

## A. Diagnóstico actual

### A.1 Qué hay y cómo funciona

| Pieza | Archivo(s) | Estado real |
|---|---|---|
| Orquestador del turno | `src/lib/engine/turn.ts` | Funciona en este orden: enmascarar → seguridad → analizador (LLM) → perfil → planificador → entrevistador (LLM) → guardas. **[CONFIRMADO, 63 pruebas pasan]** |
| Analizador (LLM 1) | `engine/analyzer.ts`, `prompts/analyzer.v1.ts` | Devuelve JSON validado con Zod, hace 1 reintento y, si falla, sigue sin evidencias. En modo mock usa reglas regex aproximadas. La calidad con Gemini real **no tiene pruebas** en el repo. |
| Perfil | `engine/profile.ts` | Puro y determinista. Pesos 3/2/1/0, % RIASEC con método del resto mayor, ejes de Prediger, perfil plano, "regla de dos evidencias". Bien hecho y bien testeado. |
| Planificador | `engine/planner.ts` | Puro, pero **implementa al pie de la letra un diseño largo** (ver P0). |
| Entrevistador (LLM 2) | `engine/interviewer.ts`, `prompts/interviewer.v1.ts` | Redacta según la acción. Tiene guardas con reintento y plantillas seguras de respaldo. |
| Guardas | `engine/guards.ts` | Máximo 1 "?", sin carreras, instituciones ni diagnósticos, límite de palabras. Correcto para la Etapa 1. |
| Seguridad / datos personales | `engine/safety.ts`, `engine/pii.ts` | Prechequeo por reglas, mensaje fijo y `SAFETY_STOP`. El enmascarado se hace **antes** de enviar el texto al LLM y de guardarlo. |
| Persistencia | `lib/store.ts`, `supabase/schema.sql` | `vocational_sessions` (estado JSON, solo service role, RLS activado sin políticas públicas) o memoria si no hay Supabase. Borrado a los 30 días. |
| API Etapa 1 | `api/session`, `api/chat`, `api/session/evidence` | Crear sesión con consentimiento y edad, procesar un turno, cerrar con `close:true`, corregir evidencias. |
| UI chat | `app/chat/chat.tsx` | Etapas, panel "Lo que voy entendiendo" con "No es así / Sí, es así", botón "Terminar" **visible recién desde el turno 4**, dictado por voz. |
| UI resultado | `app/resultado/result.tsx` | Barras RIASEC (si hay umbral), ejes, intereses concretos, valores, contexto, preguntas abiertas, "Mostrame caminos", rutas, profundización, mentores DEMO, próximo paso y encuesta. |
| Etapa 2: A2/A3/A4 | `lib/agents/{opportunities,verification,ranking,pathways,catalog,official}.ts` | La tubería funciona y está testeada (A3: estados por dominio y fecha; A4: restricciones duras y "nunca rellena" frente a filtros). Ver los problemas en B. |
| Ficha y preguntas sobre una ruta | `pathways.ts` → `pathDetails`, `askAboutPath` | El LLM responde **solo con los datos de la ficha** y tiene una plantilla de respaldo. Es un buen patrón y se puede reutilizar tal cual. |
| A5 Mentores | `agents/mentors.ts`, `data/mentors.demo.json` | Directorio ficticio con consentimiento y 403. **Fuera de alcance** para esta demo. |
| Agente anterior | `lib/agent/run.ts`, `lib/agent/prompt.ts`, `/perfil/anterior`, `api/live/*` | Ya no lo usa `/api/chat`, **pero la voz en vivo (`/api/live/token`) todavía usa el prompt viejo** (MAX_QUESTIONS 10, O\*NET, PubMed, búsqueda web). Son dos "personalidades" distintas en el mismo producto. **[CONFIRMADO]** |

**Chequeos ejecutados:**

- `npm test` → **63/63 pasan**.
- `npm run lint` → sin errores.
- `npx tsc --noEmit` → **1 error** (`LayoutProps` no encontrado en `src/app/layout.tsx`). Es un tipo que genera Next 16: probablemente desaparece al correr `next dev`, `next build` o `next typegen` antes. Hay que confirmarlo, porque AGENTS.md exige `tsc` limpio antes de cada PR.

### A.2 Comparación con el MVP pedido

| Requisito de la demo | ¿Existe? | Comentario |
|---|---|---|
| Una pregunta por turno, adaptativa | Sí | La garantizan las guardas y el planificador. |
| No ser un cuestionario rígido | **Parcial** | Recorre los niveles 0→1→2→3 en orden fijo, con resumen y confirmación por nivel. Se siente como un formulario por etapas. |
| Profundizar cuando hay algo interesante | Sí, **pero de más** | `ASK_DEEPEN` se activa ante respuestas breves o evasivas, incluso ante "no me interesa". |
| Sin afirmaciones de personalidad sin evidencia | Sí | Guardas, regla de dos evidencias, hipótesis con peso 0. |
| Reconocer información insuficiente | **Parcial** | Los % se ocultan si no hay umbral, pero no existe un estado explícito de "perfil provisional". |
| Corregir interpretaciones | Sí | Panel con "No es así" y resúmenes por nivel. |
| Cerrar con un perfil claro y humano | **Parcial** | Hay datos estructurados, pero no una devolución narrativa del tipo "qué observé / por qué lo digo / qué no sé". Los % RIASEC pueden leerse como una medición. |
| 5–7 preguntas, tope de 8 (actualizado) | **No** | Hoy: mínimo de 19 en el caso ideal y tope de 40. |
| Pedir el perfil cuando quiera | **Parcial** | Botón desde el turno 4; texto libre ("quiero ver mi perfil") no se detecta. |
| Catálogo UM + Udelar verificable | **No** | No hay ni un registro de estas instituciones. |
| 3–5 opciones sin rellenar | **No** | Máximo 3 y sin umbral de relevancia (ver B). |
| Ficha comprensible + enlace oficial | Parcial | El enlace "Ver fuente" existe, pero los registros DEMO no tienen URL. |
| Fin de la demo al abrir el enlace | No | Hoy sigue con mentores y próximo paso. |

---

## P0. Causa de las ~30 preguntas y salida garantizada

### P0.1 Qué se puede afirmar con evidencia

**1. El diseño especificado es largo. [CONFIRMADO, código y documentos]**

- `rubric.v1.json → limits`: `offerCloseAtUserTurns: 30`, `forceCloseAtUserTurns: 40`. Viene del Documento 2, R14.
- Topes por nivel (`exitCriteria.maxTurns`): N0=4, N1=5, N2=8, N3=8. El Documento 1 orienta "2–4 + 3–5 + 5–8 + 5–8 intercambios", **de 15 a 25 en total**.
- El Documento 2 fija como criterio de aceptación "Sesión completa en 15 a 25 minutos", y el onboarding (`chat.tsx`) le promete eso al usuario.
- `closeReady` exige **todo esto a la vez**: N0 confirmado, N2 confirmado, ≥3 intereses específicos y ≥2 valores.
- En N3, si `closeReady` no se cumple, cierra recién cuando el nivel lleva `maxTurns + 3 = 11` turnos (`planner.ts`, rama `lvl === 3`).
- Cada nivel agrega 1 resumen + 1 confirmación (y hasta 2 si la respuesta no es clara).

**2. Simulación del motor real (planificador, perfil y turno sin cambios; analizador por reglas). [CONFIRMADO]**

| Usuario simulado | Preguntas de la IA | ¿Cerró solo? | Qué pasó |
|---|---|---|---|
| Respuestas ricas + confirma "sí" | **19** | Sí, en el turno 19 | Es el mejor caso posible y ya está casi en el doble del objetivo. 10 turnos en N3. |
| Respuestas ricas + "más o menos" | 19 | Sí | Igual que el anterior. |
| Respuestas ricas + ignora los resúmenes | 13 | Sí | Las confirmaciones se dan por parciales tras 2 intentos. |
| Respuestas ricas + **rechaza resúmenes** | **40** | No (cierre forzado) | Cada "no es así" reabre N0 y descuenta turnos; vuelve a resumir sin límite. N0 llegó a 32 turnos. |
| **Vago** ("no sé", "depende", "capaz") | **40** | No | Ciclo `ASK_DEEPEN → ASK_DEEPEN → CHANGE_ANGLE` que se repite. **OFFER_CLOSE nunca aparece.** |
| Mixto (intereses sí, punto de partida no) | **40** | No | **Trampa del nivel 0:** sin evidencia N0 no sale de N0, aunque haya 45 evidencias de otros niveles. |
| **LLM caído** + respuestas ricas | **40** | No | 0 evidencias; repite el ciclo deepen/cambio de ángulo hasta 40. |

**3. Mecanismos concretos de ciclo. [CONFIRMADO en el código]**

- **a. `OFFER_CLOSE` es inalcanzable con respuestas breves o evasivas.** En `next()`, las ramas `ASK_DEEPEN` y `CHANGE_ANGLE` van **antes** del chequeo de `offerCloseAtUserTurns`.
- **b. Ciclo infinito deepen / cambio de ángulo.** `sameIndicatorTries` se reinicia al cambiar de indicador, así que el patrón 2×deepen + 1×cambio se repite sin fin.
- **c. Trampa de nivel.** `exitCriteriaMet` solo cuenta evidencia del **nivel actual**, y el tope por turnos exige `ev.length > 0` de ese nivel. Sin evidencia de ese nivel, el tope no actúa.
- **d. Resúmenes rechazados sin límite.** `resolveLevelConfirmation("REJECTED")` deja el nivel en `OPEN` y resta 2 turnos. No hay un máximo de resúmenes por nivel.
- **e. "Terminar" depende del LLM.** Con `close:true`, `runTurn` igual llama al analizador **antes** de cerrar. Si Gemini está lento o caído, el cierre espera los reintentos.
- **f. El botón aparece tarde.** `canClose: userTurns >= 4`, y no se detecta la intención de cerrar en texto libre.
- **g. Latencia por encima del límite de la función.** Cada llamada tiene un timeout de 25 s; el analizador hace 2 intentos y el entrevistador otros 2. En el peor caso son ~100 s, contra `maxDuration = 60` de `/api/chat`. Vercel cortaría el pedido sin guardar el turno. Es aritmética sobre el código, **no está medido**.

### P0.2 Qué no se puede afirmar todavía

- **Qué camino exacto produjo las ~30 preguntas de la prueba anterior. [HIPÓTESIS]** Sin la transcripción ni la fila de la sesión no puedo decir cuál de los mecanismos a–d ocurrió. Las ~30 coinciden con `offerCloseAtUserTurns: 30` y con los ciclos de la tabla.
- **Si la prueba fue con el agente anterior** (antes del merge del 17/10 a las 19:58, `runAgent`), el cierre dependía de que el **modelo** llamara a `finalize_profile` después de un aviso en texto. Ningún código lo forzaba. También es un candidato plausible, sin confirmar.
- **Cómo confirmarlo sin exponer datos:** si la prueba fue en producción después del merge, en `vocational_sessions.state.messages[].action.type` está la secuencia de acciones. Alcanza con contar tipos de acción (sin leer textos) para ver qué ciclo fue. Si fue antes, mirar `profiles.question_count` y `status` de esa cuenta.

### P0.3 Diseño propuesto: entrevista compacta con salida garantizada

**Principio:** el criterio de cierre deja de ser "completar la rúbrica" y pasa a ser **"tener lo imprescindible para un perfil provisional útil"**, con un presupuesto duro.

**Casilleros (slots) en lugar de niveles secuenciales.** Los indicadores de la rúbrica se mantienen; cambia cómo se agrupan:

| Tipo | Casillero | Se cumple cuando | Indicadores |
|---|---|---|---|
| **Imprescindible** | E1 · Punto de partida | Hay 1 evidencia N0.ESTADO **o** ya se preguntó 1 vez | N0.* |
| **Imprescindible** | E2 · Intereses con sustento | ≥2 evidencias de interés a favor (N1/N2/N3), ≥1 concreta, y al menos un área con 2 apoyos | N1.*, N2.*, N3.* |
| **Imprescindible** | E3 · Qué le importa | ≥1 valor o motivación (N4.VALOR) | N4.VALOR |
| Complementario | C1 · Restricciones prácticas | N4.BARRERA (lugar, horario, costo) o "no tengo" | N4.BARRERA |
| Complementario | C2 · Rechazos | N3.RECHAZO | N3.RECHAZO |
| Complementario | C3 · Segunda área / contraste | Una segunda área con evidencia | N2.* |
| Puede quedar desconocido | — | Ejes de Prediger exactos, flow, rol, autoeficacia, expectativas, apoyos, influencias | Se registran si aparecen, pero **nunca obligan a preguntar** |

**Reglas de cierre deterministas, en este orden** (en `planner.ts`, puras y testeables):

1. **Pedido de la persona** (botón desde el primer turno, o intención detectada por regex: "ver mi perfil", "terminar", "ya está", "basta") → `CLOSE`. Si hay <2 respuestas útiles, el cierre es **provisional**.
2. **`questionsAsked >= 8`** → `CLOSE`. Cuenta **los mensajes de la IA que tienen pregunta**, incluidos resúmenes y confirmaciones. No cuenta los turnos de la persona.
3. **Imprescindibles cumplidos y ≥2 complementarios, con `questionsAsked >= 5`** → `CLOSE`.
4. **Imprescindibles cumplidos y `questionsAsked >= 4`** → `OFFER_CLOSE`, **una sola vez**, con dos botones: "Ver mi perfil" o "Una pregunta más". Si sigue, cierra en el turno siguiente.
5. **Estancamiento:** `stall >= 2` (respuestas BRIEF/EVASIVE, sin evidencia nueva o con fallo del analizador, consecutivas) y `questionsAsked >= 4` → `CLOSE` **provisional**.
6. **Si no se cumple nada de lo anterior:** preguntar por el casillero imprescindible faltante de mayor prioridad. Si están todos, por el complementario de mayor prioridad.

**Rompe-ciclos. [nuevo]**

- Cada indicador se pregunta como máximo **1 vez + 1 profundización**. La profundización solo procede si la respuesta fue RICH pero sin ejemplo concreto. **Nunca** después de EVASIVE ni de "no me interesa".
- Ante "no sé", "depende" o "no me interesa": `OFFER_OPTIONS`, una pregunta con 3 o 4 opciones concretas en botones (en la UI las opciones van como chips). Al turno siguiente se pasa a otro casillero.
- **Una sola confirmación intermedia** (un mini-resumen de hipótesis alrededor de la pregunta 5–6). Si la persona la rechaza, se toma su corrección y **no se vuelve a resumir**. La revisión fina se hace en `/resultado`, donde el panel ya existe.
- Sin gating por nivel: desaparece la trampa del nivel 0.
- **Invariante de progreso:** en cada turno, o aumenta la cobertura de casilleros, o aumenta `stall`. Ninguna acción puede dejar ambos iguales dos veces seguidas.

**Fallos del LLM.**

- Timeout por llamada de **12 s** y **1** reintento total por turno, con un presupuesto por turno menor a 45 s (debajo de `maxDuration`).
- Si el analizador falla → `stall += 1`, y el entrevistador usa plantilla.
- Con 2 fallos seguidos → `OFFER_CLOSE` con lo que haya.
- `CLOSE` (por botón o por tope) **no llama al LLM**: el perfil es determinista.

**Valor desde los primeros minutos.**

- Desde la pregunta 3, el entrevistador puede reflejar una **hipótesis en forma de pregunta**. La rúbrica ya lo permite ("Me da la impresión de que…, ¿te parece?").
- El panel "Lo que voy entendiendo" se actualiza en cada turno; ya existe.
- Mostrar el progreso: "Pregunta 4 de 8 como máximo". Cambiar el texto del onboarding a **"5 a 8 minutos"**.

**Recorrido típico esperado (8 preguntas):**

1. Saludo + "¿qué estás haciendo hoy y qué tan claro tenés lo que viene?" (E1).
2. "¿Qué hacés por gusto aunque nadie te lo pida?" (E2).
3. "Contame una vez puntual…" (E2, concreta).
4. Pregunta de contraste: personas/cosas o ideas/datos (C3).
5. Mini-resumen con hipótesis + confirmación.
6. "¿Qué te importa que tenga lo que hagas?" (E3).
7. Restricciones: dónde, cuándo, costo (C1).
8. "¿Qué no te ves haciendo?" (C2) → `OFFER_CLOSE` o `CLOSE`.

**Latencia y tokens.**

- Hoy cada turno hace 2 llamadas secuenciales (analizador ~6.800 caracteres de prompt + entrevistador).
- Propuesta: no llamar al entrevistador en acciones con texto fijo (`OFFER_CLOSE`, `CLOSE`, confirmaciones) y recortar la rúbrica que recibe el analizador a los casilleros abiertos.
- Fusionar las dos llamadas en una sola **no** lo recomiendo para la demo, porque perdería la separación analizar/redactar que exigen las guardas.
- Medir antes de optimizar más: loguear `ms` por llamada en `logEvent`.

**Gobernanza:**

- AGENTS.md dice que cambiar el criterio es **publicar una versión nueva**. Por eso: `src/knowledge/rubric.v2.json` (versión `2.0.0`), con un bloque `slots` y `limits: { maxQuestions: 12, targetQuestions: [6, 10], offerCloseFrom: 6, maxDeepenPerIndicator: 1, maxSummaries: 1, stallToClose: 3 }`.
- La v1 queda intacta para comparar.
- Hay que **anotar el desvío respecto del Documento 2 (R14) y del Documento 1** (15–25 intercambios) y que lo valide quien es dueño del criterio científico.

### P0.4 Pruebas obligatorias (nuevas)

En `tests/conversation-budget.test.ts` y `tests/helpers.ts`, con un simulador de usuarios por guion y una **prueba de propiedades sin dependencias nuevas** (generador pseudoaleatorio con semilla fija y 200 conversaciones al azar armadas con un banco de respuestas):

| # | Prueba | Criterio de aceptación |
|---|---|---|
| T1 | Nadie queda atrapado | Para 200 conversaciones al azar + los 7 personajes de la tabla: `status === "COMPLETED"` con `questionsAsked <= 8`. |
| T2 | Respeta el límite | Ninguna transcripción tiene más de 8 mensajes de la IA con "?". |
| T3 | Ambiguas no repiten | Con 10 "no sé" seguidos: ningún `indicatorId` se pregunta más de 2 veces y no hay dos `ASK_DEEPEN` consecutivos tras EVASIVE. |
| T4 | Cierre anticipado | El personaje rico cierra con `questionsAsked` entre 5 y 7. |
| T5 | Perfil a pedido | `close:true` en el turno 1, 3 y 7 → `COMPLETED`; en el 1 y el 3, `profile.provisional === true`. |
| T6 | Fallo del LLM | Proveedor que siempre lanza error → cierra en ≤8 con perfil provisional. `close:true` no invoca al proveedor (espía con contador de llamadas = 0). |
| T7 | Evidencia vs desconocido | El snapshot final tiene `unknown[]` con cada casillero no cumplido, y cada afirmación de `observed[]` tiene `evidenceIds` existentes. |
| T8 | Perfil → opciones | Con el personaje rico, `researchPaths` con el catálogo UM+Udelar devuelve de 3 a 5 rutas, todas `verified` y con `source_url` de dominio oficial. Con el personaje vago, devuelve 0–2 rutas más una nota honesta. |
| T9 | Rechazo de resumen | Rechazar la confirmación intermedia no genera otro `SUMMARIZE_LEVEL`. |
| T10 | Regresión de las guardas | Se mantienen los escenarios E1–E7 actuales (adaptando los que dependen de 4 resúmenes). |

Además, un **script manual** (no en CI) `scripts/eval-conversation.ts`: Gemini hace de usuario simulado, 5 corridas por personaje. Mide preguntas, segundos totales, casilleros cumplidos y cantidad de rutas. Es lo que el README ya marca como pendiente.

---

## B. Brechas principales

### B.1 Etapa 1

1. Duración y salida garantizada (todo P0).
2. **No hay devolución narrativa.**
   - Falta una sección "Lo que observé", con cada afirmación ligada a una cita.
   - Falta "Lo que te importa", "Para tener en cuenta" y "Lo que todavía no sé", esta última explícita a partir de los casilleros no cumplidos.
   - Falta un sello de "Perfil provisional" cuando no se cumplieron los imprescindibles.
3. **% RIASEC en la demo:** con 5–8 preguntas casi nunca se llega al umbral (6 evidencias fuertes en 3 áreas). Además, las barras invitan a leerlo como un test. Propuesta: ocultarlas en la demo y mostrar "Lo que más apareció" en lenguaje llano, que ya existe (`AREA_PLAIN`).
4. Modo voz en vivo con el agente anterior: **excluirlo de la demo** (sacarlo de la navegación). El dictado sí puede quedar.

### B.2 Etapa 2

1. **No hay carreras reales de UM ni de Udelar.** Los proveedores actuales:
   - `demoCatalog`: 16 registros sintéticos;
   - `onetCatalog`: ocupaciones de EE.UU.;
   - `officialCatalog`: becas y convocatorias extraídas por LLM.
2. **`officialCatalog` rompe el criterio de verificación. [CONFIRMADO, `official.ts`]**
   - `riasec: riasec` le asigna a cada convocatoria **el perfil de la persona**. La similitud coseno da 1.0, así que siempre queda primera.
   - `verified_at: now` y `summary: o.why` (el "por qué te sirve" que redacta el LLM) hacen que un texto generado por IA quede como `verified`.
   - Para la demo, este proveedor queda **desactivado**.
3. **El ranking no tiene umbral de relevancia. [CONFIRMADO, `ranking.ts`]** Cualquier registro mostrable entra hasta completar 3. "Nunca rellena" solo vale frente a los filtros duros.
4. **La diversidad fuerza una opción por categoría** (`training` / `practical` / `adjacent`). En la práctica mete una ocupación O\*NET de EE.UU. y una práctica. Para un catálogo de carreras, la diversidad tiene que ser **por área e institución**.
5. **El máximo es 3; la demo pide de 3 a 5.**
6. **Falta una ficha de carrera** con descripción en llano, datos verificados con fuente y fecha, desconocidos, botón "Ir a la página oficial" y cierre de la demo.
7. **"Ninguna me convence" reabre N3 con los turnos en 0.** Con el planificador v2 debe sumar como máximo 3 preguntas y volver a buscar.
8. **`/api/session/routes` no declara `maxDuration`** y `officialCatalog` puede tardar hasta 40 s más las llamadas al LLM. Con el catálogo local esto desaparece (respuesta en milisegundos).

---

## C. Propuesta de demo: recorrido del usuario

1. **Landing → "Empezar"** (`/chat`). Onboarding con edad y consentimiento, ya existe. Texto: "Son 5 a 8 minutos. Vas a ver lo que entendí y carreras reales de UM y Udelar para investigar."
2. **Charla (5–7 preguntas, tope 8, siempre con opciones).**
   - Una pregunta por turno, con opciones rápidas cuando responde "no sé".
   - Indicador de progreso.
   - Panel "Lo que voy entendiendo" en vivo.
   - Botón **"Ver mi perfil ahora"** siempre visible.
3. **Mini-resumen intermedio** (una vez): "Me da la impresión de que… ¿te representa?", con chips Sí / Más o menos / No.
4. **Cierre** (por suficiencia, por pedido o por tope) → mensaje fijo → "Ver mi devolución".
5. **`/resultado` — Devolución:**
   - "Lo que observé": 2–4 frases, cada una con su cita entre comillas;
   - "Lo que te importa";
   - "Para tener en cuenta" (restricciones);
   - "Lo que todavía no sé" (casilleros faltantes);
   - sello "Provisional" si corresponde;
   - corrección ítem por ítem (ya existe) y aviso "No es un test".
6. **"Ver carreras para investigar"** → A2 (catálogo UM+Udelar) → A3 → A4 v2 → **3 a 5 tarjetas**:
   - nombre, institución, "Por qué aparece" (cita + interés vinculado);
   - "Qué podría no gustarte";
   - "Validado el dd/mm/aaaa".
   - Si hay menos de 3: "Encontré solo N con lo que charlamos; no voy a rellenar". Si hay 0: "Todavía no tengo suficiente para sugerirte carreras", con la opción de 2–3 preguntas más.
7. **Elegir una carrera → ficha:**
   - "Qué se estudia" (resumen en llano redactado **por el equipo** a partir de la página oficial);
   - datos verificados con fuente y fecha, **solo los que estén**;
   - "Lo que no sabemos: consultalo en la página oficial";
   - caja "Preguntale a Rumbo sobre esta ficha" (`askAboutPath`, ya existe).
8. **"Ir a la página oficial ↗"** (nueva pestaña) → mensaje de cierre: "Fin del recorrido de la demo", con encuesta corta (ya existe) y botón "Explorar otra carrera".

---

## D. Arquitectura mínima

### D.1 Conservar sin cambios

`profile.ts` (cálculo), `guards.ts`, `safety.ts`, `pii.ts`, `store.ts`, `session.ts` (se agregan campos), `api/session`, `api/session/evidence`, `api/session/path`, `verification.ts` (A3), `opportunities.ts` (A2 genérico), `pathDetails` / `askAboutPath`, el panel de correcciones, el onboarding y el esquema de Supabase (**no requiere cambios**).

### D.2 Cambiar

| Archivo | Cambio |
|---|---|
| `src/knowledge/rubric.v2.json` (nuevo) | Casilleros, límites y presupuesto. La v1 no se toca. |
| `src/lib/rubric.ts` | El esquema Zod acepta `slots` y los `limits` nuevos; se elige la versión activa con una constante o env (`RUBRIC_VERSION=2`). |
| `src/lib/engine/planner.ts` | `next()` v2 con presupuesto, suficiencia y rompe-ciclos. Funciones puras nuevas: `questionsAsked`, `slotStatus`, `sufficiency`, `isStalled`. |
| `src/lib/engine/types.ts` | `SessionState` suma `questionsAsked`, `stall`, `llmFailures`, `closeReason`, `summariesDone`, `askedCount` por indicador. Acciones nuevas: `OFFER_OPTIONS`, `MINI_SUMMARY`. |
| `src/lib/engine/turn.ts` | Detección de intención de cierre; `forceClose` antes del analizador; contadores de estancamiento y fallos. |
| `src/lib/llm/provider.ts` | Timeout de 12 s y un presupuesto de reintentos por turno. |
| `src/lib/engine/interviewer.ts` + `prompts/interviewer.v2.ts` | Guías para `OFFER_OPTIONS` y `MINI_SUMMARY`; plantillas sin LLM para acciones fijas. |
| `src/lib/engine/profile.ts` | **Solo se agrega**: `snapshot()` suma `observed[]` (afirmación + evidenceIds + cita), `unknown[]`, `provisional`, `closeReason`. |
| `src/data/catalog.um-udelar.v1.json` (nuevo) + `src/lib/agents/careers.ts` (nuevo) | Catálogo curado + `CatalogProvider`. |
| `src/lib/agents/catalog.ts` | `defaultProviders()` según `CATALOG_MODE` (`demo-um-udelar` = solo el catálogo curado). |
| `src/lib/agents/ranking.ts` | Puntaje v2 con umbral; 3–5; diversidad por área e institución. |
| `src/app/chat/chat.tsx` | Botón de cierre siempre visible, chips de opciones, progreso, texto de duración. |
| `src/app/resultado/result.tsx` | Devolución narrativa, % ocultos en la demo, ficha de carrera, botón oficial, fin de la demo, mentores ocultos con un flag. |

### D.3 Excluir de la demo (no borrar, solo no enlazar o apagar con un flag)

Mentores (A5) y consentimiento de mentores; voz en vivo (`api/live/*`, `live-voice.tsx`); feed de noticias y crons; grafo O\*NET y `onetCatalog`; servidor MCP público; `officialCatalog` (becas/convocatorias); importar CV/LinkedIn/GitHub; comparador; `/perfil/anterior`; PubMed; agente anterior `lib/agent/run.ts` (se mantiene porque `genai()` y `withRetry` se usan en otros lados).

---

## E. Estrategia del catálogo UM + Udelar

### E.1 Tamaño recomendado: 13 carreras

- **Por qué 13:** cubre las 6 áreas de interés con al menos 2 opciones cada una e incluye las dos instituciones. Permite elegir de 3 a 5 opciones con diversidad real.
- Es verificable a mano en 2–3 horas (unos 15 min por ficha). Más de 15 multiplica el mantenimiento sin mejorar la demo.

### E.2 Selección propuesta

Las URLs las vi hoy (17/10/2026) en los listados oficiales: el buscador `udelar.edu.uy/carreras` y la portada de `um.edu.uy`. Las áreas son una **etiqueta editorial del equipo, a revisar con un orientador**, no una medición.

| # | Institución | Carrera | URL oficial | Áreas (editorial) |
|---|---|---|---|---|
| 1 | Udelar | Ingeniería en Computación | https://udelar.edu.uy/carrera/ingenieria-en-computacion | I, R, C |
| 2 | Udelar | Doctor en Medicina | https://udelar.edu.uy/carrera/doctor-en-medicina | I, S |
| 3 | Udelar | Licenciatura en Psicología | https://udelar.edu.uy/carrera/licenciatura-en-psicologia | S, I |
| 4 | Udelar | Licenciatura en Diseño Industrial | https://udelar.edu.uy/carrera/licenciatura-en-diseno-industrial | A, R |
| 5 | Udelar | Licenciatura en Educación Física | https://udelar.edu.uy/carrera/licenciatura-en-educacion-fisica-0 | S, R |
| 6 | Udelar | Licenciatura en Lenguajes y Medios Audiovisuales | https://udelar.edu.uy/carrera/licenciatura-en-lenguajes-y-medios-audiovisuales | A |
| 7 | Udelar | Doctor en Ciencias Veterinarias | https://udelar.edu.uy/carrera/doctor-en-ciencias-veterinarias | R, I |
| 8 | UM | Ingeniería de Datos e Inteligencia Artificial | https://www.um.edu.uy/index%2Ephp/facultad-de-ingenieria/oferta-academica/grado/ingenieria-de-datos-e-inteligencia-artificial | I, C |
| 9 | UM | Licenciatura en Comunicación | https://www.um.edu.uy/facultad-de-comunicacion/oferta-academica/grado/licenciatura-en-comunicacion | A, E, S |
| 10 | UM | Dirección y Administración de Empresas | https://www.um.edu.uy/facultad-de-ciencias-empresariales-y-economia/oferta-academica/grado/direccion-y-administracion-de | E, C |
| 11 | UM | Contador Público | https://www.um.edu.uy/facultad-de-ciencias-empresariales-y-economia/oferta-academica/grado/contador-publico | C, E |
| 12 | UM | Abogacía | https://www.um.edu.uy/index%2Ephp/facultad-de-derecho/oferta-academica/grado/abogacia | E, S |
| 13 | UM | Magisterio | https://www.um.edu.uy/facultad-de-humanidades-y-educacion/oferta-academica/grado/magisterio | S, A |

**Notas de verificación:**

- **Udelar #1:** la ficha oficial muestra "Duración (meses): 60", "Créditos: 450", "Sede: Facultad de Ingeniería" y requisito de ingreso "Bachillerato Diversificado… opción Físico-Matemática". Así se ve un dato verificable.
- **UM #9:** la página dice "Duración de la carrera: 4 años". No muestra modalidad, horario, requisitos ni costo. **Esos campos quedan como desconocidos**, no se completan.
- **UM #10:** la URL termina en `…direccion-y-administracion-de` (parece truncada). Hay que abrirla y confirmar la canónica.
- **URLs de UM con `index%2Ephp/`:** confirmar la forma canónica sin ese segmento antes de cargarlas.
- **Los demás datos** (duración, créditos, sede) los tiene que copiar una persona desde cada ficha. **No los cargo yo ni un LLM.**
- **Gratuidad de Udelar:** cargarla solo si una página oficial lo dice y citarla. Si no, queda en "desconocido".

### E.3 Formato del registro (Zod en `src/lib/agents/careers.ts`)

```text
id                 "udelar-ing-computacion"
institution        "Udelar" | "UM"
title              nombre exacto de la página oficial
faculty            facultad o servicio (si figura)
type               "degree" | "technical"
official_url       URL de dominio udelar.edu.uy / um.edu.uy (validado por A3)
checked_at         "2026-10-17"  (fecha de consulta)
checked_by         iniciales de quien verificó
summary_plain      2–3 frases en llano redactadas por el equipo a partir de la página (sin datos nuevos)
areas              ["I","R"] + area_note: "etiqueta editorial, no medición"
activity_tags      ["programar","resolver problemas","construir"]   // para cruzar con intereses concretos
avoid_tags         ["trabajo rutinario de oficina"]                 // para cruzar con rechazos (opcional)
facts              [{ field:"duracion", value:"60 meses", source_url, checked_at }]  // solo lo que figura
unknowns           ["modalidad","horario","costo"]                  // lo que la página no dice
```

### E.4 Cómo se conecta con lo que ya existe

- `careersCatalog(): CatalogProvider` mapea cada registro a `Opportunity`:
  - `status: "unverified"` de entrada, para que **A3 decida**;
  - `source_url = official_url`, `verified_at = checked_at`;
  - `riasec` derivado de `areas` (1.0 la primaria, 0.6 las secundarias);
  - `tags = activity_tags`;
  - `country: "UY"`, `modality/schedule/cost: "unknown"` salvo que estén en `facts`.
- **A3 sin cambios:** `udelar.edu.uy` y `um.edu.uy` ya están en `OFFICIAL_DOMAINS`. Con `checked_at` de hace menos de un año el registro queda `verified`.
- **Recomendación:** bajar `STALE_DAYS` a 180 solo para este catálogo, o agregar un aviso "revalidar" a los 180 días.
- **Mantenimiento:**
  - `scripts/check-catalog.ts` (manual, no en CI) hace GET a cada URL y reporta 404, redirecciones y cambios de título;
  - una prueba Vitest **sin red** valida el esquema: URL de dominio oficial, `checked_at` presente, `summary_plain` ≤ 60 palabras y sin cifras que no estén en `facts`;
  - cada cambio del catálogo va en su propio PR con la fecha.

### E.5 Recomendación sin inventar compatibilidad (ranking v2)

```text
puntaje(carrera) =
    2 × (# áreas destacadas del perfil ∈ carrera.areas)        // topAreas(): regla de 2 evidencias
  + 1 × (# activity_tags que coinciden con intereses concretos) // N3 a favor, por palabras
  − 2 × (# avoid_tags/áreas que coinciden con rechazos N3.RECHAZO)
  + 0.5 si el área está confirmada por la persona

umbral: entra solo si hay ≥1 evidencia del perfil que la conecte (área destacada o tag concreto)
salida: ordenar; máximo 2 por área primaria; preferir ambas instituciones; devolver 3–5 si pasan el umbral,
        menos si no; 0 → mensaje honesto + ofrecer 2–3 preguntas más.
```

- **Nunca se muestra el puntaje ni un %.** La explicación se arma con la cita que conectó: "Aparece porque contaste '…', y esta carrera tiene mucho de entender cómo funcionan las cosas."
- "Qué podría no gustarte" sale de áreas de la carrera que en la charla aparecieron poco o en contra. Ya existe una versión en `explain()`.
- Es una **heurística de exploración, no una predicción**. La UI lo dice: "Opciones para investigar, no una recomendación definitiva."

---

## F. Plan de implementación para Kiro

**Formato sugerido:**

- crear `.kiro/specs/demo-um-udelar/` con `requirements.md` (secciones P0, C y E de este documento), `design.md` (secciones D y E) y `tasks.md` (esta lista);
- una rama y un PR por tarea (`<nombre>/<tema>`), `npm test` + `tsc` + `lint` antes de cada PR, y merge solo de martotrigo.

Casi todo cae en el área **"Agente y chat"**: conviene definir su dueño antes de empezar. No hace falta tocar archivos compartidos (`src/lib/profile.ts`, `supabase/schema.sql`, `package.json`).

### P0 — Conversación con salida garantizada (bloqueante)

| ID | Tarea | Archivos | Criterio de aceptación |
|---|---|---|---|
| P0-0 | Preparar el entorno de verificación | `package.json` (solo si hace falta un script `typegen`; avisar porque es compartido) | `npx tsc --noEmit` sin errores después de `next typegen`. Documentado en el README. |
| P0-1 | Simulador de personajes + pruebas de invariantes **en rojo documentado** | `tests/helpers.ts`, `tests/conversation-budget.test.ts` | Personajes de la tabla P0.1 + generador con semilla. T1–T7 escritas con `test.fails` (pasan en CI y documentan el bug). |
| P0-2 | Rúbrica v2 (casilleros, límites, presupuesto) | `src/knowledge/rubric.v2.json`, `src/lib/rubric.ts` | La v1 queda intacta; el Zod valida la v2; se puede elegir la versión; pruebas de esquema. |
| P0-3 | Estado nuevo de la sesión | `src/lib/engine/types.ts`, `turn.ts` (`newSession`) | Campos `questionsAsked`, `stall`, `llmFailures`, `closeReason`, `summariesDone`, `askedCount`; sesiones viejas siguen cargando con valores por defecto. |
| P0-4 | Planificador v2 | `src/lib/engine/planner.ts` | Reglas 1–6 de P0.3 y rompe-ciclos. **T1–T4 y T9 pasan sin `test.fails`.** |
| P0-5 | Cierre a pedido y resiliencia | `turn.ts`, `api/chat/route.ts`, `llm/provider.ts` | Regex de intención; `close` no llama al LLM (T5, T6); timeout de 12 s; peor caso por turno < 45 s (prueba con proveedor lento falso). |
| P0-6 | Entrevistador v2 | `prompts/interviewer.v2.ts`, `interviewer.ts` | Guías y plantillas para `OFFER_OPTIONS` / `MINI_SUMMARY`; acciones fijas sin LLM; las guardas siguen pasando. |
| P0-7 | UI del chat | `src/app/chat/chat.tsx` | Botón "Ver mi perfil" desde el turno 1; chips de opciones; "Pregunta N · ~8"; onboarding "5 a 8 minutos". Probado a mano en móvil y escritorio. |
| P0-8 | Devolución v2 | `engine/profile.ts` (`snapshot`), `app/resultado/result.tsx` | `observed[]` con evidenceIds, `unknown[]`, `provisional`; % ocultos en la demo; T7 pasa. |
| P0-9 | Adaptar los escenarios existentes | `tests/scenarios.test.ts`, `tests/engine.test.ts` | E1–E7 y los criterios del blueprint siguen verdes con la v2 (las expectativas de "resumen por nivel" se reescriben a "mini-resumen único"). |

### P1 — Catálogo y recomendaciones

| ID | Tarea | Archivos | Criterio de aceptación |
|---|---|---|---|
| P1-1 | Cargar el catálogo curado | `src/data/catalog.um-udelar.v1.json` | 13 registros verificados a mano con `checked_at` y `checked_by`; ningún dato que no figure en la página. |
| P1-2 | Esquema + proveedor | `src/lib/agents/careers.ts`, `catalog.ts` | Prueba sin red: esquema, dominios oficiales, fechas. Con `CATALOG_MODE=demo-um-udelar`, `defaultProviders()` devuelve solo este catálogo. |
| P1-3 | Ranking v2 | `src/lib/agents/ranking.ts`, `pathways.ts` | Umbral; 3–5; máximo 2 por área; nota honesta con 0–2; sin %; T8 pasa; las pruebas de A4 existentes se adaptan. |
| P1-4 | Ficha de carrera + fin de la demo | `app/resultado/result.tsx`, `lib/session.ts` (`pathDetails`) | Descripción, datos con fuente y fecha, desconocidos, "Ir a la página oficial ↗" (`rel="noopener noreferrer"`), pantalla de fin; mentores ocultos con `MENTORS_ENABLED=false`. |
| P1-5 | "Ninguna me convence" acotado | `pathways.ts` (`rejectAll`) | Suma como máximo 3 preguntas y vuelve a buscar; prueba. |
| P1-6 | Script de chequeo de URLs | `scripts/check-catalog.ts` | Reporta 404 y redirecciones; documentado en el README. |

### P2 — Validación y endurecimiento

| ID | Tarea | Criterio de aceptación |
|---|---|---|
| P2-1 | `scripts/eval-conversation.ts` con usuarios simulados por LLM (5×7 personajes) | Tabla de métricas: preguntas (mediana ≤ 9), segundos, casilleros, rutas. |
| P2-2 | Sacar de la navegación lo excluido (voz en vivo, `/perfil/anterior`, noticias si distraen) | Recorrido de la demo sin enlaces a lo excluido. Coordinar con el dueño de "Interfaz y pitch". |
| P2-3 | Límite de pedidos por sesión e IP en `/api/chat` y `/api/session` | 429 controlado; prueba. |
| P2-4 | Logs de latencia por llamada al LLM (`logEvent`, sin texto) | Se ve `ms` por turno en los logs de Vercel. |

---

## G. Primeras tres tareas (explicadas para alguien que está aprendiendo)

### 1) P0-1 · Reproducir el problema con pruebas, antes de arreglar nada

- **Qué es:** escribir "usuarios de mentira" que responden siempre igual (uno que dice "no sé" todo el tiempo, otro que rechaza todo, otro perfecto) y hacerlos conversar con el motor real dentro de `npm test`. Cada prueba afirma reglas como "nunca más de 12 preguntas" y "siempre termina".
- **Por qué primero:** si no podés **ver** el bug en una prueba, no podés saber si lo arreglaste. Hoy esas pruebas van a fallar, y eso está bien: es la prueba del problema.
- **Truco para no romper el CI:** Vitest tiene `test.fails(...)`, que "pasa" cuando la prueba falla. Así el PR se puede mergear y queda documentado. Cuando se arregle, se cambia `test.fails` por `test`.
- **Archivos:** `tests/helpers.ts` (ya tiene `start()` y `talk()`) y un archivo nuevo `tests/conversation-budget.test.ts`.
- **Listo cuando:** las 7 situaciones de la tabla P0.1 están escritas y el CI sigue verde.

### 2) P0-2 · Escribir las nuevas reglas como datos (rúbrica v2)

- **Qué es:** un JSON nuevo, `rubric.v2.json`, que dice "máximo 8 preguntas", "estos 3 casilleros son imprescindibles", "profundizar como máximo 1 vez" y similares.
- **Por qué así:** el proyecto separa el **criterio** (qué cuenta como suficiente) del **código** (cómo se aplica). AGENTS.md pide versionar el criterio: no se edita la v1, se publica una v2. Además, así el criterio lo puede revisar alguien que no programa.
- **Archivos:** `src/knowledge/rubric.v2.json` y `src/lib/rubric.ts` (agregar los campos nuevos al esquema Zod, que es el "validador" del JSON).
- **Listo cuando:** una prueba carga la v2 sin errores, la v1 sigue funcionando y queda escrito por qué cambiamos 30/40 por 8.

### 3) P0-4 (con P0-3) · El planificador nuevo con salida garantizada

- **Qué es:** reescribir la función `next()` de `planner.ts`, que decide qué hace la IA en cada turno. Primero se agregan al estado los contadores que necesita (P0-3): preguntas hechas, respuestas sin información seguidas, fallos del LLM.
- **Cómo pensarlo:** como una lista de reglas que se revisa **de arriba hacia abajo**: ¿pidió terminar? → cerrar. ¿Van 8 preguntas? → cerrar. ¿Ya tengo lo imprescindible? → ofrecer cerrar. ¿Respondió "no sé" tres veces? → cerrar con perfil provisional. Si no se cumple nada, preguntar lo que más falta. Como las primeras reglas siempre terminan, **es imposible quedar atrapado**.
- **Por qué es seguro:** `next()` es una función "pura": recibe el estado y devuelve una decisión, sin llamar al LLM. Se prueba rápido y sin internet.
- **Listo cuando:** las pruebas de la tarea 1 pasan **sin** `test.fails`, y el personaje "perfecto" cierra entre 5 y 7 preguntas.

---

## H. Riesgos y validaciones pendientes

### H.1 Problemas confirmados

| # | Problema | Evidencia |
|---|---|---|
| C1 | Límites 30/40 y mínimo de ~19 preguntas en el caso ideal | `rubric.v1.json`, Documento 2 R14, simulación |
| C2 | Ciclos con rechazo de resúmenes, respuestas vagas, trampa de nivel 0 y LLM caído (40 preguntas) | Simulación + `planner.ts`, `profile.ts` |
| C3 | `OFFER_CLOSE` inalcanzable con BRIEF/EVASIVE | Orden de ramas en `next()` + simulación |
| C4 | "Terminar" invoca al analizador antes de cerrar; botón solo desde el turno 4 | `turn.ts`, `session.ts` (`canClose`) |
| C5 | Peor caso de tiempo por turno (~100 s) por encima de `maxDuration` 60 | `provider.ts` (25 s × 4 intentos), `api/chat/route.ts` |
| C6 | `officialCatalog`: RIASEC copiado del usuario, `verified_at = now`, resumen generado por LLM | `official.ts` |
| C7 | Ranking sin umbral, máximo 3, diversidad por categoría con O\*NET de EE.UU. | `ranking.ts`, `catalog.ts` |
| C8 | Sin carreras de UM ni Udelar; catálogo DEMO sintético | `data/catalog.demo.json` |
| C9 | Voz en vivo con el agente y las reglas anteriores | `api/live/token/route.ts`, `lib/agent/live.ts` |
| C10 | `tsc` falla por `LayoutProps` sin tipos generados | Ejecución local |
| C11 | Sin límite de pedidos en `/api/chat` y `/api/session` (costo y abuso) | Búsqueda en `src/` sin resultados |

### H.2 Hipótesis que necesitan prueba

| # | Hipótesis | Cómo validarla |
|---|---|---|
| H1 | Qué ciclo causó las ~30 preguntas de la prueba anterior | Conteo de `action.type` en la sesión (sin leer textos) o la transcripción |
| H2 | Con Gemini real, el analizador clasifica en el nivel o casillero correcto | P2-1 (usuarios simulados por LLM) + revisión manual de 10 transcripciones |
| H3 | Un turno real tarda menos de ~8 s | P2-4, medir en un preview de Vercel |
| H4 | 5–7 preguntas alcanzan para un perfil percibido como útil | Encuesta existente (utilidad y claridad) con 5–10 personas del equipo o conocidos mayores de edad |
| H5 | Las etiquetas editoriales de áreas por carrera tienen validez aparente | Revisión de un orientador (ya está en los pendientes del README) |
| H6 | La conversación ayuda más que un cuestionario fijo | Es la hipótesis "E" del propio Documento 1; queda fuera de la demo |
| H7 | La duración por defecto de las funciones de Vercel alcanza para `/api/session/routes` | Deja de importar con el catálogo local |

### H.3 Antes de usar datos reales de jóvenes (no bloquea la demo con datos de prueba)

1. **Ley 18.331 y menores:** el consentimiento del adulto hoy es una casilla autodeclarada. `MIN_AGE=18` es la decisión prudente hasta tener revisión legal. **Para la demo: solo personas mayores de edad o datos inventados.**
2. **Proveedor del LLM:** el texto (enmascarado) va a la API de Gemini en plan gratuito. Hay que revisar los términos vigentes sobre uso de datos de servicios no pagos y revisión humana antes de usar conversaciones reales. **No lo verifiqué hoy.**
3. **Enmascarado por regex:** no detecta nombres sin "me llamo…" ni lugares descritos en lenguaje libre. Es una mitigación, no una garantía.
4. **Seguridad emocional:** el mensaje de seguridad y las líneas de ayuda tienen que reconfirmarse (ya está en los pendientes del README), además de la revisión profesional de 20 transcripciones (Documento 2).
5. **Sesión por cookie:** el id de la cookie es el único "secreto". Está bien para una demo; para un piloto hay que considerar expiración más corta y no reutilizar en equipos compartidos.
6. **Región y acceso a Supabase:** definir quién puede leer `vocational_sessions` durante un piloto. Hoy solo accede la service role desde el servidor (correcto).
7. **Límite de pedidos y costo** (C11).
8. **Secretos:** no encontré claves en el repo (`.env.example` solo trae nombres). La variable alternativa `keyvercel` conviene renombrarla a `GEMINI_API_KEY`.

---

## Fuentes consultadas

- Repositorio: `README.md`, `AGENTS.md`, `.kiro/steering/*`, `docs/blueprint-agentes.md`, `docs/1-base-conocimiento-cientifico.pdf`, `docs/2-especificacion-mvp-perfil-vocacional.pdf`, `src/**`, `tests/**`, `supabase/schema.sql`.
- Udelar, buscador de carreras: https://udelar.edu.uy/carreras · ficha de ejemplo: https://udelar.edu.uy/carrera/ingenieria-en-computacion
- Universidad de Montevideo, portada con carreras de grado: https://www.um.edu.uy/ · ficha de ejemplo: https://www.um.edu.uy/facultad-de-comunicacion/oferta-academica/grado/licenciatura-en-comunicacion
