"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import SaveAccount from "@/components/save-account";
import { MIN_QUESTIONS, RIASEC_KEYS, RIASEC_LABELS, type ProfileSnapshot } from "@/lib/profile";
import { speak, startDictation, stopSpeaking, toWav16k } from "@/lib/voice";

type Line = { role: "user" | "assistant"; text: string };
type Choices = { question: string; options: string[] } | null;
type LogItem = { id: number; label: string };

const EMPTY: ProfileSnapshot = { status: "in_progress", questionCount: 0, completeness: 0, code: "", riasec: null, evidence: 0, strengths: [] };

export default function Chat() {
  const [lines, setLines] = useState<Line[]>([]);
  const [choices, setChoices] = useState<Choices>(null);
  const [profile, setProfile] = useState<ProfileSnapshot>(EMPTY);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const logId = useRef(0);

  // Voz: respuestas leídas en voz alta. El ref evita leer un estado viejo dentro de send.
  const [voiceReplies, setVoiceReplies] = useState(false);
  const voiceRef = useRef(false);
  const toggleVoice = () => {
    const on = !voiceRef.current;
    voiceRef.current = on;
    setVoiceReplies(on);
    if (!on) stopSpeaking();
  };

  const note = (label: string) => setLog((l) => [{ id: ++logId.current, label }, ...l].slice(0, 8));

  const send = useCallback(async (body: { message?: string; wantsResults?: boolean }) => {
    setBusy(true);
    setChoices(null);
    stopSpeaking();
    let reply = "";
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
          reply += e.delta;
          setActivity(null);
          setLines((l) => {
            const last = l[l.length - 1];
            return [...l.slice(0, -1), { ...last, text: last.text + e.delta }];
          });
        } else if (e.type === "tool") {
          setActivity(e.label);
          note(e.label);
        } else if (e.type === "choices") {
          reply += `\n${e.question}`;
          setChoices({ question: e.question, options: e.options });
          setLines((l) => {
            const last = l[l.length - 1];
            return [...l.slice(0, -1), { ...last, text: last.text ? `${last.text}\n\n${e.question}` : e.question }];
          });
        } else if (e.type === "error") {
          setLines((l) => [...l, { role: "assistant", text: e.message }]);
        } else if (e.type === "profile") {
          const { type: _t, ...snap } = e;
          void _t;
          setProfile(snap as ProfileSnapshot);
        }
      }
    }
    setLines((l) => l.filter((x) => x.text.trim()));
    setActivity(null);
    setBusy(false);
    if (voiceRef.current) speak(reply);
  }, []);

  // Voz a texto: dictado en vivo mientras hablás; al terminar, Gemini transcribe el audio con la pregunta
  // del agente como contexto. El texto queda en el campo para revisarlo antes de enviar.
  const [recording, setRecording] = useState(false);
  const [voiceHint, setVoiceHint] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const startRecording = async () => {
    stopSpeaking();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setLines((l) => [...l, { role: "assistant", text: "No tengo permiso para usar el micrófono. Habilitalo en el navegador o escribí." }]);
      return;
    }
    const question = choices?.question ?? "";
    setInput("");
    setVoiceHint(false);
    const stopDictation = startDictation((t) => setInput(t));
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      stopDictation?.();
      setRecording(false);
      setBusy(true);
      setActivity("Ajustando la transcripción");
      try {
        const wav = await toWav16k(new Blob(chunks, { type: rec.mimeType }));
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "audio/wav", "x-rumbo-pregunta": encodeURIComponent(question) },
          body: wav,
        });
        const data = (await res.json()) as { text?: string; error?: string };
        if (data.text) setInput(data.text);
        else if (!stopDictation) setLines((l) => [...l, { role: "assistant", text: data.error ?? "No te escuché bien. Probá de nuevo, más cerca del micrófono." }]);
      } catch {
        if (!stopDictation) setLines((l) => [...l, { role: "assistant", text: "No pude procesar el audio. Probá de nuevo o escribí." }]);
      }
      setActivity(null);
      setBusy(false);
      setVoiceHint(true);
      setTimeout(() => textInput.current?.focus(), 0);
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setTimeout(() => rec.state === "recording" && rec.stop(), 60_000); // máximo 1 minuto
  };
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch("/api/chat")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile);
        setIsAnonymous(Boolean(data.isAnonymous));
        setLoaded(true);
        if (data.messages.length === 0) send({});
        else {
          setLines(data.messages);
          setChoices(data.choices);
        }
      });
  }, [send]);

  // Con llaves: en Chrome nuevo scrollIntoView devuelve una Promise, y React la tomaría como función de limpieza.
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, activity, choices]);

  // Importar datos de otras apps (CV / LinkedIn en PDF, GitHub): la IA los extrae y el agente los usa.
  const [showImport, setShowImport] = useState(false);
  const [github, setGithub] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const importFrom = useCallback(
    async (source: "cv" | "github", payload: File | string) => {
      setBusy(true);
      setChoices(null);
      setActivity(source === "cv" ? "Leyendo tu CV" : "Revisando tu GitHub");
      note(source === "cv" ? "Leyó tu CV con IA" : "Revisó tu GitHub con IA");
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
      send({ message: `Te compartí ${source === "cv" ? "mi CV / LinkedIn" : "mi GitHub"}. Usalo para ajustar mi perfil.` });
    },
    [send],
  );

  const submit = () => {
    if (!input.trim() || busy || recording) return;
    send({ message: input.trim() });
    setInput("");
    setVoiceHint(false);
  };

  const final = profile.status === "final";
  const pct = final ? 100 : Math.round(profile.completeness * 100);
  const waitingFirst = lines.length === 0;

  const panel = (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Tu perfil en vivo</span>
          <span className="font-mono text-sm text-accent">{profile.code || "—"}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-accent-soft">
          <div className="h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-muted">
          {final ? "Perfil completo" : `${pct}% definido · ${profile.questionCount} respuestas`} · {profile.evidence} papers
        </p>
      </div>
      <div className="space-y-2">
        {RIASEC_KEYS.map((k) => {
          const d = profile.riasec?.[k];
          return (
            <div key={k} className="grid grid-cols-[92px_1fr] items-center gap-2 text-xs">
              <span className="text-muted">{RIASEC_LABELS[k]}</span>
              <div className="h-2 overflow-hidden rounded-full bg-accent-soft">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${(d?.score ?? 0) * 100}%`, opacity: 0.35 + (d?.confidence ?? 0) * 0.65 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {profile.strengths.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.strengths.map((s) => (
            <span key={s} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs text-accent">
              {s}
            </span>
          ))}
        </div>
      )}
      {log.length > 0 && (
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Lo que hizo el agente</span>
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            {log.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {l.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {isAnonymous && profile.questionCount >= 2 && (
        <div className="rounded-2xl border border-border bg-background p-3">
          <p className="mb-2 text-xs font-medium">Guardá tu perfil para no perderlo</p>
          <SaveAccount compact />
        </div>
      )}
      <Link href="/perfil" className="block rounded-xl border border-border py-2 text-center text-sm font-medium hover:border-accent">
        Ver mi perfil
      </Link>
    </div>
  );

  return (
    // Fijo debajo del header (57 px): el chat ocupa toda la pantalla y no compite con el scroll de la página.
    <div className="fixed inset-x-0 bottom-0 top-[57px] z-0 bg-background">
      <div className="mx-auto grid h-full max-w-6xl lg:grid-cols-[1fr_300px] lg:gap-8 lg:px-6">
        <div className="flex min-h-0 flex-col">
          {/* Barra superior en celular */}
          <button onClick={() => setShowPanel((v) => !v)} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-left lg:hidden">
            <span className="font-mono text-sm text-accent">{profile.code || "···"}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent-soft">
              <span className="block h-full rounded-full bg-accent transition-all duration-700" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-xs text-muted">{showPanel ? "Ocultar" : `${pct}% · ver perfil`}</span>
          </button>
          {showPanel && <div className="max-h-[50%] overflow-y-auto border-b border-border bg-card p-4 lg:hidden">{panel}</div>}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 lg:px-0">
            <div className="mx-auto max-w-2xl space-y-5 py-6">
              {waitingFirst && (
                <div className="flex gap-3">
                  <Avatar />
                  <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-sm text-muted">
                    {loaded ? "Rumbo está preparando tu primera pregunta" : "Cargando tu charla"}
                    <Dots />
                  </div>
                </div>
              )}
              {lines.map((l, i) =>
                l.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-[15px] leading-relaxed text-background">{l.text}</div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <Avatar />
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-[15px] leading-relaxed">
                      {l.text || <Dots />}
                    </div>
                  </div>
                ),
              )}
              {activity && (
                <div className="flex items-center gap-2 pl-12 text-sm text-accent">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                  {activity}…
                </div>
              )}
              {final && !busy && (
                <Link href="/perfil" className="ml-12 block rounded-2xl bg-accent px-5 py-4 text-center font-medium text-background">
                  Ver mi perfil completo y recomendaciones →
                </Link>
              )}
              <div ref={bottom} />
            </div>
          </div>

          {!final && (
            <div className="border-t border-border bg-background px-4 pb-4 pt-3 lg:px-0">
              <div className="mx-auto max-w-2xl space-y-3">
                {choices && !busy && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {choices.options.map((o) => (
                      <button
                        key={o}
                        onClick={() => send({ message: o })}
                        className="rounded-2xl border border-border bg-card px-4 py-2.5 text-left text-sm transition hover:border-accent hover:bg-accent-soft"
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
                {voiceHint && input && <p className="text-xs text-muted">Revisá lo que entendí, corregilo si hace falta y tocá Enviar.</p>}
                <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:border-accent">
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={busy && !recording}
                    aria-label={recording ? "Terminar de grabar" : "Hablar"}
                    title={recording ? "Tocá para terminar" : "Hablar"}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl disabled:opacity-50 ${recording ? "animate-pulse bg-red-500 text-white" : "text-accent hover:bg-accent-soft"}`}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {recording ? (
                        <rect x="7" y="7" width="10" height="10" rx="2" />
                      ) : (
                        <>
                          <rect x="9" y="3" width="6" height="11" rx="3" />
                          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                        </>
                      )}
                    </svg>
                  </button>
                  <textarea
                    ref={textInput}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submit();
                      }
                    }}
                    readOnly={recording}
                    placeholder={recording ? "Te escucho…" : "Escribí o hablá…"}
                    className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[15px] outline-none"
                  />
                  <button
                    onClick={submit}
                    disabled={busy || recording || !input.trim()}
                    aria-label="Enviar"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-background disabled:opacity-40"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <button onClick={toggleVoice} aria-pressed={voiceReplies} className={voiceReplies ? "font-medium text-accent" : "hover:text-foreground"}>
                    {voiceReplies ? "Respuestas en voz: activadas" : "Escuchar respuestas en voz"}
                  </button>
                  <button disabled={busy} onClick={() => setShowImport((v) => !v)} className="hover:text-foreground disabled:opacity-60">
                    Sumar CV, LinkedIn o GitHub
                  </button>
                  {profile.questionCount >= MIN_QUESTIONS && (
                    <button disabled={busy} onClick={() => send({ message: "Quiero ver mis resultados ya.", wantsResults: true })} className="ml-auto font-medium text-accent disabled:opacity-60">
                      Ver mis resultados →
                    </button>
                  )}
                </div>
                {showImport && !busy && (
                  <div className="space-y-3 rounded-2xl border border-border bg-card p-4 text-sm">
                    <p className="text-muted">Con tus datos el agente te conoce más rápido. Solo guardamos lo que extrae la IA, nunca el archivo.</p>
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
            </div>
          )}
        </div>

        <aside className="hidden min-h-0 overflow-y-auto py-6 lg:block">
          <div className="rounded-3xl border border-border bg-card p-5">{panel}</div>
        </aside>
      </div>
    </div>
  );
}

function Avatar() {
  return <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-background">R</div>;
}

function Dots() {
  return (
    <span className="ml-1 inline-flex gap-1 align-middle">
      {[0, 150, 300].map((d) => (
        <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
