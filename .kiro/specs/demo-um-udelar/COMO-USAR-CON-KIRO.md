# Cómo usar esta spec con Kiro (paso a paso)

## Qué hay en esta carpeta

| Archivo | Para qué sirve |
|---|---|
| `requirements.md` | **Qué** tiene que hacer la demo (incluye el tope de 8 preguntas y las opciones siempre). |
| `design.md` | **Cómo** se construye: archivos, funciones, reglas exactas del planificador, banco de opciones, catálogo y ranking. |
| `tasks.md` | La **lista de tareas** en orden. Kiro la muestra con botones "Start task". |
| `catalog.borrador.json` | Las 13 carreras de UM y Udelar con su URL oficial. **Lo completa una persona, no Kiro.** |
| `auditoria.md` | El diagnóstico completo, para consultar el porqué de cada decisión. |
| `../../steering/demo-presentacion.md` | Reglas que Kiro lee **siempre** (tope de 8, opciones, no inventar). |

## Antes de empezar (una vez)

1. Abrí la carpeta `BUILD-101` en Kiro.
2. En la terminal: `git checkout main` y `git pull origin main`.
3. Creá una rama para subir la spec: `git checkout -b santi/spec-demo`. Hacé commit de `.kiro/` y abrí un PR, así todo el equipo trabaja con el mismo plan.
4. Avisale al equipo que el steering `demo-presentacion.md` aplica para todos.

## Cómo pedir cada tarea

Para cada tarea:

1. Creá su rama (`git checkout main && git pull && git checkout -b santi/<tema>`).
2. Pegale a Kiro el mensaje de abajo, o abrí `tasks.md` y tocá **"Start task"** en esa tarea.
3. Cuando termine, revisá que haya corrido las pruebas.
4. Abrí el PR. Solo martotrigo mergea.

**No le pidas dos tareas juntas.**

---

### Tarea 1 — Verificación de tipos

```
Leé .kiro/specs/demo-um-udelar/ (requirements, design y tasks). Hacé SOLO la tarea 1 de tasks.md.
Objetivo: que `npx tsc --noEmit` no falle por `LayoutProps`. Probá `npx next typegen` antes de tsc.
Si agregás un script a package.json, decime antes porque es un archivo compartido.
Al final corré npm test, npx tsc --noEmit y npm run lint y mostrame la salida.
```

### Tarea 2 — Pruebas que reproducen el problema

```
Hacé SOLO la tarea 2 de .kiro/specs/demo-um-udelar/tasks.md.
Agregá a tests/helpers.ts los personajes (rico, vago, rechaza, ignora, mixto, solo-botones, pide-perfil-temprano),
los proveedores failing y slow, un PRNG con semilla fija y countQuestions(s).
Creá tests/conversation-budget.test.ts con T1–T7 y T9 de design.md (sección Testing Strategy), usando un tope de 8 preguntas.
Las que hoy fallen marcalas con test.fails para que el CI quede verde.
NO toques nada dentro de src/. Al final corré npm test, tsc y lint, y mostrame cuáles quedaron con test.fails y por qué.
```

### Tarea 3 — Rúbrica v2 y banco de opciones

```
Hacé SOLO la tarea 3 de tasks.md.
Creá src/knowledge/rubric.v2.json (copia de la v1 + limits y slots exactamente como design.md §1, con maxQuestions 8)
y src/knowledge/options.v1.json (exactamente como design.md §2).
Extendé el esquema Zod en src/lib/rubric.ts sin romper la v1 y exportá la rúbrica activa según RUBRIC_VERSION (default 2) y un loader del banco.
Creá tests/options.test.ts: esquema válido, todos los indicatorId existen, todos los label pasan check(label, "interview").
NO edites rubric.v1.json. Corré npm test, tsc y lint.
```

### Tarea 4 — Estado de la sesión

```
Hacé SOLO la tarea 4 de tasks.md: campos nuevos de design.md §3 en src/lib/engine/types.ts,
defaults en newSession() y una función withDefaults() que use store.get para sesiones viejas.
Corré npm test, tsc y lint.
```

### Tarea 5 — Planificador v2 (la más importante)

```
Hacé SOLO la tarea 5 de tasks.md.
Reescribí next() en src/lib/engine/planner.ts siguiendo EXACTAMENTE el orden de reglas de design.md §4:
tope duro de 8 preguntas, cierre por suficiencia desde la 5, oferta de cierre una sola vez desde la 4,
cierre provisional con 2 respuestas sin información seguidas, OFFER_OPTIONS con hasta 8 opciones después de un "no sé"
(y pasar a otro casillero), nunca ASK_DEEPEN después de una respuesta sin información, máximo 1 MINI_SUMMARY.
Debe seguir siendo una función pura. Dejá la versión anterior como nextV1.
Pasá a test normal (sacando test.fails) T1, T2, T3, T4 y T9. Corré npm test, tsc y lint.
```

