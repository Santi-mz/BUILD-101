import Link from "next/link";
import { Suspense } from "react";
import { getFeed } from "@/lib/feed";
import { RIASEC_LABELS, riasecCode, type ProfileData, type RiasecKey } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

const STEPS = [
  { n: "1", title: "Charlás con el agente", body: "Te hace preguntas que se adaptan a lo que respondés. Nada de cuestionarios de 100 ítems." },
  { n: "2", title: "Se respalda en ciencia", body: "Cada rasgo que infiere lo contrasta con estudios de psicología vocacional en PubMed." },
  { n: "3", title: "Te arma un perfil", body: "Tu código RIASEC, fortalezas y valores, con carreras, cursos, pasantías y empleos reales." },
];

async function loadViewer() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user
    ? ((await supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle()).data?.data as ProfileData | null)
    : null;
  return { supabase, user, profile };
}

async function HeroCta() {
  const { user, profile } = await loadViewer();
  return (
    <Link href={user ? "/chat" : "/login"} className="rounded-full bg-accent px-6 py-3 font-medium text-background">
      {profile?.riasec ? "Seguir mi charla" : "Armá tu perfil"}
    </Link>
  );
}

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4">
      <section className="py-14 sm:py-20">
        <p className="mb-3 text-sm font-medium text-accent">Orientación vocacional con IA y evidencia</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Descubrí qué estudiar o dónde trabajar, en una charla.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Rumbo es un agente que te entrevista, contrasta lo que dice con investigación científica y te devuelve un perfil con
          oportunidades reales en Uruguay. Y un feed de noticias que se ajusta a vos.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Suspense fallback={<span className="rounded-full bg-accent px-6 py-3 font-medium text-background">Armá tu perfil</span>}>
            <HeroCta />
          </Suspense>
          <a href="#feed" className="rounded-full border border-border px-6 py-3 font-medium">
            Ver noticias
          </a>
        </div>
      </section>

      <section className="grid gap-4 pb-14 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-mono text-sm text-accent">{s.n}</div>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <section className="mb-14 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">¿En qué se basa?</h2>
        <p className="mt-2 text-sm text-muted">
          Usamos el modelo de intereses vocacionales de Holland (RIASEC), uno de los más estudiados en psicología vocacional: seis
          tipos (Realista, Investigador, Artístico, Social, Emprendedor y Convencional) cuya combinación se relaciona con la
          satisfacción y el ajuste en distintas carreras. El agente busca en PubMed los estudios que respaldan cada inferencia y te
          los muestra en tu perfil. No es un diagnóstico clínico: es un punto de partida para decidir mejor.
        </p>
      </section>

      <Suspense fallback={<p id="feed" className="pb-20 text-sm text-muted">Cargando noticias…</p>}>
        <Feed />
      </Suspense>
    </div>
  );
}

async function Feed() {
  const { supabase, user, profile } = await loadViewer();
  const { items, personalized } = await getFeed(supabase, profile);
  const code = riasecCode(profile);
  return (
    <section id="feed" className="scroll-mt-20 pb-20">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Noticias</h2>
          <p className="text-sm text-muted">
            {personalized
              ? `Ordenadas para tu perfil ${code} · se actualizan todos los días`
              : "Empleo, pasantías, becas y estudios · se actualizan todos los días"}
          </p>
        </div>
        {!personalized && (
          <Link href={user ? "/chat" : "/login"} className="text-sm font-medium text-accent">
            Personalizalas con tu perfil →
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Todavía no hay noticias cargadas. Corré el cron <code className="font-mono">/api/cron/news</code> una vez.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((n) => {
            const top = (Object.entries(n.riasec) as [RiasecKey, number][]).sort((a, b) => b[1] - a[1])[0];
            return (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="group rounded-2xl border border-border bg-card p-5 transition hover:border-accent">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                  {n.category && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">{n.category}</span>}
                  {top && <span>{RIASEC_LABELS[top[0]]}</span>}
                  {personalized && n.match !== undefined && <span className="ml-auto font-mono">{n.match}% afinidad</span>}
                </div>
                <h3 className="font-medium leading-snug group-hover:text-accent">{n.title}</h3>
                {n.summary && <p className="mt-2 text-sm text-muted">{n.summary}</p>}
                <p className="mt-3 text-xs text-muted">
                  {n.source}
                  {n.published_at && ` · ${new Date(n.published_at).toLocaleDateString("es-UY", { day: "numeric", month: "short" })}`}
                </p>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
