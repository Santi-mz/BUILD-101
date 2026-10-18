# Implementation Plan — Demo Rumbo

Reglas para **cada** tarea:

- Una rama por tarea (`<nombre>/<tema>`), desde `main` actualizado (`git pull origin main`).
- No tocar archivos fuera de los que lista la tarea. Si hace falta, frenar y avisar.
- Antes de terminar: `npm test`, `npx tsc --noEmit` y `npm run lint`, sin errores.
- No inventar datos de carreras ni de instituciones. No commitear `.env.local`.
- Tope de la demo: **8 preguntas como máximo, siempre con opciones** (ver `requirements.md`).

---

## Fase P0 — Conversación corta con salida garantizada

- [ ] 1. Preparar la verificación de tipos
  - Correr `npx next typegen` (o `npm run build`) y confirmar que `npx tsc --noEmit` queda sin el error `LayoutProps`.
  - Si hace falta, agregar en `package.json` el script `"typecheck": "next typegen && tsc --noEmit"`. Es un archivo compartido: avisar al equipo.
  - Documentar el comando en el README, sección "Pruebas".
  - _Requirements: 11.2_

- [ ] 2. Simulador de personajes y pruebas de "no quedar atrapado" (en rojo documentado)
  - En `tests/helpers.ts`, agregar:
    - los personajes `rico`, `vago`, `rechaza`, `ignora`, `mixto`, `solo-botones` y `pide-perfil-temprano`;
    - los proveedores `failing` y `slow`;
    - un PRNG con semilla fija;
    - `countQuestions(s)`, que cuenta los mensajes del asistente con "?".
  - Crear `tests/conversation-budget.test.ts` con T1 a T7 y T9 de `design.md` (Testing Strategy).
  - Marcar con `test.fails(...)` las que hoy fallan, para que el CI quede verde y el bug quede documentado.
  - No tocar nada de `src/`.
  - _Requirements: 1.2, 1.4, 4.3, 5.1–5.5, 6.2, 7.2, 11.1_

- [ ] 3. Rúbrica v2 y banco de opciones (datos versionados)
  - Crear `src/knowledge/rubric.v2.json`: copia de la v1 más `limits` y `slots`, según `design.md` §1.
  - Crear `src/knowledge/options.v1.json` según `design.md` §2.
  - Extender el esquema en `src/lib/rubric.ts` (campos nuevos opcionales) y exportar la rúbrica activa según `RUBRIC_VERSION` (default 2), más un loader del banco de opciones.
  - Crear `tests/options.test.ts`: el esquema es válido, todos los `indicatorId` existen en la rúbrica y todos los `label` pasan `check(label, "interview")`.
  - **No editar `rubric.v1.json`.**
  - _Requirements: 2.4, 2.5, 2.6, 3.1, 11.3_

- [ ] 4. Campos nuevos en el estado de la sesión
  - En `src/lib/engine/types.ts`, agregar los campos de `design.md` §3 y las acciones `ASK_SLOT`, `OFFER_OPTIONS` y `MINI_SUMMARY`.
  - Inicializar los campos en `newSession()` (`turn.ts`) y agregar `withDefaults()` para sesiones viejas (usado en `store.get`, tanto en memoria como en Supabase).
  - _Requirements: 1.1, 3.4_

- [ ] 5. Planificador v2 con salida garantizada
  - Reescribir `next()` en `src/lib/engine/planner.ts` siguiendo **exactamente** el orden de `design.md` §4.
  - Exportar `slotStatus`, `essentialsMet`, `complementaryCount`, `isNoInfo` y `nextSlot`.
  - Mantener el planificador puro: sin LLM y sin mutar el estado.
  - Mantener la función v1 accesible como `nextV1` para las pruebas viejas.
  - Pasar a `test` normal las pruebas de la tarea 2 que dependen solo del planificador (T1–T4, T9).
  - _Requirements: 1.2, 1.3, 2.2, 2.3, 3.1–3.4, 5.1–5.5_