### Tarea 6 — Turno: opciones, cierre a pedido y fallos del LLM

```
Hacé SOLO la tarea 6 de tasks.md (design.md §5 y §7).
En turn.ts: detectar intención de cierre ANTES del analizador y cerrar sin llamar al LLM; aceptar optionId y registrar
la evidencia del banco sin analizador; actualizar stall, llmFailures y questionsAsked; freno de seguridad en say()
para que nunca haya una novena pregunta; closeSession(s, reason) con provisional.
En provider.ts: timeout 12 s y un solo reintento por turno. En api/chat/route.ts: aceptar optionId.
Pasá a test normal T5 y T6. Corré npm test, tsc y lint.
```

### Tarea 7 — Entrevistador v2

```
Hacé SOLO la tarea 7 de tasks.md (design.md §6 y §7).
Prompt nuevo src/prompts/interviewer.v2.ts (máx. 45 palabras, no enumerar opciones).
Plantillas sin LLM para OFFER_CLOSE, CLOSE, MINI_SUMMARY y OFFER_OPTIONS.
Adjuntá action.options desde el banco (3–6 normalmente, hasta 8 después de una respuesta sin información, siempre con las COMMON)
y guardá s.lastOptions. Exponé en publicView: options, questionsAsked, maxQuestions, provisional, closeReason; canClose siempre true si está activa.
Corré npm test, tsc y lint.
```

### Tarea 8 — Pantalla del chat

```
Hacé SOLO la tarea 8 de tasks.md (design.md §8) en src/app/chat/chat.tsx:
chips de opciones que envían optionId, campo libre "O escribilo con tus palabras", "Pregunta N de 8 como máximo",
botón "Ver mi perfil ahora" desde la primera pregunta, botones especiales en OFFER_CLOSE y MINI_SUMMARY,
y en el onboarding "Son unos 5 minutos y como máximo 8 preguntas". Que se vea bien en celular.
Corré npm test, tsc y lint, y decime cómo probarlo con npm run dev.
```

### Tarea 9 — Devolución v2

```
Hacé SOLO la tarea 9 de tasks.md (design.md §9).
snapshot() suma observed, unknown, provisional y closeReason SIN cambiar ningún cálculo existente.
En result.tsx, con NEXT_PUBLIC_DEMO_MODE=true: ocultar % y ejes; mostrar "Lo que observé" (con su cita),
"Lo que te importa", "Para tener en cuenta", "Lo que todavía no sé" y el sello "Perfil provisional" si corresponde.
Pasá a test normal T7. Corré npm test, tsc y lint.
```

### Tarea 10 — Adaptar las pruebas viejas

```
Hacé SOLO la tarea 10 de tasks.md. Las pruebas de tests/engine.test.ts y tests/scenarios.test.ts que prueban
el comportamiento v1 (por ejemplo, "ofrece cerrar a los 30") corrélas con la rúbrica v1 explícita.
Adaptá E1–E7 a la v2 solo donde el cambio es intencional. Seguridad (E6), guardas, datos personales y espejo de género (E7)
tienen que pasar sin cambiar el criterio. Mostrame un resumen de qué cambiaste y por qué.
```

### Tarea 11 — Checkpoint

Esta la hacés vos.

1. Corré `npm test`: todo verde y sin `test.fails` en `conversation-budget.test.ts`.
2. Corré `npm run dev` y hacé 3 charlas en `/chat`:
   - una respondiendo bien;
   - una tocando "Ninguna de estas" todo el tiempo;
   - una pidiendo el perfil en la segunda pregunta.
3. Contá las preguntas: nunca más de 8.

### Tarea 12 — Proveedor del catálogo

```
Hacé SOLO la tarea 12 de tasks.md (design.md §10).
Creá src/lib/agents/careers.ts con careerSchema (Zod), el loader y careersCatalog().
En catalog.ts, con CATALOG_MODE=demo-um-udelar, defaultProviders() devuelve solo careersCatalog().
Creá tests/careers.test.ts SIN red (esquema, dominios udelar.edu.uy/um.edu.uy, checked_at null no se devuelve, summary_plain ≤ 60 palabras).
Para las pruebas usá un catálogo de ejemplo dentro del test, no inventes datos en src/data. Corré npm test, tsc y lint.
```

