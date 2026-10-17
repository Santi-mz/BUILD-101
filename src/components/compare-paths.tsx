"use client";

import { useState } from "react";

type Option = { id: string; name: string; match: number };
type Result = {
  summary: string;
  rows: { aspect: string; a: string; b: string }[];
  first_step: string;
  a: { name: string; affinity: number };
  b: { name: string; affinity: number };
  error?: string;
};

/** Elegí dos ocupaciones del grafo y la IA las compara contra tu perfil. */
export default function ComparePaths({ options }: { options: Option[] }) {
  const [a, setA] = useState(options[0]?.id ?? "");
  const [b, setB] = useState(options[1]?.id ?? "");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compare() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b }) });
    const data = (await r.json().catch(() => ({ error: "Algo falló." }))) as Result;
    setBusy(false);
    if (!r.ok) setError(data.error ?? "Algo falló.");
    else setRes(data);
  }

  const select = (value: string, set: (v: string) => void, label: string) => (
    <label className="min-w-0 flex-1 text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 outline-none focus:border-accent">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} ({o.match}%)
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="text-lg font-semibold">Compará dos caminos</h2>
      <p className="mt-1 text-sm text-muted">Elegí dos ocupaciones afines y la IA las compara con tu perfil: qué estudiar, cuánto lleva y qué te faltaría.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        {select(a, setA, "Camino A")}
        {select(b, setB, "Camino B")}
        <button onClick={compare} disabled={busy || a === b} className="rounded-xl bg-accent px-5 py-2.5 font-medium text-background disabled:opacity-60">
          {busy ? "Comparando… (~20 s)" : "Comparar"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {res && (
        <div className="mt-6 space-y-4">
          <p className="text-[15px] leading-relaxed">{res.summary}</p>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-accent-soft/60 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium" />
                  <th className="px-4 py-3 font-medium">
                    {res.a.name} <span className="font-mono text-accent">{res.a.affinity}%</span>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {res.b.name} <span className="font-mono text-accent">{res.b.affinity}%</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={r.aspect} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-medium">{r.aspect}</td>
                    <td className="px-4 py-3 text-muted">{r.a}</td>
                    <td className="px-4 py-3 text-muted">{r.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm">
            <b className="text-accent">Primer paso:</b> {res.first_step}
          </p>
        </div>
      )}
    </section>
  );
}
