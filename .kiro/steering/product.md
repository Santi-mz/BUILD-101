---
inclusion: always
---

# Producto: Conectate con tu futuro

Agente conversacional de exploración vocacional para jóvenes (Uruguay, español rioplatense).
Fuentes de verdad en `docs/`: `blueprint-agentes.md`, `1-base-conocimiento-cientifico.pdf` (criterio científico) y `2-especificacion-mvp-perfil-vocacional.pdf`.

Principios no negociables:
- El criterio de análisis es fijo y vive en `src/knowledge/rubric.v1.json` (derivado del Documento 1).
- Perfiles, no tipos. Nada entra al perfil sin evidencia; la persona confirma o corrige.
- Separar siempre: dicho (DECLARED), hipótesis (HYPOTHESIS), confirmado (CONFIRMED).
- El LLM solo analiza texto y redacta. Perfil, porcentajes, planificación y cierre son código puro y testeado.
- Tacto sin complacencia. Nunca diagnósticos, nunca capacidad intelectual, nunca carreras en la Parte 1.
- Seguridad primero: ante señales de riesgo se detiene la exploración y se ofrecen recursos.
- Privacidad: sin nombre, email, documento, liceo ni ubicación precisa (se enmascaran).
- Parte 2: A2 busca, A3 verifica, A4 elige hasta 3 rutas; DEMO nunca se presenta como real; A5 solo con ruta elegida y consentimiento.
