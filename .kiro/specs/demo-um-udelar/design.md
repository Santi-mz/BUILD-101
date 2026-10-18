# Design Document — Demo Rumbo (Etapa 1 + Etapa 2 reducida)

## Overview

Se reutiliza la arquitectura existente: el LLM lee y redacta, y el código determinista decide. Hay cuatro cambios grandes:

1. **Entrevista compacta**:
   - rúbrica v2 con casilleros, tope de 8 y reglas de cierre;
   - planificador v2 puro;
   - banco de opciones que funciona sin LLM.
2. **Devolución v2**: el snapshot del perfil agrega `observed[]`, `unknown[]`, `provisional` y `closeReason`.
3. **Catálogo curado UM + Udelar** como único `CatalogProvider` en modo demo.
4. **Ranking v2** con umbral de relevancia, de 3 a 5 resultados y sin rellenar.

**Referencia:** `auditoria.md` (en esta carpeta) tiene el diagnóstico completo y la evidencia. Donde ese documento diga "12 preguntas" o "6–10", **manda esta spec: 8 como máximo y objetivo de 5 a 7**.

---

## Architecture

```
/chat  ──POST /api/chat {message?, optionId?, close?}──▶ runTurn (engine/turn.ts)
   1. enmascarar (pii.ts)                      [sin cambios]
   2. seguridad por reglas (safety.ts)         [sin cambios]
   3. ¿intención de cierre o close:true? ──▶ CLOSE inmediato, SIN LLM   [nuevo]
   4. ¿optionId? ──▶ evidencia del banco (sin LLM)                      [nuevo]
      si no ──▶ analizador LLM (timeout 12 s; si falla: stall++, llmFailures++)
   5. perfil (profile.ts)                      [sin cambios en el cálculo]
   6. planificador v2 (planner.ts)             [reescrito, puro]
   7. entrevistador: texto LLM o plantilla + opciones del banco   [ajustado]
   8. guardas (guards.ts)                      [sin cambios; también para opciones]

/resultado ── snapshot v2 ── "Ver carreras" ──POST /api/session/routes──▶
   A2 discover (careersCatalog) ─▶ A3 verify (sin cambios) ─▶ A4 rank v2 ─▶ 0–5 rutas
   elegir ruta ─▶ ficha (pathDetails + facts/unknowns) ─▶ "Ir a la página oficial" ─▶ fin de la demo
```

**Selección de versión:** `src/lib/rubric.ts` exporta la rúbrica activa según `RUBRIC_VERSION` (default `2` en esta rama). La v1 queda disponible para las pruebas viejas y para comparar.

---

## Components and Interfaces

### 1. `src/knowledge/rubric.v2.json` (nuevo, versión `2.0.0`)

Copia los niveles e indicadores de la v1 (el criterio científico no cambia) y agrega:

```json
{
  "version": "2.0.0",
  "limits": {
    "maxQuestions": 8,
    "targetQuestions": [5, 7],
    "offerCloseFrom": 4,
    "closeWhenSufficientFrom": 5,
    "stallToClose": 2,
    "maxDeepenPerIndicator": 1,
    "maxMiniSummaries": 1,
    "miniSummaryUntil": 5,
    "optionsDefault": [3, 6],
    "optionsAfterNoInfo": 8
  },
  "slots": [
    { "id": "E1", "kind": "essential",     "priority": 1, "indicators": ["N0.ESTADO", "N0.INFO", "N0.CONF_EXT", "N0.CONF_INT", "N0.MOTIV", "N0.CREENCIAS"], "doneWhen": "evidence_or_asked_once" },
    { "id": "E2", "kind": "essential",     "priority": 2, "indicators": ["N2.*", "N1.*", "N3.ACTIVIDAD", "N3.TEMA", "N3.FLOW", "N3.ROL"], "doneWhen": "two_positive_same_area" },
    { "id": "E3", "kind": "essential",     "priority": 3, "indicators": ["N4.VALOR"], "doneWhen": "one_value" },
    { "id": "C1", "kind": "complementary", "priority": 4, "indicators": ["N4.BARRERA"], "doneWhen": "evidence_or_none_answer" },
    { "id": "C2", "kind": "complementary", "priority": 5, "indicators": ["N3.RECHAZO"], "doneWhen": "evidence" },
    { "id": "C3", "kind": "complementary", "priority": 6, "indicators": ["N3.ACTIVIDAD"], "doneWhen": "one_concrete" }
  ]
}
```