- [ ] 6. Turno: opciones sin LLM, cierre a pedido y resiliencia
  - En `src/lib/engine/turn.ts`:
    - detectar la intención de cierre **antes** del analizador;
    - aceptar `optionId` y aplicar la evidencia del banco sin llamar al analizador;
    - actualizar `stall`, `llmFailures` y `questionsAsked`;
    - poner el freno de seguridad en `say()`;
    - `closeSession(s, reason)` con `provisional`.
  - En `src/lib/llm/provider.ts`: timeout de 12 s y un solo reintento (`withRetry` no puede pasar el presupuesto del turno).
  - En `src/app/api/chat/route.ts`: aceptar `optionId`.
  - Pasar a `test` normal T5 y T6.
  - _Requirements: 2.5, 3.4, 4.2, 4.3, 4.4, 6.1–6.5_

- [ ] 7. Entrevistador v2 (texto corto y opciones adjuntas)
  - Crear `src/prompts/interviewer.v2.ts` (máximo 45 palabras, "no enumeres las opciones").
  - En `src/lib/engine/interviewer.ts`:
    - plantillas sin LLM para `OFFER_CLOSE`, `CLOSE`, `MINI_SUMMARY` y `OFFER_OPTIONS`;
    - adjuntar `action.options` desde el banco (3–6, u 8 después de una respuesta sin información, siempre con `COMMON`);
    - guardar `s.lastOptions`.
  - Exponer en `publicView` (`src/lib/session.ts`): `options`, `questionsAsked`, `maxQuestions`, `provisional`, `closeReason`; y `canClose: true` siempre que esté activa.
  - _Requirements: 1.5, 2.1, 2.2, 2.4, 2.7, 6.2_

- [ ] 8. UI del chat: chips, progreso y "Ver mi perfil ahora"
  - En `src/app/chat/chat.tsx`:
    - chips de opciones (envían `optionId`);
    - campo libre "O escribilo con tus palabras";
    - "Pregunta N de 8 como máximo";
    - botón "Ver mi perfil ahora" desde la primera pregunta;
    - botones especiales para `OFFER_CLOSE` y `MINI_SUMMARY`;
    - onboarding: "Son unos 5 minutos y como máximo 8 preguntas".
  - Probar a mano en celular (ancho 375 px) y en escritorio.
  - _Requirements: 1.5, 2.1, 4.1_

- [ ] 9. Devolución v2
  - `snapshot()` en `src/lib/engine/profile.ts` agrega `observed`, `unknown`, `provisional` y `closeReason` (`design.md` §9). No se cambia ningún cálculo existente.
  - En `src/app/resultado/result.tsx`, con `NEXT_PUBLIC_DEMO_MODE=true`:
    - ocultar % y ejes;
    - mostrar "Lo que observé", "Lo que te importa", "Para tener en cuenta" y "Lo que todavía no sé";
    - mostrar el sello "Perfil provisional" cuando corresponda.
  - Pasar a `test` normal T7.
  - _Requirements: 3.3, 7.1–7.6_

- [ ] 10. Adaptar las pruebas existentes
  - Correr `tests/engine.test.ts` y `tests/scenarios.test.ts` con la rúbrica v1 explícita donde prueban comportamiento v1 (por ejemplo, "ofrece cerrar a los 30").
  - Adaptar E1–E7 a la v2 donde el cambio es intencional.
  - Las pruebas de seguridad (E6), guardas, datos personales y espejo de género (E7) deben seguir pasando **sin cambios de criterio**.
  - _Requirements: 11.1, 11.2_

- [ ] 11. Checkpoint P0
  - Todas las pruebas de `conversation-budget.test.ts` pasan **sin** `test.fails`.
  - Correr a mano la demo en local con `LLM_PROVIDER=mock` y con Gemini: 3 charlas cortas, contando preguntas y tiempo. Anotar los resultados en el PR.
  - _Requirements: 1.3, 6.1_

## Fase P1 — Catálogo UM + Udelar y recomendaciones

