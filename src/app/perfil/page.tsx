import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import CareerMap from "@/components/career-map";
import ComparePaths from "@/components/compare-paths";
import SaveAccount from "@/components/save-account";
import { getFeed, isFresh } from "@/lib/feed";
import { getNode, matchProfile } from "@/lib/graph";
import { RIASEC_KEYS, RIASEC_LABELS, topThree, type ProfileData, type RiasecKey } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

const TYPE_LABEL = { carrera: "Carrera", curso: "Curso", pasantia: "Pasantía", empleo: "Empleo", beca: "Beca" };

// Qué significa cada tipo de Holland, en una línea.
const RIASEC_DESC: Record<RiasecKey, string> = {
  R: "Te gusta lo práctico: construir, arreglar, usar herramientas y ver resultados concretos.",
  I: "Te mueve entender cómo funcionan las cosas: investigar, analizar y resolver problemas.",
  A: "Necesitás crear y expresarte: diseñar, escribir, actuar o inventar algo propio.",
  S: "Te importa la gente: ayudar, enseñar, escuchar y acompañar a otros.",
  E: "Te gusta mover cosas: liderar, convencer, emprender y tomar decisiones.",
  C: "Te sale el orden: organizar, planificar, llevar datos y seguir un buen método.",
};

async function PerfilInner() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: row } = await supabase.from("profiles").select("data,status,question_count").eq("user_id", user.id).maybeSingle();
  const p = row?.data as ProfileData | null;

  if (!p?.riasec) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-sm font-medium text-accent">Tu perfil vocacional</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Todavía no lo armamos</h1>
        <p className="mt-3 text-muted">Son unos minutos de charla con el agente. Podés escribir, hablar o subir tu CV.</p>
        <Link href="/chat" className="mt-8 inline-block rounded-full bg-accent px-7 py-3 font-medium text-background">
          Empezar la charla
        </Link>
      </div>
    );
  }

  const final = row?.status === "final";
  const top = topThree(p);
  const scores = Object.fromEntries(RIASEC_KEYS.map((k) => [k, p.riasec[k].score]));
  const trailOcc = (p.graph_trail ?? []).filter((id) => id.startsWith("occ:"));
  const matches = matchProfile(scores, 8);
  const options = [
    ...trailOcc.map((id) => ({ id, name: getNode(id)?.name ?? id, match: matches.find((m) => m.id === id)?.match ?? 0 })),
    ...matches.filter((m) => !trailOcc.includes(m.id)).map((m) => ({ id: m.id, name: m.name, match: m.match })),
  ].slice(0, 10);
  const { items: news } = await getFeed(supabase, p, 4);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:py-14">
      {user.is_anonymous && (
        <section className="rounded-3xl border border-accent/40 bg-accent-soft/50 p-5">
          <SaveAccount />
        </section>
      )}

      {/* Encabezado: código RIASEC */}
      <section className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${final ? "bg-accent text-background" : "bg-accent-soft text-accent"}`}>
              {final ? "Perfil completo" : `En construcción · ${row?.question_count ?? 0} respuestas`}
            </span>
            <span className="text-muted">Modelo RIASEC de Holland</span>
          </div>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            {top.map((k, i) => (
              <div key={k} className={`rounded-2xl border border-border px-4 py-3 ${i === 0 ? "bg-accent text-background" : "bg-background"}`}>
                <div className="font-mono text-3xl font-semibold leading-none">{k}</div>
                <div className={`mt-1 text-xs ${i === 0 ? "text-background/80" : "text-muted"}`}>{RIASEC_LABELS[k]}</div>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed">{p.summary}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/chat" className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-background">
              {final ? "Seguir charlando" : "Terminar mi perfil"}
            </Link>
            <Link href="/#feed" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium">
              Ver mi feed
            </Link>
          </div>
        </div>
      </section>

      {/* Por qué: tipos principales con frases del usuario y evidencia */}
      <section>
        <h2 className="mb-1 text-xl font-semibold">Por qué este perfil</h2>
        <p className="mb-4 text-sm text-muted">Cada tipo sale de cosas que dijiste, y el agente lo contrastó con estudios científicos.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {top.map((k) => {
            const reasons = (p.reasons ?? []).filter((r) => r.type === k).slice(0, 2);
            return (
              <div key={k} className="rounded-3xl border border-border bg-card p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">
                    <span className="mr-1 font-mono text-accent">{k}</span> {RIASEC_LABELS[k]}
                  </h3>
                  <span className="font-mono text-sm text-muted">{Math.round(p.riasec[k].score * 100)}%</span>
                </div>
                <p className="mt-2 text-sm text-muted">{RIASEC_DESC[k]}</p>
                {reasons.map((r) => (
                  <blockquote key={r.quote} className="mt-3 border-l-2 border-accent pl-3 text-sm">
                    <p className="italic">“{r.quote}”</p>
                    <p className="mt-1 text-xs text-muted">{r.why}</p>
                  </blockquote>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* Los seis intereses */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="font-semibold">Tus seis intereses</h2>
        <p className="mt-1 text-xs text-muted">La barra clara es el margen de duda: se achica a medida que el agente confirma cada interés.</p>
        <div className="mt-5 space-y-3">
          {RIASEC_KEYS.map((k) => {
            const s = p.riasec[k].score;
            const doubt = (1 - p.riasec[k].confidence) * 0.3;
            return (
              <div key={k} className="grid grid-cols-[120px_1fr_44px] items-center gap-3 text-sm">
                <span className={top.includes(k) ? "font-medium" : "text-muted"}>{RIASEC_LABELS[k]}</span>
                <div className="relative h-3 overflow-hidden rounded-full bg-accent-soft">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent/25" style={{ width: `${Math.min(100, (s + doubt) * 100)}%` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${s * 100}%` }} />
                </div>
                <span className="text-right font-mono text-xs text-muted">{Math.round(s * 100)}</span>
              </div>
            );
          })}
        </div>
        {(p.strengths.length > 0 || p.values.length > 0) && (
          <div className="mt-6 flex flex-wrap gap-2">
            {p.strengths.map((s) => (
              <span key={s} className="rounded-full bg-accent-soft px-3 py-1 text-xs text-accent">
                {s}
              </span>
            ))}
            {p.values.map((s) => (
              <span key={s} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                {s}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Recomendaciones */}
      {p.recommendations && p.recommendations.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Tus recomendaciones</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {p.recommendations.map((r) => (
              <a
                key={r.title}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col rounded-3xl border border-border bg-card p-5 transition hover:border-accent"
              >
                <span className="w-fit rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">{TYPE_LABEL[r.type]}</span>
                <h3 className="mt-3 font-semibold leading-snug group-hover:text-accent">{r.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted">{r.why}</p>
                {r.url && <span className="mt-3 text-xs font-medium text-accent">Ver más ↗</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {p.graph_trail && p.graph_trail.length > 0 && <CareerMap ids={p.graph_trail} />}

      {options.length >= 2 && <ComparePaths options={options} />}

      {/* Oportunidades del feed */}
      {news.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold">Oportunidades para vos</h2>
              <p className="text-sm text-muted">Noticias reales de esta semana, ordenadas por afinidad con tu perfil.</p>
            </div>
            <Link href="/#feed" className="text-sm font-medium text-accent">
              Ver todas →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {news.map((n) => (
              <a key={n.id} href={n.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-border bg-card p-4 transition hover:border-accent">
                <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                  {isFresh(n.published_at) && <span className="rounded-full bg-accent px-2 py-0.5 font-medium text-background">Nueva</span>}
                  <span>{n.category}</span>
                  {n.match !== undefined && <span className="ml-auto font-mono">{n.match}%</span>}
                </div>
                <p className="text-sm font-medium leading-snug">{n.title}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Evidencia */}
      {p.evidence.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Evidencia científica</h2>
          <ul className="space-y-3 text-sm">
            {p.evidence.map((e) => (
              <li key={e.pmid} className="rounded-2xl border border-border bg-card p-4">
                <a href={`https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">
                  {e.title} <span className="font-mono text-xs text-muted">PMID {e.pmid} ↗</span>
                </a>
                <p className="mt-1 text-muted">{e.claim}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function Perfil() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-4xl animate-pulse space-y-6 px-4 py-14"><div className="h-56 rounded-3xl bg-accent-soft" /><div className="h-40 rounded-3xl bg-accent-soft/60" /></div>}>
      <PerfilInner />
    </Suspense>
  );
}