- `rubric.ts`: se extiende el esquema Zod con `limits` (campos nuevos opcionales para no romper la v1) y `slots`.
- **Documentar en el PR:** esto se aparta del Documento 2 (R14: 30/40) y del Documento 1 (15–25 intercambios), por decisión del equipo para la demo.

### 2. `src/knowledge/options.v1.json` (nuevo)

Banco de opciones por casillero. Cada opción genera evidencia **DECLARED, `concrete: false`** (peso 1) al tocarla.

```json
{
  "version": "1.0.0",
  "slots": {
    "E1": [
      { "id": "e1_ni_idea",   "label": "Ni idea todavía",                   "evidence": [{ "indicatorId": "N0.ESTADO", "value": "sin opciones" }] },
      { "id": "e1_varias",    "label": "Dudo entre dos o tres cosas",       "evidence": [{ "indicatorId": "N0.ESTADO", "value": "varias opciones" }] },
      { "id": "e1_una",       "label": "Tengo una idea pero no estoy seguro","evidence": [{ "indicatorId": "N0.ESTADO", "value": "una preferida" }] },
      { "id": "e1_presion",   "label": "Mi familia espera algo de mí",      "evidence": [{ "indicatorId": "N0.CONF_EXT" }] },
      { "id": "e1_miedo",     "label": "Me da miedo equivocarme",           "evidence": [{ "indicatorId": "N0.CREENCIAS" }] },
      { "id": "e1_info",      "label": "No sé bien qué opciones hay",       "evidence": [{ "indicatorId": "N0.INFO" }] }
    ],
    "E2": [
      { "id": "e2_arreglar",  "label": "Arreglar o armar cosas con las manos", "evidence": [{ "indicatorId": "N2.R", "area": "R" }, { "indicatorId": "N1.COSAS", "axis": "COSAS" }] },
      { "id": "e2_entender",  "label": "Entender cómo funcionan las cosas",    "evidence": [{ "indicatorId": "N2.I", "area": "I" }, { "indicatorId": "N1.IDEAS", "axis": "IDEAS" }] },
      { "id": "e2_crear",     "label": "Crear: dibujar, música, video, escribir","evidence": [{ "indicatorId": "N2.A", "area": "A" }, { "indicatorId": "N1.IDEAS", "axis": "IDEAS" }] },
      { "id": "e2_ayudar",    "label": "Ayudar o explicarle algo a alguien",   "evidence": [{ "indicatorId": "N2.S", "area": "S" }, { "indicatorId": "N1.PERSONAS", "axis": "PERSONAS" }] },
      { "id": "e2_organizar", "label": "Organizar un evento o liderar un grupo","evidence": [{ "indicatorId": "N2.E", "area": "E" }, { "indicatorId": "N1.PERSONAS", "axis": "PERSONAS" }] },
      { "id": "e2_ordenar",   "label": "Ordenar datos, cuentas o planillas",   "evidence": [{ "indicatorId": "N2.C", "area": "C" }, { "indicatorId": "N1.DATOS", "axis": "DATOS" }] },
      { "id": "e2_deporte",   "label": "Hacer deporte o entrenar",             "evidence": [{ "indicatorId": "N2.R", "area": "R" }] },
      { "id": "e2_naturaleza","label": "Estar con animales o en la naturaleza","evidence": [{ "indicatorId": "N2.R", "area": "R" }, { "indicatorId": "N2.I", "area": "I" }] }
    ],
    "E3": [
      { "id": "e3_ayudar",    "label": "Que sirva para ayudar a otros", "evidence": [{ "indicatorId": "N4.VALOR", "value": "ayudar" }] },
      { "id": "e3_creatividad","label": "Poder crear cosas nuevas",     "evidence": [{ "indicatorId": "N4.VALOR", "value": "creatividad" }] },
      { "id": "e3_estabilidad","label": "Tener estabilidad",            "evidence": [{ "indicatorId": "N4.VALOR", "value": "estabilidad" }] },
      { "id": "e3_autonomia", "label": "Manejar mis tiempos",           "evidence": [{ "indicatorId": "N4.VALOR", "value": "autonomia" }] },
      { "id": "e3_aprender",  "label": "Aprender todo el tiempo",       "evidence": [{ "indicatorId": "N4.VALOR", "value": "aprendizaje" }] },
      { "id": "e3_ingresos",  "label": "Ganar bien",                    "evidence": [{ "indicatorId": "N4.VALOR", "value": "ingresos" }] },
      { "id": "e3_variedad",  "label": "Que no sea siempre lo mismo",   "evidence": [{ "indicatorId": "N4.VALOR", "value": "variedad" }] },
      { "id": "e3_ambiente",  "label": "Buen ambiente con la gente",    "evidence": [{ "indicatorId": "N4.VALOR", "value": "buen_ambiente" }] }
    ],
    "C1": [
      { "id": "c1_ninguna",   "label": "Ninguna en especial",               "evidence": [], "marksDone": true },
      { "id": "c1_interior",  "label": "Vivo en el interior",               "evidence": [{ "indicatorId": "N4.BARRERA", "value": "vive en el interior / no puede mudarse" }] },
      { "id": "c1_noche",     "label": "Solo puedo estudiar de noche",      "evidence": [{ "indicatorId": "N4.BARRERA", "value": "solo puede cursar de noche" }] },
      { "id": "c1_gratis",    "label": "Necesito que sea gratis o barato",  "evidence": [{ "indicatorId": "N4.BARRERA", "value": "necesita opciones gratuitas o de bajo costo" }] },
      { "id": "c1_trabajo",   "label": "Tengo que trabajar",                "evidence": [{ "indicatorId": "N4.BARRERA", "value": "tiene poco tiempo disponible" }] }
    ],
    "C2": [
      { "id": "c2_oficina",   "label": "Estar sentado todo el día en una oficina", "evidence": [{ "indicatorId": "N3.RECHAZO", "area": "C" }] },
      { "id": "c2_publico",   "label": "Hablar en público o vender",               "evidence": [{ "indicatorId": "N3.RECHAZO", "area": "E" }] },
      { "id": "c2_numeros",   "label": "Trabajar con muchos números",              "evidence": [{ "indicatorId": "N3.RECHAZO", "area": "C" }] },
      { "id": "c2_sangre",    "label": "Ver sangre o heridas",                     "evidence": [{ "indicatorId": "N3.RECHAZO", "value": "sangre" }] },
      { "id": "c2_manual",    "label": "Trabajo físico pesado",                    "evidence": [{ "indicatorId": "N3.RECHAZO", "area": "R" }] },
      { "id": "c2_cuidar",    "label": "Cuidar personas todo el día",              "evidence": [{ "indicatorId": "N3.RECHAZO", "area": "S" }] }
    ],
    "C3": [],
    "COMMON": [
      { "id": "none",         "label": "Ninguna de estas", "noInfo": true },
      { "id": "skip",         "label": "Prefiero no decir", "noInfo": true }
    ]
  }
}
```