### Tarea 13 — Cargar el catálogo (la hace una persona)

1. Copiá `.kiro/specs/demo-um-udelar/catalog.borrador.json` a `src/data/catalog.um-udelar.v1.json`.
2. Para **cada** carrera, abrí `official_url` en el navegador y completá:
   - `summary_plain`: 2–3 frases con tus palabras sobre lo que dice la página.
   - `facts`: solo lo que la página dice textualmente (duración, créditos, sede…), con `source_url` y `checked_at`.
   - `unknowns`: lo que la página **no** dice.
   - `checked_at` (fecha de hoy) y `checked_by` (tus iniciales).
3. Borrá los campos `_pista` y corregí las URLs marcadas.

Si querés que Kiro te ayude solo con el formato:

```
Revisá src/data/catalog.um-udelar.v1.json contra careerSchema y decime qué campos faltan o tienen mal formato.
NO completes ni cambies summary_plain, facts ni unknowns: esos datos los carga una persona desde la página oficial.
```

### Tarea 14 — Ranking v2

```
Hacé SOLO la tarea 14 de tasks.md (design.md §11).
Agregá rankCareers() en ranking.ts y usala en researchPaths cuando CATALOG_MODE=demo-um-udelar:
umbral (al menos 1 evidencia que conecte), de 3 a 5 resultados, menos si no pasan, nunca rellenar, máximo 2 por área principal,
penalizar rechazos, sin porcentajes. Creá tests/ranking-v2.test.ts y pasá T8 a test normal. Corré npm test, tsc y lint.
```

### Tarea 15 — Ficha y fin de la demo

```
Hacé SOLO la tarea 15 de tasks.md (design.md §12).
pathDetails suma resumen, datos (facts) y desconocido. En result.tsx: ficha con datos, fuente y fecha;
"Consultalo en la página oficial" para lo desconocido; botón "Ir a la página oficial ↗" en pestaña nueva
(rel="noopener noreferrer") que registra el próximo paso; pantalla "Fin del recorrido de la demo" con encuesta
y "Explorar otra carrera"; mentores ocultos con NEXT_PUBLIC_DEMO_MODE=true. maxDuration = 30 en api/session/routes.
Corré npm test, tsc y lint.
```

### Tarea 16 — "Ninguna me convence"

```
Hacé SOLO la tarea 16 de tasks.md: rejectAll() reabre la entrevista con máximo 2 preguntas extra y vuelve a buscar. Agregá la prueba.
```

---

## Ensayo de la presentación (tarea 17)

**Variables en Vercel (preview):** `RUBRIC_VERSION=2`, `CATALOG_MODE=demo-um-udelar`, `NEXT_PUBLIC_DEMO_MODE=true`, más las claves que ya tienen. Para un plan B sin internet ni Gemini: `LLM_PROVIDER=mock`. Funciona igual porque las opciones no dependen del LLM.

**Guion sugerido** (unas 6 preguntas, unos 4 minutos). El orden exacto puede variar un poco, porque el planificador elige según lo que ya sabe:

1. Pregunta 1 (punto de partida) → tocar "Dudo entre dos o tres cosas".
2. Pregunta 2 (qué hacés por gusto) → escribir: "Me gusta entender cómo funcionan las cosas, el año pasado armé una compu con mi primo".
3. Pregunta 3 → tocar "Entender cómo funcionan las cosas".
4. Mini-resumen → "Sí, me representa".
5. Pregunta (qué te importa) → tocar "Aprender todo el tiempo".
6. Oferta de cierre → "Ver mi perfil".
7. Mostrar la devolución: "Lo que observé" con las citas y "Lo que todavía no sé".
8. "Ver carreras" → 3–5 tarjetas → elegir una → ficha → "Ir a la página oficial" → fin.

**Mostrá también, a propósito, que no se traba:** en otra pestaña, contestá "no sé" dos veces. Se ven las 8 opciones y la charla avanza o cierra con un perfil provisional.

**Checklist antes de presentar:**

- [ ] Ninguna charla de prueba pasó de 8 preguntas.
- [ ] El botón "Ver mi perfil ahora" se ve desde el principio.
- [ ] Las 13 URLs oficiales abren (o se sacaron las que no).
- [ ] No aparece ningún % ni la palabra DEMO en las carreras.
- [ ] El plan B con `LLM_PROVIDER=mock` probado.
- [ ] Nadie usa datos reales de menores en la demo.
