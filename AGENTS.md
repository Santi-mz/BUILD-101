<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Rumbo: reglas del equipo (para personas y agentes)

Somos tres trabajando en paralelo con Claude Code y Kiro. Estas reglas evitan que nos pisemos.

## Flujo de git

- Nunca commitear ni pushear directo a `main`. Cada tarea va en su rama: `<nombre>/<tema>`, por ejemplo `santi/feed-filtros`.
- Abrí un PR a `main`. Vercel crea una URL de preview por PR para probar. Solo **martotrigo** mergea a `main`, y cada merge deploya a producción.
- Antes de abrir el PR: `git pull origin main` (o rebase), `npx tsc --noEmit` y `npm run lint` sin errores.
- PRs chicos y frecuentes. Si un cambio toca archivos de otra área, avisá en el grupo antes.

## Áreas (cada una tiene un dueño)

| Área | Archivos | Dueño |
|---|---|---|
| Agente y chat | `src/lib/engine/`, `src/lib/agents/`, `src/lib/llm/`, `src/prompts/`, `src/knowledge/`, `src/lib/agent/`, `src/lib/mcp/`, `src/app/api/chat/`, `src/app/api/session/`, `src/app/api/mcp/`, `src/app/chat/`, `src/app/resultado/` | (a definir) |
| Noticias y feed | `src/lib/news-sources.ts`, `src/lib/feed.ts`, `src/app/api/cron/` | (a definir) |
| Interfaz y pitch | `src/app/page.tsx`, `src/app/perfil/`, `src/app/login/`, `src/app/layout.tsx`, `src/app/globals.css` | (a definir) |
| **Compartido** | `src/lib/profile.ts`, `supabase/schema.sql`, `package.json`, `src/proxy.ts`, `src/lib/supabase/` | se cambia solo avisando |

- Un agente que trabaja para un área no edita archivos de otra área sin que el usuario lo pida explícitamente.
- Si hace falta cambiar el esquema de la base: editar `supabase/schema.sql` (idempotente, con `if not exists`) y avisar. martotrigo lo corre en el SQL Editor de Supabase.

## Secretos

- Nunca commitear `.env.local` ni claves. Para tener las variables: `vercel env pull` (si tenés acceso) o pedirlas por privado.
- Variables usadas: ver `.env.example`.

## Producto (no romper)

- La IA es esencial, no decorativa: la IA analiza cada respuesta y redacta las preguntas; las noticias las etiqueta la IA; el feed se ordena por el perfil.
- Única excepción a "nada mockeado": el catálogo y los mentores de `src/data/*.demo.json` y el modo sin clave (`LLM_PROVIDER=mock`). Todo lo demo se rotula DEMO y nunca se muestra como disponible ni verificado.
- El criterio científico vive en `src/knowledge/rubric.v1.json` (fuente: Documento 1). Cambiarlo es publicar una versión nueva, no editar en el lugar.
- Modelo: Gemini (`gemini-flash-latest`, plan gratis) vía `@google/genai` (`genai()` y `MODEL` en `src/lib/agent/run.ts`). Variable: `GEMINI_API_KEY`.
- Perfil, porcentajes, próxima pregunta y cierre los decide código determinista (`src/lib/engine/profile.ts` y `planner.ts`), nunca el modelo. Antes de abrir el PR: `npm test`.
- Textos de la app en español rioplatense.
