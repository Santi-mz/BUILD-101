# Rumbo · BUILD-101

Orientación vocacional con IA. Un agente (Gemini, plan gratis de Google AI Studio) te entrevista con preguntas adaptativas, respalda cada inferencia con papers de PubMed vía un servidor MCP propio, arma tu perfil RIASEC y te recomienda carreras, cursos, pasantías, empleos y becas reales. El feed de noticias (ingestado y etiquetado por IA a diario) se ordena según tu perfil.

Proyecto del hackathon Build 101 (Montevideo, 17/10/2026). Producción: https://rumbo-liart.vercel.app

## Cómo trabajamos

Ramas por tarea y PR a `main`; solo martotrigo mergea. Áreas, dueños y reglas para Claude Code y Kiro en [AGENTS.md](AGENTS.md).

## Puesta en marcha

1. Creá un proyecto en [Supabase](https://supabase.com) y ejecutá `supabase/schema.sql` en el SQL Editor.
2. En Supabase > Authentication > URL Configuration, agregá `http://localhost:3000/auth/callback` (y la URL de Vercel) a Redirect URLs.
3. Copiá `.env.example` a `.env.local` y completá las claves.
4. `npm run dev` y abrí http://localhost:3000
5. Cargá noticias por primera vez:
   `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/news`

## Deploy

`vercel` (cargá las mismas variables de entorno en el proyecto). El cron de `vercel.json` corre una vez por día.

## Arquitectura

- `src/lib/agent/run.ts`: loop del agente (herramientas MCP + `offer_choices` + `web_search` con Google Search).
- `src/lib/mcp/server.ts`: servidor MCP (`search_pubmed`, `search_news`, `get_profile`, `update_profile`, `finalize_profile`). El chat lo usa en memoria; `/api/mcp` expone las herramientas públicas para cualquier cliente MCP.
- `src/app/api/chat/route.ts`: condición de parada (confianza ≥ 0.75 en las 6 dimensiones + top 3 estable 2 rondas, máximo 14 preguntas, o pedido del usuario).
- `src/app/api/cron/news/route.ts`: ingesta diaria + resumen y etiquetado RIASEC con Gemini.
- `src/lib/feed.ts`: ranking del feed por afinidad con el perfil.
