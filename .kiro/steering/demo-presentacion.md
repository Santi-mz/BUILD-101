---
inclusion: always
---

# Demo para la presentación: reglas que Kiro no puede romper

La spec activa está en `.kiro/specs/demo-um-udelar/` (requirements, design y tasks). Leela antes de cualquier tarea.

1. **Máximo 8 preguntas de la IA por entrevista**, con un objetivo de 5 a 7. Ningún camino del código puede generar una novena. Si hay duda, cerrar.
2. **Siempre ofrecer opciones.** Cada pregunta trae de 3 a 6 opciones en botones más el texto libre. Después de una respuesta vacía o de "no sé", "depende" o "no me interesa", se ofrecen **hasta 8 opciones** y la charla **pasa a otro tema**. Nunca se insiste ni se pide "un ejemplo concreto" después de una respuesta sin información.
3. **Salida garantizada.** El perfil se puede pedir desde la primera pregunta, y pedirlo no llama al LLM. Un fallo de Gemini nunca bloquea la sesión.
4. **Cierre y perfil los decide código determinista** (`planner.ts`, `profile.ts`), nunca el modelo.
5. **Catálogo:** solo carreras de UM y Udelar de `src/data/catalog.um-udelar.v1.json`, verificadas a mano con URL oficial y fecha. Kiro no inventa ni completa datos de carreras (duración, costos, requisitos, descripciones).
6. **Recomendaciones:** de 3 a 5 si pasan el umbral, menos si no. Nunca rellenar y nunca mostrar porcentajes.
7. **Fuera de alcance:** mentores, comunidad, mensajería, voz en vivo, noticias, O\*NET, becas y convocatorias. No se borran: se ocultan.
8. **Una tarea de `tasks.md` por vez.** Una rama por tarea, solo los archivos que lista la tarea, y `npm test` + `npx tsc --noEmit` + `npm run lint` antes de terminar.
9. **No editar `src/knowledge/rubric.v1.json`.** El criterio nuevo va en `rubric.v2.json`.
