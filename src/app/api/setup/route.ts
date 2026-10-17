import pg from "pg";

// TEMPORAL: crea las tablas desde la red de Vercel. Borrar después de usarla.
const SQL = "-- Rumbo: esquema de Supabase. Pegalo en el SQL Editor del proyecto y ejecutalo una vez.\n\n-- Perfil vocacional que el agente construye (uno por usuario).\ncreate table if not exists public.profiles (\n  user_id uuid primary key references auth.users (id) on delete cascade,\n  data jsonb not null default '{}'::jsonb,\n  status text not null default 'in_progress' check (status in ('in_progress', 'final')),\n  question_count int not null default 0,\n  updated_at timestamptz not null default now()\n);\n\n-- Historial de la conversación con el agente, en formato de mensajes de la API de Claude.\ncreate table if not exists public.conversations (\n  user_id uuid primary key references auth.users (id) on delete cascade,\n  messages jsonb not null default '[]'::jsonb,\n  updated_at timestamptz not null default now()\n);\n\n-- Noticias reales ingeridas a diario por el cron y etiquetadas por la IA.\ncreate table if not exists public.news (\n  id bigint generated always as identity primary key,\n  url text not null unique,\n  title text not null,\n  source text,\n  summary text,\n  category text,\n  riasec jsonb not null default '{}'::jsonb,\n  topics text[] not null default '{}',\n  published_at timestamptz,\n  created_at timestamptz not null default now()\n);\ncreate index if not exists news_published_idx on public.news (published_at desc);\n\nalter table public.profiles enable row level security;\nalter table public.conversations enable row level security;\nalter table public.news enable row level security;\n\n-- Cada usuario lee y escribe solo lo suyo.\ndrop policy if exists \"own profile\" on public.profiles;\ncreate policy \"own profile\" on public.profiles\n  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);\n\ndrop policy if exists \"own conversation\" on public.conversations;\ncreate policy \"own conversation\" on public.conversations\n  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);\n\n-- Las noticias son públicas para leer; solo el cron (service role) escribe.\ndrop policy if exists \"news readable\" on public.news;\ncreate policy \"news readable\" on public.news for select using (true);\n";

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("No autorizado", { status: 401 });
  const url = (process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL!).replace(/[?&]sslmode=[^&]*/, "");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(SQL);
    const r = await client.query("select table_name from information_schema.tables where table_schema = 'public' order by 1");
    return Response.json({ tables: r.rows.map((x) => x.table_name) });
  } finally {
    await client.end();
  }
}
