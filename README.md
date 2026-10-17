# Rumbo · Conectate con tu futuro · BUILD-101

> No elegimos tu futuro por vos. Te ayudamos a descubrir caminos, contrastarlos con información confiable y conversar con personas que los conocen.

Exploración vocacional conversacional para jóvenes de Uruguay (16 a 20 años aprox.). Una IA orientadora charla con una pregunta por turno, construye un perfil **revisable** (lo dicho, lo supuesto y lo confirmado van siempre separados) y, al cerrar, propone **hasta tres caminos para investigar**, cada uno con su fuente, lo que falta verificar y un próximo paso chico. El feed de noticias (ingestado y etiquetado por IA a diario) se ordena según el perfil de quien entra con cuenta.

Proyecto del hackathon Build 101 (Montevideo, 17/10/2026). Producción: https://rumbo-liart.vercel.app

Especificación en [`docs/`](docs/): blueprint de agentes, Documento 1 (base científica: es la fuente de verdad del criterio) y Documento 2 (especificación del MVP).

## Cómo trabajamos

Ramas por tarea y PR a `main`; solo martotrigo mergea. Áreas, dueños y reglas para Claude Code y Kiro en [AGENTS.md](AGENTS.md) y [`.kiro/steering/`](.kiro/steering/).

## Puesta en marcha

**Modo demo, sin claves (todo el recorrido funciona):**

```bash
npm ci
npm run dev            # http://localhost:3000/chat
```

Sin `GEMINI_API_KEY` la app usa el analizador por reglas y preguntas de plantilla; sin `SUPABASE_SERVICE_ROLE_KEY` guarda las sesiones en memoria (se pierden al reiniciar). En la charla aparece la etiqueta "Modo demo sin IA".

**Modo real:**