**Reglas del banco:**

- **Las opciones de rechazo (C2) no generan áreas negativas fuertes.** Se registran como N3.RECHAZO con área, que el ranking usa para penalizar (`profile.ts` ya trata N3.RECHAZO aparte de los puntajes de área).
- **C3 no tiene opciones fijas:** es la profundización en texto libre ("contame una vez…"). Ahí la UI muestra solo `COMMON` y el campo de texto.
- **Las opciones `COMMON` se agregan siempre.** Tocarlas cuenta como respuesta sin información.
- **Cuántas se muestran:** con `optionsAfterNoInfo` se muestran hasta 8 del casillero, excluyendo las ya elegidas. En el caso normal, 3 a 6.
- **Prueba obligatoria:** todos los `label` pasan `check(label, "interview")` de `guards.ts`.

### 3. Estado de la sesión — `src/lib/engine/types.ts`

Campos nuevos en `SessionState`. Todos tienen default en `newSession()`, y una sesión vieja sin estos campos carga con defaults vía `withDefaults(s)` en `store.get`:

```ts
questionsAsked: number;           // mensajes del asistente con "?" en fase de entrevista
stall: number;                    // respuestas sin información consecutivas
llmFailures: number;              // fallos consecutivos del analizador
askedCount: Record<string, number>; // indicador o casillero -> veces preguntado (incluye deepen)
deepened: string[];               // indicadores ya profundizados
miniSummaryDone: boolean;
closeOffered: boolean;            // ya existe; se reutiliza
offerAccepted: boolean;           // eligió "una pregunta más"
extraAsked: boolean;              // ya se hizo esa pregunta extra
slotsAsked: string[];             // casilleros ya preguntados (E1 cuenta como cumplido al preguntarse)
closeReason: "user" | "budget" | "sufficient" | "offer_accepted" | "stalled" | "llm_failures" | null;
provisional: boolean;
lastOptions: { id: string; label: string }[] | null; // opciones mostradas en el último mensaje
```

