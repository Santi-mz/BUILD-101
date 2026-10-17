"use client";

import { GoogleGenAI, Modality, type FunctionDeclaration, type LiveServerMessage, type Session } from "@google/genai";
import { useEffect, useRef, useState } from "react";

type Status = "conectando" | "escuchando" | "pensando" | "hablando" | "terminado" | "error";
type Turn = { role: "user" | "agent"; text: string };

const TOOL_LABELS: Record<string, string> = {
  search_pubmed: "Buscando evidencia en PubMed",
  update_profile: "Actualizando tu perfil",
  get_profile: "Leyendo tu perfil",
  finalize_profile: "Armando tus recomendaciones",
  search_news: "Buscando noticias",
  web_search: "Buscando opciones reales en la web",
  graph_match_profile: "Recorriendo el grafo de carreras",
  graph_explore: "Navegando ocupaciones relacionadas",
  graph_search: "Buscando en el grafo de carreras",
};

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
 * Conversación por voz en tiempo real con Gemini Live: hablás de corrido, el agente te contesta con voz,
 * te puede interrumpir o ser interrumpido, y usa las mismas herramientas que el chat (perfil, PubMed, grafo).
 */
export default function LiveVoice({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<Status>("conectando");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ code: string; completeness: number; status: string } | null>(null);
  const [error, setError] = useState("");
  const cleanup = useRef<() => void>(() => {});

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

    const refreshProfile = () =>
      fetch("/api/chat")
        .then((r) => r.json())
        .then((d) => !cancelled && setProfile(d.profile))
        .catch(() => {});

    const onMessage = async (m: LiveServerMessage) => {
      const sc = m.serverContent;
      if (sc?.interrupted) stopPlayback();
      for (const p of sc?.modelTurn?.parts ?? []) if (p.inlineData?.data) play(p.inlineData.data);
      if (sc?.inputTranscription?.text) add("user", sc.inputTranscription.text);
      if (sc?.outputTranscription?.text) add("agent", sc.outputTranscription.text);
      if (m.toolCall?.functionCalls?.length) {
        setStatus("pensando");
        const responses = await Promise.all(
          m.toolCall.functionCalls.map(async (fc) => {
            setActivity(TOOL_LABELS[fc.name ?? ""] ?? fc.name ?? "");
            const r = await fetch("/api/live/tool", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: fc.name, args: fc.args ?? {} }),
            })
              .then((x) => x.json())
              .catch(() => ({ error: "Falló la herramienta" }));
            return { id: fc.id, name: fc.name, response: r as Record<string, unknown> };
          }),
        );
        setActivity(null);
        session?.sendToolResponse({ functionResponses: responses });
        if (m.toolCall.functionCalls.some((f) => f.name === "update_profile" || f.name === "finalize_profile")) refreshProfile();
      }
    };

    (async () => {
      try {
        const cfg = await fetch("/api/live/token", { method: "POST" }).then((r) => {
          if (!r.ok) throw new Error("token");
          return r.json() as Promise<{ token: string; model: string; systemInstruction: string; tools: FunctionDeclaration[] }>;
        });
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
              setError("Se cortó la conexión con el agente de voz.");
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
        // Que el agente arranque hablando.
        session.sendClientContent({ turns: [{ role: "user", parts: [{ text: "(La persona abrió la conversación por voz. Saludala corto y seguí la entrevista.)" }] }], turnComplete: true });
        refreshProfile();
      } catch {
        setError("No pude arrancar la voz en vivo. Revisá el permiso del micrófono o probá de nuevo.");
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
    pensando: activity ?? "Pensando…",
    hablando: "Rumbo está hablando",
    terminado: "Conversación terminada",
    error: "No se pudo conectar",
  }[status];
  const pct = profile ? (profile.status === "final" ? 100 : Math.round(profile.completeness * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur" role="dialog" aria-label="Conversación por voz">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Conversación por voz · en vivo</span>
          <span className="font-mono text-accent">
            {profile?.code || "···"} · {pct}%
          </span>
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
            Terminar
          </button>
          {profile?.status === "final" && (
            <a href="/perfil" className="rounded-full bg-accent px-7 py-3 font-medium text-background">
              Ver mi perfil
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