1. Creá un proyecto en [Supabase](https://supabase.com) y ejecutá `supabase/schema.sql` en el SQL Editor (es idempotente; agrega `vocational_sessions` y `audit_events`).
2. En Supabase > Authentication > URL Configuration, agregá `http://localhost:3000/auth/callback` (y la URL de Vercel) a Redirect URLs.
3. Copiá `.env.example` a `.env.local` y completá las claves (`GEMINI_API_KEY`, Supabase, `CRON_SECRET`).
4. `npm run dev`
5. Cargá noticias por primera vez: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/news`

**Pruebas:** `npm test` (63 pruebas: rúbrica, perfil, planificador, seguridad, guardas, datos personales, escenarios E1–E7 y criterios de aceptación del blueprint), `npx tsc --noEmit`, `npm run lint`.

## Deploy

`vercel` (cargá las mismas variables de entorno en el proyecto). Los crons de `vercel.json` corren una vez por día: noticias y borrado de sesiones vencidas (`RETENTION_DAYS`, 30 por defecto).

## Arquitectura

**El LLM lee y redacta; todo lo que decide es código determinista y testeado.**

### Parte 1 · Perfil (Documento 2)

Ciclo de un turno (`src/lib/engine/turn.ts`, orquestador A0):

1. Guardar el mensaje con datos personales enmascarados (`pii.ts`).
2. Prechequeo de riesgo por reglas (`safety.ts`) → si hay riesgo, mensaje de seguridad fijo y `SAFETY_STOP`.
3. **Analizador** (LLM 1, `analyzer.ts` + `src/prompts/analyzer.v1.ts`): convierte la respuesta en evidencias de la rúbrica. Salida JSON validada con Zod, 1 reintento, fallback sin evidencias.
4. **Perfil** (`profile.ts`, puro): aplica evidencias, confirmaciones y rechazos; pesos 3/2/1/0, porcentajes con fórmula fija, ejes de Prediger, perfil plano.
5. **Planificador** (`planner.ts`, puro): decide la próxima acción (profundizar, cambiar de ángulo, resumir el nivel, avanzar, volver atrás, examinar una creencia, cerrar).
6. **Entrevistador** (LLM 2, `interviewer.ts`): redacta el mensaje según la acción.
7. **Guardas** (`guards.ts`): máximo una pregunta, sin carreras, instituciones, mercado laboral, diagnósticos ni etiquetas; reintento y plantilla segura.

La rúbrica (`src/knowledge/rubric.v1.json`) tiene los indicadores de los niveles 0 a 4 (Gati, Prediger, Holland, intereses básicos, SCCT). Cada sesión guarda las versiones de rúbrica, prompts y modelo.

### Parte 2 · Caminos (blueprint)

`src/lib/agents/pathways.ts` (A0) despacha subagentes que devuelven datos tipados y nunca le hablan a la persona:

| Agente | Archivo | Qué hace |
|---|---|---|
| A2 Investigador | `opportunities.ts` + `catalog.ts` | Consulta los catálogos por categoría (formación, práctica, adyacente) en paralelo, con límites. |
| A3 Verificador | `verification.ts` | Etiqueta `verified` / `partial` / `stale` / `unverified` / `demo` por dominio oficial y fecha; descarta duplicados y textos con instrucciones embebidas. |
| A4 Selector | `ranking.ts` | Aplica restricciones duras (país, modalidad, horario, costo), ordena por evidencia, diversidad y calidad de fuente; hasta 3, nunca rellena, sin porcentajes. |
| A5 Conector humano | `mentors.ts` | Solo con ruta elegida + consentimiento (si no, 403). Consulta un directorio opt-in; en el MVP no hay mensajería real. |
| A6 Seguridad | `safety.ts`, `pii.ts`, `guards.ts`, validaciones de la API | Capa determinista transversal. |

Fuentes en el MVP: un **catálogo de demostración** (`src/data/catalog.demo.json`, 16 registros rotulados DEMO) y ocupaciones reales de **O\*NET** como "campo de trabajo de referencia" (estado parcial: son datos de EE.UU.). Los mentores (`src/data/mentors.demo.json`) son ficticios y no contactables.

Las tareas de los agentes quedan registradas con su estado y los eventos técnicos (`src/lib/events.ts`) se loguean sin texto de la persona.

### API

`POST/GET/DELETE /api/session` (crear con consentimiento y edad, ver, borrar), `POST /api/chat` (turno), `POST /api/session/evidence` ("no es así"), `POST /api/session/routes` (buscar rutas o "ninguna me convence"), `POST /api/session/path` (elegir, preguntar, próximo paso), `POST /api/consents`, `POST /api/session/mentors`, `POST /api/mentor-questions` (deshabilitado), `GET /api/session/export`, `POST /api/feedback`, `GET /api/cron/cleanup`.

### Lo que ya estaba y se mantiene

- Voz: dictado en vivo + transcripción con Gemini y respuestas en voz natural.
- Feed de noticias etiquetado por IA (`src/app/api/cron/news`, `src/lib/feed.ts`); al cerrar la charla, quien entró con cuenta recibe su perfil en `profiles` para ordenar el feed.
- Grafo de carreras O\*NET (`src/data/career-graph.json`, `scripts/build-graph.ts`) y servidor MCP público (`/api/mcp`).

This product includes information from the [O*NET 31.0 Database](https://www.onetcenter.org/database.html) by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA). Used under the [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license. O*NET® is a trademark of USDOL/ETA. Los nombres se tradujeron al español con IA.

## Limitaciones reales y pendientes antes de un piloto

- **No hay oferta educativa real verificada todavía.** Hay que cargar fuentes institucionales con URL y fecha de validación para que aparezcan rutas `verified`.
- **Mentores:** el directorio es ficticio; falta verificación de adultos, moderación y revisión de privacidad antes de habilitar preguntas reales.
- **Revisión profesional:** un psicólogo u orientador debe revisar la rúbrica, el mensaje de seguridad y unas 20 transcripciones. Las líneas de ayuda (MSP) hay que reconfirmarlas antes de publicar.
- **Edad y consentimiento:** `MIN_AGE` arranca en 18 (menores necesitan confirmar consentimiento de un adulto) hasta revisar la Ley 18.331 con un profesional.
- **Modo demo:** el analizador por reglas es aproximado; sirve para probar el flujo, no para orientar a nadie. Las sesiones en memoria no sirven en Vercel.
- La búsqueda de rutas corre dentro del pedido (con estados registrados), no en una cola aparte.
- Falta la corrida de escenarios con usuarios simulados por LLM (5 veces cada uno) y la comparación con el O\*NET Interest Profiler.
- Que la conversación ayude más que un cuestionario fijo es una hipótesis a validar.