Acciones nuevas en `ActionType`: `ASK_SLOT` (pregunta un casillero con opciones), `OFFER_OPTIONS` (después de una respuesta sin información, hasta 8 opciones) y `MINI_SUMMARY`. Se mantienen `GREETING`, `ASK_DEEPEN`, `OFFER_CLOSE`, `CLOSE` y `SAFETY`.

En `Action` se agrega `slot?: string` y `options?: {id,label}[]`.

### 4. Planificador v2 — `src/lib/engine/planner.ts`

Funciones puras nuevas (exportadas para las pruebas):

```ts
slotStatus(s): Record<"E1"|"E2"|"E3"|"C1"|"C2"|"C3", boolean>
essentialsMet(s): boolean        // E1 && E2 && E3
complementaryCount(s): number
isNoInfo(quality, evidenceAdded, analyzerFailed): boolean
nextSlot(s): SlotId | null       // primer imprescindible faltante y no preguntado 2 veces; luego complementarios
```

`next(s)` v2, en orden estricto:

```text
if status == SAFETY_STOP                      -> SAFETY
if userTurns == 0                             -> GREETING (slot E1, con opciones)
if s.closeRequested                           -> CLOSE(reason=user)
if questionsAsked >= 8                        -> CLOSE(reason=budget)
if offerAccepted && extraAsked                -> CLOSE(reason=offer_accepted)   // ya respondió la "una pregunta más"
if offerAccepted && !extraAsked               -> ASK_SLOT(nextSlot) y marcar extraAsked = true (en commit)
if essentialsMet && complementaryCount>=1 && questionsAsked >= 5 -> CLOSE(reason=sufficient)
if essentialsMet && questionsAsked >= 4 && !closeOffered          -> OFFER_CLOSE (botones: "Ver mi perfil" / "Una pregunta más")
if stall >= 2 && questionsAsked >= 4          -> CLOSE(reason=stalled, provisional)
if llmFailures >= 2 && !closeOffered          -> OFFER_CLOSE
if lastAnswerNoInfo                           -> OFFER_OPTIONS(slot = nextSlot distinto del último, hasta 8 opciones)
if lastAnswerRichNotConcrete && !deepened.includes(lastIndicator) && questionsAsked <= 5
                                              -> ASK_DEEPEN (cuenta para C3)
if !miniSummaryDone && questionsAsked in [3..5] && topAreas(evidence).length >= 1
                                              -> MINI_SUMMARY (botones Sí / Más o menos / No)
slot = nextSlot(s)
if slot == null                               -> CLOSE(reason=sufficient)
                                              -> ASK_SLOT(slot, 3–6 opciones)
```

**Invariantes (cubiertos por pruebas):**

