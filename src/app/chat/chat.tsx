"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { call, type View } from "@/components/api-client";
import { speak, startDictation, stopSpeaking, toWav16k } from "@/lib/voice";

const AGE_OPTIONS = [
  { value: "A14_15", label: "14 a 15" },
  { value: "A16_17", label: "16 a 17" },
  { value: "A18_21", label: "18 a 21" },
  { value: "A22_25", label: "22 a 25" },
  { value: "A26_MAS", label: "26 o más" },
] as const;

export default function Chat() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const voiceRef = useRef(false);
  const [voiceReplies, setVoiceReplies] = useState(false);

  useEffect(() => {
    call("/api/session").then((r) => {
      if (r.view) setView(r.view);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [view?.messages.length, pending]);

  const send = useCallback(async (message: string, close = false) => {
    setBusy(true);
    setError("");
    setPending(message);
    stopSpeaking();
    const r = await call("/api/chat", { body: { message, close } });
    setPending(null);
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setView(r.view!);
    if (voiceRef.current && r.view?.reply) speak(r.view.reply);
  }, []);

  const correct = async (id: string, status: "REJECTED" | "CONFIRMED") => {
    const r = await call("/api/session/evidence", { body: { id, status } });
    if (r.view) setView(r.view);
    else if (r.error) setError(r.error);
  };

  // Voz a texto (se mantiene del chat anterior): dictado en vivo + transcripción con Gemini; siempre se revisa antes de enviar.
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const startRecording = async () => {
    stopSpeaking();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("No tengo permiso para usar el micrófono. Habilitalo en el navegador o escribí.");
      return;
    }
    const lastQuestion = [...(view?.messages ?? [])].reverse().find((m) => m.role === "ASSISTANT")?.content ?? "";
    setInput("");
    const stopDictation = startDictation((t) => setInput(t));
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      stopDictation?.();
      setRecording(false);
      setBusy(true);
      try {
        const wav = await toWav16k(new Blob(chunks, { type: rec.mimeType }));
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "audio/wav", "x-rumbo-pregunta": encodeURIComponent(lastQuestion.slice(0, 300)) },
          body: wav,
        });
        const data = (await res.json()) as { text?: string };
        if (data.text) setInput(data.text);
      } catch {
        // queda lo que entendió el dictado en vivo
      }
      setBusy(false);
      setTimeout(() => textInput.current?.focus(), 0);
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
    setTimeout(() => rec.state === "recording" && rec.stop(), 60_000);
  };
  const stopRecording = () => recorder.current?.state === "recording" && recorder.current.stop();

  if (loading) return <p className="p-10 text-center text-sm text-muted">Cargando…</p>;
  if (!view) return <Onboarding onStart={setView} />;

  const done = view.status === "COMPLETED";
  const lastIsAssistant = view.messages.at(-1)?.role === "ASSISTANT";
  const quick = view.pendingConfirmation && lastIsAssistant && !busy ? ["Sí, me representa", "Más o menos", "No, no es así"] : [];

  return (
    <div className="mx-auto flex h-[calc(100dvh-57px)] max-w-6xl gap-6 px-4">
      <div className="flex min-w-0 flex-1 flex-col">
        <Stages view={view} onPanel={() => setPanelOpen((v) => !v)} panelCount={view.panel.length} />

        <div className="flex-1 space-y-4 overflow-y-auto py-6" aria-live="polite">
          {view.messages.map((m) => (
            <div key={m.id} className={m.role === "USER" ? "flex justify-end" : "flex"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                  m.role === "USER" ? "bg-accent text-background" : m.action === "SAFETY" ? "border-2 border-accent bg-card" : "border border-border bg-card"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {pending && (
            <>
              <div className="flex justify-end">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-3 text-[15px] text-background opacity-70">{pending}</div>
              </div>
              <p className="animate-pulse text-sm text-muted">Pensando…</p>
            </>
          )}
          {done && (
            <Link href="/resultado" className="block rounded-2xl bg-accent-soft p-4 text-center font-medium text-accent">
              Ver lo que entendí y explorar caminos →
            </Link>
          )}
          {error && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
          <div ref={bottom} />
        </div>

        {panelOpen && (
          <div className="mb-3 max-h-[45vh] overflow-y-auto rounded-2xl border border-border bg-card p-4 lg:hidden">
            <Panel view={view} onCorrect={correct} />
          </div>
        )}

        {!done && (
          <div className="space-y-3 border-t border-border py-4">
            {quick.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quick.map((q) => (
                  <button key={q} onClick={() => send(q)} className="rounded-full border border-accent px-4 py-1.5 text-sm text-accent hover:bg-accent-soft">
                    {q}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!input.trim() || busy) return;
                send(input.trim());
                setInput("");
              }}
              className="flex gap-2"
            >
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={busy && !recording}
                aria-label={recording ? "Terminar de grabar" : "Hablar"}
                className={`flex w-12 shrink-0 items-center justify-center rounded-xl border disabled:opacity-60 ${recording ? "animate-pulse border-red-500 bg-red-500 text-white" : "border-border bg-card text-accent"}`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {recording ? <rect x="7" y="7" width="10" height="10" rx="2" /> : <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>}
                </svg>
              </button>
              <input
                ref={textInput}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                readOnly={recording}
                disabled={busy && !recording}
                maxLength={2000}
                placeholder={recording ? "Grabando… tocá el cuadrado para terminar" : "Escribí o tocá el micrófono…"}
                className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3 outline-none focus:border-accent disabled:opacity-60"
              />
              <button disabled={busy} className="rounded-xl bg-accent px-5 font-medium text-background disabled:opacity-60">
                Enviar
              </button>
            </form>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <button
                onClick={() => {
                  voiceRef.current = !voiceRef.current;
                  setVoiceReplies(voiceRef.current);
                  if (!voiceRef.current) stopSpeaking();
                }}
                className="text-muted underline-offset-4 hover:underline"
                aria-pressed={voiceReplies}
              >
                {voiceReplies ? "Respuestas en voz: activadas" : "Escuchar las respuestas en voz"}
              </button>
              {view.canClose && (
                <button disabled={busy} onClick={() => send("Quiero terminar y ver lo que entendiste.", true)} className="text-muted underline-offset-4 hover:underline disabled:opacity-60">
                  Terminar y ver lo que entendí
                </button>
              )}
              {view.mode.llm === "mock" && <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-xs text-muted">Modo demo sin IA</span>}
            </div>
          </div>
        )}
      </div>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border py-6 pl-6 lg:block">
        <Panel view={view} onCorrect={correct} />
      </aside>
    </div>
  );
}

function Stages({ view, onPanel, panelCount }: { view: View; onPanel: () => void; panelCount: number }) {
  return (
    <div className="border-b border-border py-3">
      <ol className="flex items-center gap-1 text-xs sm:text-sm" aria-label="Etapas">
        {view.stages.map((st, i) => (
          <li key={st} className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={`truncate ${i === view.stageIndex ? "font-semibold text-accent" : i < view.stageIndex ? "text-foreground" : "text-muted"}`}>{st}</span>
            <span className={`h-1 rounded-full ${i <= view.stageIndex ? "bg-accent" : "bg-accent-soft"}`} />
          </li>
        ))}
      </ol>
      <button onClick={onPanel} className="mt-2 text-sm text-accent underline-offset-4 hover:underline lg:hidden">
        Lo que voy entendiendo ({panelCount})
      </button>
    </div>
  );
}

const STATUS_LABEL = { CONFIRMED: "Confirmado", PENDING: "En duda", REJECTED: "No es así" } as const;

export function Panel({ view, onCorrect }: { view: View; onCorrect: (id: string, status: "REJECTED" | "CONFIRMED") => void }) {
  const items = [...view.panel].reverse();
  return (
    <div>
      <h2 className="font-semibold">Lo que voy entendiendo</h2>
      <p className="mt-1 text-xs text-muted">Son hipótesis a partir de lo que contaste. Si algo no te representa, marcalo y lo dejo de usar.</p>
      {items.length === 0 && <p className="mt-4 text-sm text-muted">Todavía nada. Contame algo y lo vas a ver acá.</p>}
      <ul className="mt-4 space-y-3">
        {items.map((it) => (
          <li key={it.id} className={`rounded-xl border p-3 text-sm ${it.status === "REJECTED" ? "border-dashed border-border opacity-60" : "border-border"}`}>
            <div className="flex items-start justify-between gap-2">
              <span className={`font-medium ${it.status === "REJECTED" ? "line-through" : ""}`}>{it.label}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${it.status === "CONFIRMED" ? "bg-accent text-background" : "bg-accent-soft text-accent"}`}>
                {it.kind === "HYPOTHESIS" && it.status === "PENDING" ? "Hipótesis" : STATUS_LABEL[it.status]}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">“{it.quote}”</p>
            {it.status !== "REJECTED" && (
              <div className="mt-2 flex gap-3 text-xs">
                <button onClick={() => onCorrect(it.id, "REJECTED")} className="text-muted underline-offset-4 hover:text-foreground hover:underline">
                  No es así
                </button>
                {it.status === "PENDING" && (
                  <button onClick={() => onCorrect(it.id, "CONFIRMED")} className="text-accent underline-offset-4 hover:underline">
                    Sí, es así
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Onboarding({ onStart }: { onStart: (v: View) => void }) {
  const [age, setAge] = useState<(typeof AGE_OPTIONS)[number]["value"] | "">("");
  const [consent, setConsent] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const minor = age === "A14_15" || age === "A16_17";

  const start = async () => {
    setBusy(true);
    setError("");
    const r = await call("/api/session", { body: { ageRange: age, consent: true, guardianConsent: guardian } });
    setBusy(false);
    if (r.view) onStart(r.view);
    else setError(r.error ?? "No pude empezar.");
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Conectate con tu futuro</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">No hace falta que tengas todo claro. Vamos a explorar juntos.</h1>
      <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
        <p>
          <b>Qué es:</b> una charla con una IA que te hace preguntas para entender qué te gusta, qué te importa y qué tenés que tener en cuenta. Lleva entre
          15 y 25 minutos. Al final ves lo que entendió y, si querés, caminos para investigar.
        </p>
        <p>
          <b>Qué no es:</b> no es un test, no decide por vos y no reemplaza a un orientador o a un psicólogo.
        </p>
        <p>
          <b>Tus datos:</b> no te pedimos nombre, email, teléfono ni liceo (si los escribís, los tapamos). Guardamos la charla y lo que entendimos durante
          30 días para que puedas volver; después se borra solo. Podés borrarlo vos en cualquier momento.
        </p>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium">¿Qué edad tenés?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AGE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setAge(o.value)}
              aria-pressed={age === o.value}
              className={`rounded-full border px-4 py-1.5 text-sm ${age === o.value ? "border-accent bg-accent text-background" : "border-border bg-card"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      {minor && (
        <label className="mt-4 flex gap-3 rounded-xl border border-border bg-card p-3 text-sm">
          <input type="checkbox" checked={guardian} onChange={(e) => setGuardian(e.target.checked)} className="mt-1" />
          <span>Un adulto responsable (madre, padre o tutor) sabe que uso esta herramienta y está de acuerdo.</span>
        </label>
      )}

      <label className="mt-4 flex gap-3 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>Entiendo qué es la herramienta y acepto que se guarde la charla por 30 días.</span>
      </label>

      <button
        onClick={start}
        disabled={!age || !consent || (minor && !guardian) || busy}
        className="mt-6 w-full rounded-xl bg-accent py-3 font-medium text-background disabled:opacity-50"
      >
        {busy ? "Empezando…" : "Empezar a explorar"}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
