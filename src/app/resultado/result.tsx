"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { call, type View } from "@/components/api-client";
import { Panel } from "@/app/chat/chat";
import { RESOURCES, realLifeActions } from "@/lib/exploration";
import type { Area } from "@/lib/rubric";
import type { Filters, Route } from "@/lib/engine/types";

const AREAS: Area[] = ["R", "I", "A", "S", "E", "C"];
const TYPE_LABEL: Record<string, string> = {
  degree: "Carrera",
  technical: "Tecnicatura o formación técnica",
  course: "Curso",
  internship: "Pasantía",
  exchange: "Intercambio",
  experience: "Experiencia formativa",
  occupation: "Campo de trabajo (referencia)",
};
const STATUS_BADGE: Record<string, { text: string; cls: string }> = {
  demo: { text: "DEMO · ejemplo, no disponible", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  partial: { text: "Fuente parcial", cls: "bg-accent-soft text-accent" },
  verified: { text: "Fuente verificada", cls: "bg-accent text-background" },
};

export default function Result() {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    call("/api/session").then((r) => {
      if (r.view) setView(r.view);
      setLoading(false);
    });
  }, []);

  const act = async (label: string, path: string, body: unknown, method?: string) => {
    setBusy(label);
    setError("");
    const r = await call(path, { body, method });
    setBusy(null);
    if (r.view) setView(r.view);
    if (r.error) setError(r.error);
    return r;
  };

  if (loading) return <p className="p-10 text-center text-sm text-muted">Cargando…</p>;
  if (!view)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Todavía no charlamos</h1>
        <p className="mt-2 text-muted">Arrancá una charla y acá vas a ver lo que entendí.</p>
        <Link href="/chat" className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-medium text-background">Empezar</Link>
      </div>
    );

  const p = view.profile;
  const done = view.status === "COMPLETED";
  const actions = realLifeActions(p.top as Area[], p.flat);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <section>
        <p className="text-sm text-muted">{done ? "Tu devolución" : "Exploración en curso"}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Esto entendí hasta ahora</h1>
        <p className="mt-3 text-muted">
          {p.top.length
            ? `En lo que me contaste aparece sobre todo ${p.top.map((a) => p.riasec[a].label.toLowerCase()).join(", ")}. `
            : "Todavía no se destaca un área en particular, y eso no es un problema. "}
          Vos tenés la última palabra: corregí lo que no te represente.
        </p>
        {!done && (
          <Link href="/chat" className="mt-4 inline-block rounded-full border border-accent px-5 py-2 text-sm font-medium text-accent">
            Volver a la charla
          </Link>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">Tus intereses</h2>
        {p.show ? (
          <>
            <p className="mt-1 text-sm text-muted">Peso de cada área en lo que charlamos · confianza {p.confidence}</p>
            <div className="mt-4 space-y-3">
              {AREAS.map((k) => (
                <div key={k} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 text-sm">
                  <span>{p.riasec[k].label}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-accent-soft">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${p.riasec[k].pct}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs text-muted">{p.riasec[k].pct}%</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Todavía no hay datos suficientes para mostrar porcentajes. Hacen falta más experiencias concretas.</p>
        )}
        <p className="mt-4 rounded-xl bg-accent-soft p-3 text-xs text-accent">{p.disclaimer}</p>
        {(p.axes.personasVsCosas !== null || p.axes.ideasVsDatos !== null) && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Axis left="Cosas" right="Personas" value={p.axes.personasVsCosas} />
            <Axis left="Datos" right="Ideas" value={p.axes.ideasVsDatos} />
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="Intereses concretos" empty="Todavía ninguno con un ejemplo.">
          {p.specifics.map((x) => <li key={x.id}>“{x.quote}”</li>)}
        </Card>
        <Card title="Lo que te importa" empty="Todavía no hablamos de esto.">
          {(p.values.length ? p.values : p.valuesMentioned).map((v) => <li key={v.id}>{v.label}{p.values.length ? "" : " (mencionado)"}</li>)}
        </Card>
        <Card title="Para tener en cuenta" empty="Nada en particular.">
          {[...p.context.barreras, ...p.context.apoyos].map((x) => <li key={x}>{x}</li>)}
        </Card>
        <Card title="Preguntas abiertas" empty="Ninguna por ahora.">
          {p.openQuestions.map((q) => <li key={q}>{q}</li>)}
        </Card>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">Para explorar en la vida real</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm">{actions.map((a) => <li key={a}>{a}</li>)}</ol>
        <h3 className="mt-5 text-sm font-semibold">Recursos</h3>
        <ul className="mt-2 list-inside list-disc text-sm text-muted">{RESOURCES.map((r) => <li key={r}>{r}</li>)}</ul>
      </section>

      <details className="rounded-2xl border border-border bg-card p-6">
        <summary className="cursor-pointer font-semibold">Ver y corregir todo lo que anoté ({view.panel.length})</summary>
        <div className="mt-4">
          <Panel view={view} onCorrect={(id, status) => act("evidence", "/api/session/evidence", { id, status })} />
        </div>
      </details>

      {done && <Paths view={view} busy={busy} act={act} />}

      {error && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      {done && !view.feedbackSent && <Survey act={act} />}

      <section className="flex flex-wrap gap-3 border-t border-border pt-6">
        <a href="/api/session/export" className="rounded-full border border-border px-5 py-2.5 text-sm font-medium">Descargar mi resumen</a>
        <button
          onClick={async () => {
            if (!window.confirm("¿Borrar toda tu charla y tu perfil? No se puede deshacer.")) return;
            await fetch("/api/session", { method: "DELETE" });
            router.push("/");
            router.refresh();
          }}
          className="rounded-full border border-red-300 px-5 py-2.5 text-sm font-medium text-red-700 dark:text-red-300"
        >
          Borrar mis datos
        </button>
        <span className="self-center text-xs text-muted">Se borra solo el {new Date(view.expiresAt).toLocaleDateString("es-UY")}.</span>
      </section>
    </div>
  );
}

type Act = (label: string, path: string, body: unknown, method?: string) => Promise<{ view?: View; error?: string }>;

function Paths({ view, busy, act }: { view: View; busy: string | null; act: Act }) {
  const router = useRouter();
  const [filters, setFilters] = useState<Filters>(view.filters as Filters);
  const rec = view.recommendation;
  // Apenas termina la charla se buscan los caminos con las condiciones que contó (después se pueden cambiar).
  const auto = useRef(false);
  useEffect(() => {
    if (rec || auto.current) return;
    auto.current = true;
    act("research", "/api/session/routes", { action: "research", filters: view.filters });
  }, [rec, act, view.filters]);
  const selected = view.selectedPath;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Parte 2</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Caminos para investigar</h2>
        <p className="mt-2 text-sm text-muted">No elegimos tu futuro por vos. Te mostramos hasta tres caminos distintos, por qué aparecen y qué falta verificar.</p>
      </div>

      {!rec && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold">Antes de buscar, confirmá tus condiciones</h3>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <Select label="Modalidad" value={filters.modality} onChange={(v) => set("modality", v as Filters["modality"])} options={[["cualquiera", "Cualquiera"], ["presencial", "Presencial"], ["distancia", "A distancia"]]} />
            <Select label="Horario" value={filters.schedule} onChange={(v) => set("schedule", v as Filters["schedule"])} options={[["cualquiera", "Cualquiera"], ["nocturno", "Nocturno"]]} />
            <Select label="Costo" value={filters.cost} onChange={(v) => set("cost", v as Filters["cost"])} options={[["cualquiera", "Cualquiera"], ["gratuito", "Gratuito"]]} />
          </div>
          <p className="mt-2 text-xs text-muted">País: Uruguay. Las condiciones que contaste en la charla ya vienen marcadas.</p>
          <button
            disabled={busy !== null}
            onClick={() => act("research", "/api/session/routes", { action: "research", filters })}
            className="mt-4 rounded-full bg-accent px-6 py-2.5 font-medium text-background disabled:opacity-60"
          >
            {busy === "research" ? "Buscando, verificando y eligiendo…" : "Mostrame caminos para investigar"}
          </button>
        </div>
      )}

      {view.tasks.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Qué hicieron los agentes</summary>
          <ul className="mt-2 space-y-1 font-mono">
            {view.tasks.map((t) => (
              <li key={t.taskId}>
                {t.agent} · {t.type} · {t.status}
                {t.summary ? ` · ${t.summary}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      {rec && (
        <>
          <p className="text-sm text-muted">{rec.note}</p>
          <div className="space-y-4">
            {rec.routes.map((r) => (
              <RouteCard key={r.path_id} r={r} selected={selected?.route.path_id === r.path_id} busy={busy} onSelect={() => act("select", "/api/session/path", { pathId: r.path_id })} />
            ))}
          </div>
          <button
            disabled={busy !== null}
            onClick={async () => {
              await act("reject", "/api/session/routes", { action: "reject" });
              router.push("/chat");
            }}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium"
          >
            Ninguna me convence
          </button>
        </>
      )}

      {selected && <PathExploration view={view} busy={busy} act={act} />}
    </section>
  );
}

function RouteCard({ r, selected, busy, onSelect }: { r: Route; selected: boolean; busy: string | null; onSelect: () => void }) {
  const o = r.opportunity;
  const badge = STATUS_BADGE[o.status];
  return (
    <article className={`rounded-2xl border bg-card p-5 ${selected ? "border-accent" : "border-border"}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border px-2.5 py-0.5 text-muted">{TYPE_LABEL[o.type]}</span>
        {badge && <span className={`rounded-full px-2.5 py-0.5 font-medium ${badge.cls}`}>{badge.text}</span>}
      </div>
      <h3 className="mt-2 text-lg font-semibold">{o.title}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <Row t="Qué es">{r.what}</Row>
        <Row t="Por qué aparece">{r.why_this}</Row>
        <Row t="Qué podría atraerte">{r.potential_appeal}</Row>
        <Row t="Qué podría no gustarte">{r.potential_tradeoffs}</Row>
        <Row t="Qué sabemos y qué falta">
          {r.known}
          {r.open_questions.length > 0 && <span className="block text-muted">{r.open_questions.join(" · ")}</span>}
          {o.source_url && (
            <a href={o.source_url} target="_blank" rel="noreferrer" className="mt-1 block text-accent underline-offset-4 hover:underline">
              Ver fuente ↗
            </a>
          )}
        </Row>
        <Row t="Qué podés hacer hoy">{r.action_today}</Row>
      </dl>
      {!selected && (
        <button disabled={busy !== null} onClick={onSelect} className="mt-4 rounded-full border border-accent px-5 py-2 text-sm font-medium text-accent disabled:opacity-60">
          Quiero profundizar en esta
        </button>
      )}
    </article>
  );
}

function PathExploration({ view, busy, act }: { view: View; busy: string | null; act: Act }) {
  const sel = view.selectedPath!;
  const [q, setQ] = useState("");
  const [askConsent, setAskConsent] = useState(false);
  const pathId = sel.route.path_id;
  return (
    <div className="space-y-5 rounded-2xl border border-accent bg-card p-5">
      <h3 className="font-semibold">Profundizando: {sel.route.opportunity.title}</h3>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (q.trim().length < 2) return;
          await act("ask", "/api/session/path", { pathId, question: q.trim() });
          setQ("");
        }}
        className="flex gap-2"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={400} placeholder="Preguntá algo, ej: ¿qué suele sorprender a los estudiantes?" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
        <button disabled={busy !== null} className="rounded-xl bg-accent px-4 text-sm font-medium text-background disabled:opacity-60">
          {busy === "ask" ? "…" : "Preguntar"}
        </button>
      </form>
      {view.pathQuestions.length > 0 && (
        <ul className="space-y-3 text-sm">
          {view.pathQuestions.map((x) => (
            <li key={x.at} className="rounded-xl bg-accent-soft/60 p-3">
              <p className="font-medium">{x.question}</p>
              <p className="mt-1 text-muted">{x.answer}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-border p-4">
        <h4 className="text-sm font-semibold">Hablar con alguien que lo haya vivido</h4>
        {!view.mentorConsent && !askConsent && (
          <button onClick={() => setAskConsent(true)} className="mt-2 text-sm text-accent underline-offset-4 hover:underline">
            Quiero preguntarle a alguien que lo haya estudiado
          </button>
        )}
        {!view.mentorConsent && askConsent && (
          <div className="mt-3 space-y-3 text-sm">
            <p>
              Buscamos solo en un directorio de personas que se anotaron y fueron verificadas. Nunca compartimos tus datos ni te escribimos con nadie sin
              tu permiso, y las preguntas pasan por moderación. Para esta ruta, ¿nos das permiso para buscar?
            </p>
            <div className="flex gap-3">
              <button
                disabled={busy !== null}
                onClick={async () => {
                  const r = await act("consent", "/api/consents", { purpose: "mentors", pathId, action: "grant" });
                  if (r.view) await act("mentors", "/api/session/mentors", { pathId });
                }}
                className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-background disabled:opacity-60"
              >
                Sí, buscá
              </button>
              <button onClick={() => setAskConsent(false)} className="rounded-full border border-border px-4 py-1.5 text-sm">
                Ahora no
              </button>
            </div>
          </div>
        )}
        {view.mentorConsent && view.mentorResult && (
          <div className="mt-3 space-y-3 text-sm">
            {view.mentorResult.fallback && <p className="rounded-lg bg-amber-100 p-2 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{view.mentorResult.fallback}</p>}
            <ul className="space-y-2">
              {view.mentorResult.matches.map((m) => (
                <li key={m.mentor_id} className="rounded-lg border border-dashed border-border p-2">
                  <span className="font-medium">{m.public_alias}</span> <span className="text-xs text-muted">· DEMO · no contactable</span>
                  <p className="text-xs text-muted">{m.experience} · Temas: {m.topics.join(", ")}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">Preguntas que podrías hacerle a alguien real: {view.mentorResult.suggested_questions.join(" · ")}</p>
            <button onClick={() => act("consent", "/api/consents", { purpose: "mentors", pathId, action: "withdraw" })} className="text-xs text-muted underline-offset-4 hover:underline">
              Retirar el permiso
            </button>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold">Tu próximo paso (chico y reversible)</h4>
        <div className="mt-2 flex flex-wrap gap-2">
          {view.nextSteps.map((s) => (
            <button
              key={s}
              disabled={busy !== null}
              onClick={() => act("step", "/api/session/path", { nextStep: s })}
              aria-pressed={view.nextStep === s}
              className={`rounded-full border px-3 py-1.5 text-left text-sm ${view.nextStep === s ? "border-accent bg-accent text-background" : "border-border"}`}
            >
              {s}
            </button>
          ))}
        </div>
        {view.nextStep && <p className="mt-2 text-sm text-accent">Anotado. Podés cambiarlo cuando quieras.</p>}
      </div>
    </div>
  );
}

function Survey({ act }: { act: Act }) {
  const [u, setU] = useState(0);
  const [c, setC] = useState(0);
  const [again, setAgain] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  return (
    <section className="rounded-2xl border border-border bg-card p-6 text-sm">
      <h2 className="font-semibold">¿Te sirvió? (opcional)</h2>
      <Scale label="¿Qué tan útil fue?" value={u} onChange={setU} />
      <Scale label="¿Qué tan claro fue?" value={c} onChange={setC} />
      <div className="mt-3 flex items-center gap-3">
        <span>¿Lo usarías de nuevo?</span>
        {[true, false].map((v) => (
          <button key={String(v)} onClick={() => setAgain(v)} aria-pressed={again === v} className={`rounded-full border px-3 py-1 ${again === v ? "border-accent bg-accent text-background" : "border-border"}`}>
            {v ? "Sí" : "No"}
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="Comentario (opcional)" className="mt-3 w-full rounded-xl border border-border bg-background p-3 outline-none focus:border-accent" />
      <button
        disabled={!u || !c || again === null}
        onClick={() => act("feedback", "/api/feedback", { usefulness: u, clarity: c, wouldUseAgain: again, comment: comment || undefined })}
        className="mt-3 rounded-full bg-accent px-5 py-2 font-medium text-background disabled:opacity-50"
      >
        Enviar
      </button>
    </section>
  );
}

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="w-40">{label}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-pressed={value === n} className={`h-8 w-8 rounded-full border ${value === n ? "border-accent bg-accent text-background" : "border-border"}`}>
          {n}
        </button>
      ))}
    </div>
  );
}

function Axis({ left, right, value }: { left: string; right: string; value: number | null }) {
  return (
    <div className="text-xs">
      <div className="mb-1 flex justify-between text-muted">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-accent-soft">
        {value !== null && <span className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-accent" style={{ left: `${value}%` }} />}
      </div>
      {value === null && <p className="mt-1 text-muted">Sin datos todavía</p>}
    </div>
  );
}

function Card({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {children.length ? <ul className="list-inside list-disc space-y-1 text-sm text-muted">{children}</ul> : <p className="text-sm text-muted">{empty}</p>}
    </div>
  );
}

function Row({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{t}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