- `questionsAsked` nunca supera 8.
- Ningún casillero se pregunta más de 2 veces (pregunta + `OFFER_OPTIONS`).
- No hay dos `ASK_DEEPEN` en toda la charla sobre el mismo indicador.
- `MINI_SUMMARY` aparece como máximo 1 vez.
- Si `lastAnswerNoInfo`, la acción siguiente nunca es `ASK_DEEPEN`.

**Detección de "sin información":** `answerQuality ∈ {EVASIVE, OFF_TOPIC}`, o `BRIEF` sin evidencia nueva, o fallo del analizador, o opción `noInfo`. Lista de frases (normalizadas sin tildes):

```
no se | nose | ni idea | depende | capaz | puede ser | que se yo | paso | nada | ninguna | no me interesa | no tengo idea | no
```

### 5. Turno — `src/lib/engine/turn.ts`

- Firma: `runTurn(provider, s, rawText, { forceClose?, optionId? })`.
- **Antes del analizador**, detectar el cierre:

  ```
  wantsClose = forceClose || /\b(ver (mi )?perfil|terminar|termin(emos|amos)|ya esta|basta|quiero (el|mi) resultado|cortemos|mostrame (lo que entendiste|el perfil))\b/
  ```

  Si se cumple → `closeSession(s, "user")` **sin llamar al provider**.
- Si viene `optionId` y existe en `s.lastOptions`:
  - se aplican las evidencias del banco con `applyAnalysis` (quote = label de la opción, `kind: "DECLARED"`, `concrete: false`);
  - **no se llama al analizador**;
  - si la opción es `noInfo` → `stall++`.
- Si no viene `optionId`: se llama al analizador. Si `fallback === true` → `stall++`, `llmFailures++`. Si no, `llmFailures = 0`, y `stall` se resetea si hubo evidencia nueva.
- Después del entrevistador: si el mensaje contiene "?", `questionsAsked++`. El tope también se chequea en `say()` como defensa en profundidad: si llegara a superar 8, se reemplaza por el cierre.
- `closeSession(s, reason)` fija `closeReason` y `provisional = !essentialsMet(s)`.

### 6. Entrevistador — `src/lib/engine/interviewer.ts` + `src/prompts/interviewer.v2.ts`

- El LLM redacta **solo el texto de la pregunta** (máximo 45 palabras, una sola "?"). Las opciones vienen del banco y se adjuntan en `action.options`.
- **Acciones sin LLM** (texto fijo con plantilla): `OFFER_CLOSE`, `CLOSE`, `MINI_SUMMARY` (plantilla con las áreas destacadas en lenguaje llano y una cita) y `OFFER_OPTIONS` ("Te dejo algunas opciones, tocá la que más se parezca:").
- Guía nueva en el prompt: "La persona va a ver opciones en botones debajo de tu pregunta; no las enumeres en el texto".
- Las plantillas de respaldo de `ASK_SLOT` salen de `exampleQuestions` del indicador principal del casillero.

### 7. API — `src/app/api/chat/route.ts`

- El esquema `Turn` agrega `optionId: z.string().max(40).optional()`.
- `publicView` (`src/lib/session.ts`) agrega: `questionsAsked`, `maxQuestions`, `options` (las de `lastOptions`), `provisional`, `closeReason`.
- `canClose` pasa a `true` siempre que `status === "ACTIVE"`.
- `/api/session/routes` agrega `export const maxDuration = 30`.

### 8. UI del chat — `src/app/chat/chat.tsx`

- **Chips de opciones** debajo del último mensaje de la IA. Al tocar uno se envía `{ message: label, optionId }`. El campo de texto sigue disponible ("O escribilo con tus palabras").
- **"Ver mi perfil ahora"** siempre visible mientras la sesión esté activa.
- **Progreso:** "Pregunta {questionsAsked} de 8 como máximo".
- **Onboarding:** reemplazar "Lleva entre 15 y 25 minutos" por "Son unos 5 minutos y como máximo 8 preguntas".
- **Botones especiales:**
  - en `OFFER_CLOSE`: "Ver mi perfil" (envía `close:true`) y "Una pregunta más" (envía `optionId: "one_more"`);
  - en `MINI_SUMMARY`: "Sí, me representa", "Más o menos" y "No, no es así".

