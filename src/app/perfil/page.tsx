import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RIASEC_KEYS, RIASEC_LABELS, riasecCode, type ProfileData } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

const TYPE_LABEL = { carrera: "Carrera", curso: "Curso", pasantia: "Pasantía", empleo: "Empleo", beca: "Beca" };

async function PerfilInner() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: row } = await supabase.from("profiles").select("data,status").eq("user_id", user.id).maybeSingle();
  const p = row?.data as ProfileData | null;

  if (!p?.riasec) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Todavía no tenés perfil</h1>
        <p className="mt-2 text-muted">Charlá unos minutos con el agente y lo armamos.</p>
        <Link href="/chat" className="mt-6 inline-block rounded-full bg-accent px-6 py-3 font-medium text-background">Empezar</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12">
      <section>
        <p className="text-sm text-muted">{row?.status === "final" ? "Perfil completo" : "Perfil en construcción"}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Tu código <span className="font-mono text-accent">{riasecCode(p)}</span>
        </h1>
        <p className="mt-3 text-muted">{p.summary}</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">Intereses (RIASEC)</h2>
        <div className="space-y-3">
          {RIASEC_KEYS.map((k) => (
            <div key={k} className="grid grid-cols-[110px_1fr_70px] items-center gap-3 text-sm">
              <span>{RIASEC_LABELS[k]}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-accent-soft">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(p.riasec[k].score * 100)}%` }} />
              </div>
              <span className="text-right font-mono text-xs text-muted">{Math.round(p.riasec[k].score * 100)} · ±{Math.round((1 - p.riasec[k].confidence) * 100)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-2 font-semibold">Fortalezas</h2>
          <ul className="list-inside list-disc text-sm text-muted">{p.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-2 font-semibold">Valores</h2>
          <ul className="list-inside list-disc text-sm text-muted">{p.values.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      </section>

      {p.recommendations && p.recommendations.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Recomendaciones</h2>
          <div className="space-y-3">
            {p.recommendations.map((r) => (
              <div key={r.title} className="rounded-2xl border border-border bg-card p-5">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{TYPE_LABEL[r.type]}</span>
                <h3 className="mt-2 font-medium">
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:text-accent">{r.title} ↗</a> : r.title}
                </h3>
                <p className="mt-1 text-sm text-muted">{r.why}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.evidence.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Evidencia científica</h2>
          <ul className="space-y-3 text-sm">
            {p.evidence.map((e) => (
              <li key={e.pmid} className="rounded-2xl border border-border bg-card p-4">
                <a href={`https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/`} target="_blank" rel="noreferrer" className="font-medium hover:text-accent">
                  {e.title} <span className="font-mono text-xs text-muted">PMID {e.pmid}</span>
                </a>
                <p className="mt-1 text-muted">{e.claim}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-3">
        <Link href="/#feed" className="rounded-full bg-accent px-5 py-2.5 font-medium text-background">Ver mi feed</Link>
        <Link href="/chat" className="rounded-full border border-border px-5 py-2.5 font-medium">Seguir charlando</Link>
      </div>
    </div>
  );
}

export default function Perfil() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-sm text-muted">Cargando…</p>}>
      <PerfilInner />
    </Suspense>
  );
}