- [ ] 12. Esquema y proveedor del catálogo
  - Crear `src/lib/agents/careers.ts` con `careerSchema` (Zod), el loader y `careersCatalog(): CatalogProvider` (`design.md` §10).
  - En `src/lib/agents/catalog.ts`: con `CATALOG_MODE=demo-um-udelar`, `defaultProviders()` devuelve solo `careersCatalog()`.
  - Crear `tests/careers.test.ts` **sin red**:
    - esquema válido;
    - todas las `official_url` con host `udelar.edu.uy` o `um.edu.uy`;
    - registros con `checked_at: null` no se devuelven;
    - `summary_plain` ≤ 60 palabras.
  - _Requirements: 8.1–8.6, 9.1_

- [ ] 13. Cargar el catálogo verificado (TAREA HUMANA; Kiro solo prepara el archivo)
  - Copiar `.kiro/specs/demo-um-udelar/catalog.borrador.json` a `src/data/catalog.um-udelar.v1.json`.
  - **Una persona** abre cada `official_url` y completa:
    - `summary_plain` con sus palabras;
    - los `facts` que figuran en la página;
    - `checked_at` (fecha del día) y `checked_by` (iniciales).
  - Kiro **no** completa `facts` ni `summary_plain`: no puede inventar datos.
  - _Requirements: 8.2, 8.3, 8.5_

- [ ] 14. Ranking v2 (3 a 5, con umbral y sin rellenar)
  - En `src/lib/agents/ranking.ts`, agregar `rankCareers()` según `design.md` §11. Usarla desde `researchPaths` (`pathways.ts`) cuando `CATALOG_MODE=demo-um-udelar`.
  - Crear `tests/ranking-v2.test.ts`:
    - personaje `rico` → 3–5 rutas `verified`;
    - personaje `vago` → 0–2 rutas y nota honesta;
    - máximo 2 por área principal;
    - un rechazo baja la carrera relacionada;
    - nunca aparecen % en los textos.
  - Pasar a `test` normal T8.
  - _Requirements: 9.2–9.7_

- [ ] 15. Ficha de carrera, enlace oficial y fin de la demo
  - `pathDetails()` en `pathways.ts` suma `resumen`, `datos` (`facts`) y `desconocido`.
  - En `result.tsx`:
    - ficha con datos, fuente y fecha;
    - "Consultalo en la página oficial";
    - botón "Ir a la página oficial ↗" (nueva pestaña) que registra el próximo paso;
    - pantalla "Fin del recorrido de la demo" con la encuesta y "Explorar otra carrera";
    - mentores ocultos con `NEXT_PUBLIC_DEMO_MODE=true`.
  - Agregar `export const maxDuration = 30` en `src/app/api/session/routes/route.ts`.
  - _Requirements: 10.1–10.4_

- [ ] 16. "Ninguna me convence" acotado
  - `rejectAll()` en `pathways.ts`: reabre la entrevista con un máximo de 2 preguntas extra (respetando el tope total de 8 + 2) y vuelve a buscar.
  - Agregar una prueba.
  - _Requirements: 9.4_

- [ ] 17. Checkpoint P1 y ensayo de la presentación
  - Recorrido completo en el preview de Vercel con `CATALOG_MODE=demo-um-udelar`, `NEXT_PUBLIC_DEMO_MODE=true` y `RUBRIC_VERSION=2`.
  - Seguir el guion de `COMO-USAR-CON-KIRO.md` (sección "Ensayo").
  - Medir: preguntas, minutos hasta el perfil, rutas mostradas y si el enlace oficial abre.
  - _Requirements: 1.3, 9.3, 10.3_

## Fase P2 — Opcional si sobra tiempo

- [ ]* 18. Script `scripts/check-catalog.ts`: GET a cada `official_url`, reporta 404, redirecciones y título de la página. Manual, no en CI.
  - _Requirements: 8.2_
- [ ]* 19. Script `scripts/eval-conversation.ts`: Gemini como usuario simulado, 5 corridas por personaje, tabla de preguntas, segundos, casilleros y rutas. Manual, no en CI.
  - _Requirements: 11.1_
- [ ]* 20. Sacar de la navegación lo excluido (voz en vivo, `/perfil/anterior`). Coordinar con el dueño de "Interfaz y pitch".
  - _Requirements: 10.4_
- [ ]* 21. Límite de pedidos por sesión e IP en `/api/chat` y `/api/session` (429 controlado).
  - _Requirements: 6.1_