### 9. Devolución v2 — `src/lib/engine/profile.ts` (`snapshot`) + `src/app/resultado/result.tsx`

`snapshot()` agrega, sin quitar campos:

```ts
observed: { text: string; evidenceIds: string[]; quote: string }[] // 2–4, desde topAreas + specifics, con texto llano (AREA_PLAIN)
unknown: string[]        // un texto por casillero no cumplido: "Todavía no sé qué te importa en un trabajo o estudio"
provisional: boolean
closeReason: string | null
```

En `result.tsx` (modo demo):

- se ocultan las barras de % y los ejes;
- se muestran "Lo que observé", "Lo que te importa", "Para tener en cuenta" y "Lo que todavía no sé";
- si `provisional`, se muestra el sello;
- se mantienen el panel de correcciones, "Descargar" y "Borrar".

Flag: `NEXT_PUBLIC_DEMO_MODE=true` oculta los % y los mentores.

### 10. Catálogo — `src/data/catalog.um-udelar.v1.json` + `src/lib/agents/careers.ts`

Esquema Zod (`careerSchema`):

```ts
{
  id: string,                       // "udelar-ing-computacion"
  institution: "Udelar" | "UM",
  title: string,
  faculty?: string,
  type: "degree" | "technical",
  official_url: string,             // https, host termina en udelar.edu.uy o um.edu.uy
  checked_at: string | null,        // "2026-10-18"; null = no se muestra
  checked_by: string | null,
  summary_plain: string,            // ≤ 60 palabras, sin cifras que no estén en facts
  areas: ("R"|"I"|"A"|"S"|"E"|"C")[], // etiqueta editorial (1–3), la primera es la principal
  activity_tags: string[],          // en minúscula, para cruzar con intereses y opciones
  avoid_tags?: string[],            // para cruzar con rechazos (áreas o palabras)
  facts: { field: "duracion"|"creditos"|"sede"|"requisitos"|"costo"|"titulo", value: string, source_url: string, checked_at: string }[],
  unknowns: string[]
}
```

`careersCatalog(): CatalogProvider` mapea cada registro con `checked_at` a `Opportunity`:

- `type`: el del registro; `category: "training"`; `provider: institution`; `country: "UY"`;
- `riasec`: área principal 1.0, secundarias 0.6;
- `tags`: `activity_tags`;
- `status: "unverified"`, para que A3 lo pase a `verified` por dominio y fecha;
- `source_url: official_url`, `verified_at: checked_at`;
- `modality / schedule / cost: "unknown"`, salvo que estén en `facts`;
- `requirements`: el fact `requisitos` o `null`.

Además, conservar `facts`, `summary_plain` y `unknowns` en un mapa por id para la ficha (`pathDetails`).

`catalog.ts` → `defaultProviders()`: si `process.env.CATALOG_MODE === "demo-um-udelar"` devuelve `[careersCatalog()]`; si no, el comportamiento actual.

### 11. Ranking v2 — `src/lib/agents/ranking.ts`

```text
top     = topAreas(evidence)              // regla de 2 evidencias (ya existe)
likes   = activity_tags que coinciden con: values/quotes de N3 a favor + labels de opciones elegidas
rejects = áreas/avoid_tags que coinciden con N3.RECHAZO

puntaje = 2 × |top ∩ areas| + 1 × |likes| − 2 × |rejects| + 0.5 × (área principal confirmada por la persona)
entra   = (|top ∩ areas| ≥ 1 || |likes| ≥ 1) && puntaje > 0
orden   = puntaje desc; máximo 2 por área principal; desempate: alternar institución
salida  = primeros 5; si hay < 3 → note honesta "Encontré N…; no voy a rellenar"; si 0 → note "Todavía no tengo suficiente…"
```

`explain()` se reutiliza:

