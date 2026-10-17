import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import CareerMap from "@/components/career-map";
import ComparePaths from "@/components/compare-paths";
import OpportunitiesPanel from "@/components/opportunities-panel";
import SaveAccount from "@/components/save-account";
import { getFeed, isFresh } from "@/lib/feed";
import { getNode, matchProfile } from "@/lib/graph";
import { MAX_QUESTIONS, RIASEC_KEYS, RIASEC_LABELS, topThree, type ProfileData, type RiasecKey } from "@/lib/profile";
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

// Mismo botón principal y mismos títulos de sección que la landing.
const CTA_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-background shadow-sm transition hover:opacity-90";
const SECONDARY_CLASS =
  "inline-flex min-h-11 items-center rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium transition hover:border-accent";

const EMPTY_POINTS = [
  { title: "Tu código RIASEC", body: "Tus tres intereses más fuertes según el modelo de Holland, con el nivel de confianza de cada uno." },
  { title: "Por qué ese perfil", body: "Las frases tuyas en las que se basa, junto a estudios de PubMed relacionados." },
  { title: "Qué hacer después", body: "Carreras, cursos, pasantías y empleos reales en Uruguay, y un feed ordenado para vos." },
];

function SectionTitle({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="max-w-2xl">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</p>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {children && <p className="mt-1.5 text-sm text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}

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
      <div className="mx-auto max-w-3xl px-4 py-12 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Tu perfil vocacional</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Todavía no lo armamos</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Son unos minutos de charla con el agente: hasta {MAX_QUESTIONS} preguntas que se adaptan a lo que contás. Podés escribir, hablar o
            subir tu CV.
          </p>
          <Link href="/chat" className={`${CTA_CLASS} mt-7 text-base`}>
            Empezar mi orientación <span aria-hidden>→</span>
          </Link>
        </div>

        <h2 className="mt-12 text-center text-sm font-semibold uppercase tracking-widest text-muted">Qué vas a descubrir</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {EMPTY_POINTS.map((pt, i) => (
            <li key={pt.title} className="rounded-2xl border border-border bg-card p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft font-mono text-sm font-semibold text-accent">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold">{pt.title}</h3>
              <p className="mt-1 text-sm text-muted">{pt.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-medium">Los seis intereses que mide</p>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {RIASEC_KEYS.map((k) => (
              <li key={k} className="rounded-lg bg-accent-soft px-1 py-2 text-center">
                <div className="font-mono text-base font-semibold text-accent">{k}</div>
                <div className="truncate text-[11px] text-muted">{RIASEC_LABELS[k]}</div>
              </li>
            ))}
          </ul>
        </div>
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
    <div className="mx-auto max-w-4xl space-y-12 px-4 py-10 sm:space-y-16 sm:py-14">
      {user.is_anonymous && (
        <section className="rounded-3xl border border-accent/40 bg-accent-soft/50 p-5">
          <SaveAccount />
        </section>
      )}

      {/* Encabezado: código RIASEC */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-border bg-card">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-accent-soft opacity-70 blur-3xl" />
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${final ? "bg-accent text-background" : "bg-accent-soft text-accent"}`}>
              {final ? "Perfil completo" : "En construcción"}
            </span>
            <span className="text-muted">Modelo RIASEC de Holland</span>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10">
            <div>
              <h1 className="text-xs font-semibold uppercase tracking-widest text-muted">Tu código RIASEC</h1>
              <p className="mt-2 font-mono text-6xl font-semibold leading-none tracking-tight text-accent sm:text-7xl">
                <span aria-hidden>{top.join("")}</span>
                <span className="sr-only">{top.map((k) => RIASEC_LABELS[k]).join(", ")}</span>
              </p>
            </div>
            <div>
              <ol className="space-y-2">
                {top.map((k, i) => (
                  <li key={k} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono font-semibold ${i === 0 ? "bg-accent text-background" : "bg-accent-soft text-accent"}`}
                    >
                      {k}
                    </span>
                    <span className="text-sm">
                      <span className="font-medium">{RIASEC_LABELS[k]}</span>
                      <span className="text-muted"> · {i === 0 ? "tu interés principal" : `${i + 1}.º interés`}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">Las tres letras son tus intereses más fuertes, de mayor a menor.</p>
            </div>
          </div>

          <p className="mt-6 max-w-2xl border-t border-border pt-6 text-lg leading-relaxed">{p.summary}</p>

          {!final && (
            <div className="mt-6 flex gap-3 rounded-2xl border border-accent/30 bg-accent-soft/60 p-4 text-sm">
              <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent motion-safe:animate-pulse" />
              <div>
                <p className="font-medium">Tu perfil todavía se está armando</p>
                <p className="mt-0.5 text-muted">
                  Llevás {row?.question_count ?? 0} {row?.question_count === 1 ? "respuesta" : "respuestas"} de hasta {MAX_QUESTIONS}. Seguí la
                  charla para que el agente confirme tus intereses: estos resultados todavía pueden cambiar.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/chat" className={CTA_CLASS}>
              {final ? "Seguir charlando" : "Terminar mi perfil"} <span aria-hidden>→</span>
            </Link>
            <Link href="/#feed" className={SECONDARY_CLASS}>
              Ver mi feed
            </Link>
          </div>
        </div>
      </section>

      {/* Por qué: tipos principales con frases del usuario y evidencia */}
      <section>
        <SectionTitle eyebrow="Fundamentos" title="Por qué este perfil">
          Cada tipo sale de cosas que dijiste, y el agente lo contrastó con estudios científicos.
        </SectionTitle>
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
      <section>
        <SectionTitle eyebrow="Mapa de intereses" title="Tus seis intereses">
          La barra clara es el margen de duda: se achica a medida que el agente confirma cada interés.
        </SectionTitle>
        <div className="rounded-3xl border border-border bg-card p-6">
          <div className="space-y-3">
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
        </div>
      </section>

      {/* Recomendaciones */}
      {p.recommendations && p.recommendations.length > 0 && (
        <section>
          <SectionTitle eyebrow="Próximos pasos" title="Tus recomendaciones" />
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

      <OpportunitiesPanel initial={p.opportunities ?? []} />

      {p.graph_trail && p.graph_trail.length > 0 && <CareerMap ids={p.graph_trail} />}

      {options.length >= 2 && <ComparePaths options={options} />}

      {/* Oportunidades del feed */}
      {news.length > 0 && (
        <section>
          <SectionTitle
            eyebrow="Feed"
            title="Oportunidades para vos"
            action={
              <Link href="/#feed" className="inline-flex min-h-11 items-center text-sm font-medium text-accent">
                Ver todas <span aria-hidden>&nbsp;→</span>
              </Link>
            }
          >
            Noticias reales de esta semana, ordenadas por afinidad con tu perfil.
          </SectionTitle>
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
          <SectionTitle eyebrow="Ciencia" title="Evidencia científica">
            Estudios de PubMed que el agente consultó. Describen patrones generales, no validan tu perfil individual.
          </SectionTitle>
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
