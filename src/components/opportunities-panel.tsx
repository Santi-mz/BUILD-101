"use client";

import { useMemo, useState } from "react";
import type { Opportunity, OpportunityKind, OpportunityScope } from "@/lib/opportunities";

const KIND_LABEL: Record<OpportunityKind, string> = { beca: "Becas", pasantia: "Pasantías", empleo: "Empleos", curso: "Cursos" };
const KIND_ONE: Record<OpportunityKind, string> = { beca: "Beca", pasantia: "Pasantía", empleo: "Empleo", curso: "Curso" };

/**
 * Oportunidades reales y abiertas para tu perfil (becas, pasantías, empleos, cursos), en Uruguay o en el exterior.
 * Las encuentra la IA y solo muestra links verificados de las fuentes.
 */
export default function OpportunitiesPanel({ initial }: { initial: Opportunity[] }) {
  const [items, setItems] = useState<Opportunity[]>(initial);
  const [scope, setScope] = useState<OpportunityScope>("nacional");
  const [kind, setKind] = useState<OpportunityKind | "todas">("todas");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const visible = useMemo(() => items.filter((o) => o.scope === scope && (kind === "todas" || o.kind === kind)), [items, scope, kind]);

  async function search() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, kinds: kind === "todas" ? ["beca", "pasantia", "empleo", "curso"] : [kind] }),
    });
    const data = (await res.json().catch(() => ({ error: "Algo falló." }))) as { error?: string; found?: number; opportunities?: Opportunity[] };
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "Algo falló.");
    setItems(data.opportunities ?? items);
    setMsg(data.found ? `Encontré ${data.found} oportunidades.` : "No encontré nuevas con ese filtro. Probá otro.");
  }

  const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-sm transition ${active ? "bg-accent text-background" : "border border-border hover:border-accent"}`;

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="text-xl font-semibold">Oportunidades abiertas para vos</h2>
      <p className="mt-1 text-sm text-muted">Becas, pasantías, empleos y cursos reales, buscados por la IA según tu perfil. Solo mostramos links de las fuentes oficiales o de la búsqueda.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["nacional", "internacional"] as const).map((s) => (
          <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s} className={chip(scope === s)}>
            {s === "nacional" ? "Uruguay" : "Internacional"}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        {(["todas", "beca", "pasantia", "empleo", "curso"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={chip(kind === k)}>
            {k === "todas" ? "Todas" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {visible.map((o) => (
            <a key={o.url} href={o.url} target="_blank" rel="noreferrer" className="group flex flex-col rounded-2xl border border-border bg-background p-4 transition hover:border-accent">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">{KIND_ONE[o.kind]}</span>
                {o.location && <span className="text-muted">{o.location}</span>}
                {o.deadline && <span className="ml-auto text-muted">Cierra {o.deadline}</span>}
              </div>
              <h3 className="mt-2 font-medium leading-snug group-hover:text-accent">{o.title}</h3>
              <p className="text-xs text-muted">{o.org}</p>
              <p className="mt-2 flex-1 text-sm text-muted">{o.why}</p>
              <span className="mt-3 text-xs font-medium text-accent">Ver convocatoria ↗</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted">
          Todavía no hay oportunidades {scope === "nacional" ? "en Uruguay" : "internacionales"} con este filtro. Tocá “Buscar” y la IA las busca para vos.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={search} disabled={busy} className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-background disabled:opacity-60">
          {busy ? "Buscando… (~40 s)" : `Buscar ${kind === "todas" ? "oportunidades" : KIND_LABEL[kind].toLowerCase()} ${scope === "nacional" ? "en Uruguay" : "internacionales"}`}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </section>
  );
}
