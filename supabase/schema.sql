-- Rumbo: esquema de Supabase. Pegalo en el SQL Editor del proyecto y ejecutalo una vez.

-- Perfil vocacional que el agente construye (uno por usuario).
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'final')),
  question_count int not null default 0,
  updated_at timestamptz not null default now()
);

-- Historial de la conversación con el agente, en formato de mensajes de la API de Claude.
create table if not exists public.conversations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Noticias reales ingeridas a diario por el cron y etiquetadas por la IA.
create table if not exists public.news (
  id bigint generated always as identity primary key,
  url text not null unique,
  title text not null,
  source text,
  summary text,
  category text,
  riasec jsonb not null default '{}'::jsonb,
  topics text[] not null default '{}',
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists news_published_idx on public.news (published_at desc);

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.news enable row level security;

-- Cada usuario lee y escribe solo lo suyo.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own conversation" on public.conversations;
create policy "own conversation" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Las noticias son públicas para leer; solo el cron (service role) escribe.
drop policy if exists "news readable" on public.news;
create policy "news readable" on public.news for select using (true);
