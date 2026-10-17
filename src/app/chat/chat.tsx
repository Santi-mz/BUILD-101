"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MIN_QUESTIONS } from "@/lib/profile";

type Line = { role: "user" | "assistant"; text: string };
type Choices = { question: string; options: string[] } | null;
type ProfileState = { status: string; questionCount: number; completeness: number; code: string };

export default function Chat() {
  const [lines, setLines] = useState<Line[]>([]);
  const [choices, setChoices] = useState<Choices>(null);
  const [profile, setProfile] = useState<ProfileState>({ status: "in_progress", questionCount: 0, completeness: 0, code: "" });
  const [activity, setActivity] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const send = useCallback(async (body: { message?: string; wantsResults?: boolean }) => {
    setBusy(true);
    setChoices(null);
    if (body.message) setLines((l) => [...l, { role: "user", text: body.message! }]);
    setLines((l) => [...l, { role: "assistant", text: "" }]);

    const res = await fetch("/api/chat", { method: "POST", body: JSON.stringify(body) });
    if (!res.ok || !res.body) {
      setLines((l) => [...l.slice(0, -1), { role: "assistant", text: "No pude conectarme. Probá de nuevo." }]);
      setBusy(false);
      return;
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.trim()) continue;
        const e = JSON.parse(part);
        if (e.type === "text") {
          setActivity(null);
          setLines((l) => {
            const last = l[l.length - 1];
            return [...l.slice(0, -1), { ...last, text: last.text + e.delta }];
          });
        } else if (e.type === "tool") setActivity(e.label);
        else if (e.type === "choices") {
          setChoices({ question: e.question, options: e.options });
          setLines((l) => {
            const last = l[l.length - 1];
            return [...l.slice(0, -1), { ...last, text: last.text ? `${last.text}\n\n${e.question}` : e.question }];
          });
        } else if (e.type === "error") {
          setLines((l) => [...l, { role: "assistant", text: e.message }]);
        } else if (e.type === "profile") setProfile(e);
      }
    }
    setLines((l) => l.filter((x) => x.text.trim()));
    setActivity(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/chat")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile);
        if (data.messages.length === 0) send({});
        else {
          setLines(data.messages);
          setChoices(data.choices);
        }
      });
  }, [send]);

  // Con llaves: en Chrome nuevo scrollIntoView devuelve una Promise, y React la tomaría como función de limpieza.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, activity]);

  // Importar datos de otras apps (CV / LinkedIn en PDF, GitHub): la IA los extrae y el agente los usa.
  const importFrom = useCallback(
    async (source: "cv" | "github", payload: File | string) => {
      setBusy(true);
      setChoices(null);
      setActivity(source === "cv" ? "Leyendo tu CV" : "Revisando tu GitHub");
      const form = new FormData();
      form.set("source", source);
      form.set(source === "cv" ? "file" : "username", payload);
      const res = await fetch("/api/import", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setActivity(null);
      setBusy(false);
      if (!res.ok) {
        setLines((l) => [...l, { role: "assistant", text: data.error ?? "No pude leer eso. Probá de nuevo." }]);
        return;
      }
      setShowImport(false);
      const what = source === "cv" ? "mi CV / LinkedIn" : "mi GitHub";
      send({ message: `Te compartí ${what}. Usalo para ajustar mi perfil.` });
    },
    [send],
  );
  const [showImport, setShowImport] = useState(false);
  const [github, setGithub] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const final = profile.status === "final";
  const pct = Math.round(profile.completeness * 100);

  return (
    <div className="mx-auto flex h-[calc(100dvh-57px)] max-w-3xl flex-col px-4">
      <div className="border-b border-border py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            Tu perfil {profile.code && <span className="font-mono text-accent">{profile.code}</span>}
          </span>
          <span className="text-muted">
            {final ? "Listo" : `${pct}% definido · ${profile.questionCount} respuestas`}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent-soft">
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${final ? 100 : pct}%` }} />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto py-6">
        {lines.map((l, i) => (
          <div key={i} className={l.role === "user" ? "flex justify-end" : "flex"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                l.role === "user" ? "bg-accent text-background" : "border border-border bg-card"
              }`}
            >
              {l.text}
            </div>
          </div>
        ))}
        {activity && <p className="animate-pulse text-sm text-muted">{activity}…</p>}
        {busy && !activity && lines[lines.length - 1]?.text === "" && <p className="animate-pulse text-sm text-muted">Pensando…</p>}
        {final && !busy && (
          <Link href="/perfil" className="block rounded-2xl bg-accent-soft p-4 text-center font-medium text-accent">
            Ver mi perfil completo y recomendaciones →
          </Link>
        )}
        <div ref={bottom} />
      </div>

      {!final && (
        <div className="space-y-3 border-t border-border py-4">
          {choices && !busy && (
            <div className="flex flex-wrap gap-2">
              {choices.options.map((o) => (
                <button key={o} onClick={() => send({ message: o })} className="rounded-full border border-accent px-4 py-1.5 text-sm text-accent hover:bg-accent-soft">
                  {o}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || busy) return;
              send({ message: input });
              setInput("");
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="Escribí lo que quieras…"
              className="flex-1 rounded-xl border border-border bg-card px-4 py-3 outline-none focus:border-accent disabled:opacity-60"
            />
            <button disabled={busy} className="rounded-xl bg-accent px-5 font-medium text-background disabled:opacity-60">
              Enviar
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button
              disabled={busy}
              onClick={() => setShowImport((v) => !v)}
              className="text-accent underline-offset-4 hover:underline disabled:opacity-60"
            >
              Sumar mi CV, LinkedIn o GitHub
            </button>
            {profile.questionCount >= MIN_QUESTIONS && (
              <button
                disabled={busy}
                onClick={() => send({ message: "Quiero ver mis resultados ya.", wantsResults: true })}
                className="text-muted underline-offset-4 hover:underline disabled:opacity-60"
              >
                Mostrame mi perfil ahora
              </button>
            )}
          </div>
          {showImport && !busy && (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
              <p className="text-muted">
                Con tus datos el agente te conoce más rápido. Solo guardamos lo que extrae la IA, nunca el archivo.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importFrom("cv", f);
                    e.target.value = "";
                  }}
                />
                <button onClick={() => fileInput.current?.click()} className="rounded-full border border-accent px-4 py-1.5 text-accent hover:bg-accent-soft">
                  Subir CV o LinkedIn (PDF)
                </button>
                <span className="text-xs text-muted">En LinkedIn: tu perfil → Más → Guardar como PDF</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (github.trim()) importFrom("github", github.trim());
                }}
                className="flex gap-2"
              >
                <input
                  value={github}
                  onChange={(e) => setGithub(e.target.value)}
                  placeholder="Tu usuario de GitHub"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-accent"
                />
                <button className="rounded-xl border border-accent px-4 text-accent hover:bg-accent-soft">Conectar</button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
