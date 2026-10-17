// Utilidades de voz del lado del navegador.

/**
 * Convierte la grabación del MediaRecorder (webm/ogg/mp4 según el navegador) a WAV mono de 16 kHz,
 * un formato que Gemini acepta siempre y que pesa poco.
 */
export async function toWav16k(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buf], { type: "audio/wav" });
}

/** Voz del navegador: respaldo si falla la voz natural de Gemini. */
function browserSpeak(text: string) {
  if (!("speechSynthesis" in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((v) => v.lang === "es-UY") ??
    voices.find((v) => v.lang === "es-AR") ??
    voices.find((v) => v.lang === "es-US" || v.lang === "es-MX") ??
    voices.find((v) => v.lang.startsWith("es"));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? "es-UY";
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

let current: HTMLAudioElement | null = null;
let turn = 0;

/** Lee la respuesta del agente con la voz natural de Gemini (/api/speak); si falla, usa la del navegador. */
export async function speak(text: string) {
  if (typeof window === "undefined") return;
  stopSpeaking();
  const clean = text.replace(/[*_#`>]/g, "").trim();
  if (!clean) return;
  const mine = ++turn;
  try {
    const res = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }) });
    if (!res.ok) throw new Error(String(res.status));
    const url = URL.createObjectURL(await res.blob());
    if (mine !== turn) return; // ya se pidió otra cosa
    current = new Audio(url);
    current.onended = () => URL.revokeObjectURL(url);
    await current.play();
  } catch {
    if (mine === turn) browserSpeak(clean);
  }
}

export function stopSpeaking() {
  if (typeof window === "undefined") return;
  turn++;
  current?.pause();
  current = null;
  window.speechSynthesis?.cancel();
}

// Dictado en vivo del navegador (Chrome, Edge, Safari): muestra el texto mientras hablás.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** Arranca el dictado en vivo si el navegador lo soporta. Devuelve la función para cortarlo, o null. */
export function startDictation(onText: (text: string) => void): (() => void) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "es-UY";
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (e) => onText(Array.from(e.results, (r) => r[0].transcript).join(" ").trim());
  rec.onerror = () => {};
  try {
    rec.start();
  } catch {
    return null;
  }
  return () => {
    try {
      rec.stop();
    } catch {}
  };
}
