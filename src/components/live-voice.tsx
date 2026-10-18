"use client";

import { GoogleGenAI, Modality, type FunctionDeclaration, type LiveServerMessage, type Session } from "@google/genai";
import { useEffect, useRef, useState } from "react";
import { call, type View } from "@/components/api-client";

type Status = "conectando" | "escuchando" | "pensando" | "hablando" | "terminado" | "error";
type Turn = { role: "user" | "agent"; text: string };

// --- audio: micrófono a PCM 16 kHz y reproducción de PCM 24 kHz ---
function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function floatToPcm16(f: Float32Array) {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
  return new Uint8Array(out.buffer);
}
function pcm16ToFloat(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const f = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) f[i] = pcm[i] / 0x8000;
  return f;
}

/**
 * Conversación por voz en tiempo real con Gemini Live: hablás de corrido y Rumbo te contesta con voz.
 * Gemini Live solo escucha y habla: cada cosa que decís pasa por el mismo motor que el chat escrito (/api/chat),
 * que analiza, decide la próxima pregunta y guarda todo en la sesión.
 */
export default function LiveVoice({ greeting, onView, onClose }: { greeting: string; onView: (v: View) => void; onClose: () => void }) {
  const [status, setStatus] = useState<Status>("conectando");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const cleanup = useRef<() => void>(() => {});
  // La pregunta con la que arranca se toma una sola vez: los turnos siguientes no reconectan la voz.
  const firstLine = useRef(greeting);
  const onViewRef = useRef(onView);
  useEffect(() => {
    onViewRef.current = onView;
  }, [onView]);

  useEffect(() => {
    let cancelled = false;
    let session: Session | null = null;
    let stream: MediaStream | null = null;
    const inCtx = new AudioContext({ sampleRate: 16000 });
    const outCtx = new AudioContext({ sampleRate: 24000 });
    let nextTime = 0;
    const playing = new Set<AudioBufferSourceNode>();

    const add = (role: Turn["role"], text: string) =>
      setTurns((t) => {
        const last = t[t.length - 1];
        if (last?.role === role) return [...t.slice(0, -1), { role, text: last.text + text }];
        return [...t, { role, text }].slice(-8);
      });

    const play = (b64: string) => {
      const f = pcm16ToFloat(b64);
      const buf = outCtx.createBuffer(1, f.length, 24000);
      buf.copyToChannel(f, 0);
      const src = outCtx.createBufferSource();
      src.buffer = buf;
      src.connect(outCtx.destination);
      nextTime = Math.max(nextTime, outCtx.currentTime);
      src.start(nextTime);
      nextTime += buf.duration;
      playing.add(src);
      setStatus("hablando");
      src.onended = () => {
        playing.delete(src);
        if (playing.size === 0) setStatus((s) => (s === "hablando" ? "escuchando" : s));
      };
    };
    const stopPlayback = () => {
      playing.forEach((s) => s.stop());
      playing.clear();
      nextTime = 0;
    };

    // Lo que dijo la persona va al motor de la entrevista; Live solo lee la respuesta.
    const turn = async (args: Record<string, unknown>) => {
      const texto = String(args.texto ?? "").trim();
      if (!texto) return { error: "No llegó lo que dijo la persona." };
      const r = await call("/api/chat", { body: { message: texto, close: args.terminar === true } });
      if (!r.view) return { error: r.error ?? "Falló el motor." };
      if (!cancelled) {
        setView(r.view);
        onViewRef.current(r.view);
      }
      return { decir: r.view.reply ?? "" };
    };

    const onMessage = async (m: LiveServerMessage) => {
      const sc = m.serverContent;
      if (sc?.interrupted) stopPlayback();
      for (const p of sc?.modelTurn?.parts ?? []) if (p.inlineData?.data) play(p.inlineData.data);
      if (sc?.inputTranscription?.text) add("user", sc.inputTranscription.text);
      if (sc?.outputTranscription?.text) add("agent", sc.outputTranscription.text);
      if (m.toolCall?.functionCalls?.length) {
        setStatus("pensando");
        const responses = await Promise.all(
          m.toolCall.functionCalls.map(async (fc) => ({
            id: fc.id,
            name: fc.name,
            response: (fc.name === "responder"
              ? await turn(fc.args ?? {}).catch(() => ({ error: "Falló el motor." }))
              : { error: "Herramienta desconocida." }) as Record<string, unknown>,
          })),
        );
        if (!cancelled) session?.sendToolResponse({ functionResponses: responses });
      }
    };

    (async () => {
      try {
        const res = await fetch("/api/live/token", { method: "POST" });
        const cfg = (await res.json()) as { token: string; model: string; systemInstruction: string; tools: FunctionDeclaration[]; error?: { message: string } };
        if (!res.ok) throw new Error(cfg.error?.message ?? "");
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (cancelled) return;
        const ai = new GoogleGenAI({ apiKey: cfg.token, httpOptions: { apiVersion: "v1alpha" } });
        session = await ai.live.connect({
          model: cfg.model,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            systemInstruction: cfg.systemInstruction,
            tools: [{ functionDeclarations: cfg.tools }],
          },
          callbacks: {
            onopen: () => setStatus("escuchando"),
            onmessage: (m) => void onMessage(m),
            onerror: () => {
              setError("Se cortó la conexión con la voz en vivo.");
              setStatus("error");
            },
            onclose: () => setStatus((s) => (s === "error" ? s : "terminado")),
          },
        });
        // Micrófono → PCM 16 kHz → Gemini Live
        const src = inCtx.createMediaStreamSource(stream);
        const proc = inCtx.createScriptProcessor(2048, 1, 1);
        proc.onaudioprocess = (e) => session?.sendRealtimeInput({ audio: { data: toBase64(floatToPcm16(e.inputBuffer.getChannelData(0))), mimeType: "audio/pcm;rate=16000" } });
        src.connect(proc);
        proc.connect(inCtx.destination);
        // Arranca leyendo la última pregunta del motor, para seguir la charla desde donde quedó.
        session.sendClientContent({ turns: [{ role: "user", parts: [{ text: `Leé en voz alta, tal cual: «${firstLine.current}»` }] }], turnComplete: true });
      } catch (err) {
        setError((err instanceof Error && err.message) || "No pude arrancar la voz en vivo. Revisá el permiso del micrófono o probá de nuevo.");
        setStatus("error");
      }
    })();

    cleanup.current = () => {
      cancelled = true;
      session?.close();
      stream?.getTracks().forEach((t) => t.stop());
      stopPlayback();
      inCtx.close().catch(() => {});
      outCtx.close().catch(() => {});
    };
    return () => cleanup.current();
  }, []);

  const close = () => {
    cleanup.current();
    onClose();
  };

  const label = {
    conectando: "Conectando…",
    escuchando: "Te escucho",
    pensando: "Pensando en lo que dijiste…",
    hablando: "Rumbo está hablando",
    terminado: "Conversación terminada",
    error: "No se pudo conectar",
  }[status];
  const done = view?.status === "COMPLETED";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur" role="dialog" aria-label="Conversación por voz">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Conversación por voz · en vivo</span>
          {view && <span className="text-accent">{view.stage}</span>}
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          <div className="relative flex h-44 w-44 items-center justify-center">
            <span
              className={`absolute inset-0 rounded-full bg-accent/20 ${status === "hablando" ? "animate-ping" : status === "escuchando" ? "animate-pulse" : ""}`}
            />
            <span
              className={`relative flex h-32 w-32 items-center justify-center rounded-full text-3xl font-semibold text-background transition ${status === "error" ? "bg-red-500" : "bg-accent"} ${status === "pensando" ? "animate-pulse" : ""}`}
            >
              R
            </span>
          </div>
          <p className="text-center text-lg font-medium">{label}</p>
          {error && <p className="max-w-sm text-center text-sm text-red-600">{error}</p>}
          {status === "escuchando" && <p className="text-center text-sm text-muted">Hablá con naturalidad. Podés interrumpirlo cuando quieras.</p>}
        </div>

        <div className="max-h-56 space-y-2 overflow-y-auto">
          {turns.map((t, i) => (
            <p key={i} className={`text-sm ${t.role === "user" ? "text-right text-foreground" : "text-muted"}`}>
              <span className="font-medium">{t.role === "user" ? "Vos: " : "Rumbo: "}</span>
              {t.text}
            </p>
          ))}
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <button onClick={close} className="rounded-full bg-foreground px-7 py-3 font-medium text-background">
            {done ? "Volver al chat" : "Terminar"}
          </button>
          {done && (
            <a href="/resultado" className="rounded-full bg-accent px-7 py-3 font-medium text-background">
              Ver lo que entendí
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
