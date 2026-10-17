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
| Agente y chat | `src/lib/agent/`, `src/lib/mcp/`, `src/app/api/chat/`, `src/app/api/mcp/`, `src/app/chat/` | (a definir) |
| Noticias y feed | `src/lib/news-sources.ts`, `src/lib/feed.ts`, `src/app/api/cron/` | (a definir) |
| Interfaz y pitch | `src/app/page.tsx`, `src/app/perfil/`, `src/app/login/`, `src/app/layout.tsx`, `src/app/globals.css` | (a definir) |
| **Compartido** | `src/lib/profile.ts`, `supabase/schema.sql`, `package.json`, `src/proxy.ts`, `src/lib/supabase/` | se cambia solo avisando |

- Un agente que trabaja para un área no edita archivos de otra área sin que el usuario lo pida explícitamente.
- Si hace falta cambiar el esquema de la base: editar `supabase/schema.sql` (idempotente, con `if not exists`) y avisar. martotrigo lo corre en el SQL Editor de Supabase.

## Secretos

- Nunca commitear `.env.local` ni claves. Para tener las variables: `vercel env pull` (si tenés acceso) o pedirlas por privado.
- Variables usadas: ver `.env.example`.

## Producto (no romper)

- La IA es esencial, no decorativa: el perfil lo arma el agente; las noticias las etiqueta Claude; el feed se ordena por el perfil. Nada de datos mockeados.
- Modelo: `claude-opus-5-5` vía `@anthropic-ai/sdk` (`anthropicClient()` en `src/lib/agent/run.ts`).
- La condición de parada del chat la decide el servidor (`shouldStop` en `src/lib/profile.ts`), no el modelo.
- Textos de la app en español rioplatense.