- `why_this`: cita la evidencia que conectó, o la opción elegida.
- `potential_tradeoffs`: áreas de la carrera con poca o ninguna evidencia, más el aviso de duración si está en `facts`.

Se elimina el uso de `occupation` y de la diversidad por categoría **solo en modo demo** (las pruebas viejas de A4 siguen con el modo normal).

### 12. Ficha y fin de la demo — `result.tsx` + `pathDetails`

- `pathDetails(r)` suma `resumen` (`summary_plain`), `datos` (`facts` con fuente y fecha) y `desconocido` (`unknowns`).
- Botón "Ir a la página oficial ↗" (`<a target="_blank" rel="noopener noreferrer">`). Al hacer clic se marca `s.phase = "NEXT_STEP"` vía `POST /api/session/path { nextStep: "Abrió la página oficial" }`.
- La pantalla "Fin del recorrido" se muestra cuando `phase === "NEXT_STEP"`, con la encuesta (ya existe) y "Explorar otra carrera".
- Mentores: no se renderizan con `NEXT_PUBLIC_DEMO_MODE=true`.

---

## Data Models

- **No hay cambios en `supabase/schema.sql`.** Todo vive en `vocational_sessions.state` (jsonb).
- **Archivos nuevos:** `rubric.v2.json`, `options.v1.json` y `catalog.um-udelar.v1.json`.

---

## Error Handling

| Situación | Comportamiento |
|---|---|
| Analizador falla o tarda más de 12 s | El turno cuenta como sin información; el entrevistador usa plantilla; con 2 fallos seguidos, `OFFER_CLOSE`. |
| Entrevistador falla | Plantilla del casillero + opciones del banco. |
| `optionId` desconocido | Se trata como texto libre (`message`). |
| Catálogo sin registros válidos | La nota honesta dice que no hay sugerencias; no hay error 500. |
| Sesión vieja (sin campos nuevos) | `withDefaults()` completa los valores; si `userTurns >= 8`, cierra al próximo turno. |

---

## Testing Strategy

Archivos nuevos: `tests/conversation-budget.test.ts`, `tests/options.test.ts`, `tests/careers.test.ts` y `tests/ranking-v2.test.ts`.

- **Personajes** (en `tests/helpers.ts`): `rico`, `vago`, `rechaza`, `ignora`, `mixto`, `solo-botones`, `pide-perfil-temprano`; más el proveedor `failing` (siempre lanza error) y el proveedor `slow` (tarda 30 s).
- **Propiedad:** 200 conversaciones al azar con un PRNG de semilla fija (implementación local tipo mulberry32, sin dependencias nuevas), mezclando respuestas del banco, texto rico, "no sé" y pedidos de cierre.
- **Afirmaciones mínimas:**
  - T1: todas terminan `COMPLETED` con `questionsAsked <= 8`.
  - T2: ninguna transcripción tiene más de 8 mensajes del asistente con "?".
  - T3: con 10 "no sé" seguidos, ningún casillero se pregunta más de 2 veces y nunca hay `ASK_DEEPEN` después de una respuesta sin información.
  - T4: el personaje `rico` cierra con `questionsAsked` entre 5 y 7.
  - T5: con `close` en los turnos 1, 3 y 6 → `COMPLETED`; en el 1 y el 3, `provisional === true`.
  - T6: el proveedor `failing` cierra en ≤8; `close:true` llama 0 veces al provider (espía).
  - T7: todo `observed[].evidenceIds` existe en `s.evidence`; `unknown.length` es igual a la cantidad de casilleros no cumplidos.
  - T8: el personaje `rico` + catálogo → de 3 a 5 rutas `verified` con dominio oficial; el personaje `vago` → de 0 a 2 rutas y una nota honesta.
  - T9: rechazar el mini-resumen no produce otro `MINI_SUMMARY`.
  - T10: todos los `label` del banco pasan las guardas.
- Las pruebas existentes de v1 (`engine.test.ts`, `scenarios.test.ts`) se ejecutan con la rúbrica v1 explícita, o se adaptan cuando el comportamiento cambió a propósito (por ejemplo, "ofrece cerrar a los 30 turnos").
