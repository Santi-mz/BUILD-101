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

/** Lee un texto en voz alta con una voz en español (prefiere Uruguay o Argentina). */
export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*_#`>]/g, "").trim();
  if (!clean) return;
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((v) => v.lang === "es-UY") ??
    voices.find((v) => v.lang === "es-AR") ??
    voices.find((v) => v.lang.startsWith("es-4") || v.lang === "es-US" || v.lang === "es-MX") ??
    voices.find((v) => v.lang.startsWith("es"));
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = voice?.lang ?? "es-UY";
  if (voice) u.voice = voice;
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export const stopSpeaking = () => typeof window !== "undefined" && window.speechSynthesis?.cancel();
