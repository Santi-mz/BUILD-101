import { ApiError } from "@google/genai";
import { genai } from "@/lib/agent/run";

// Modelos de voz natural de Gemini (plan gratis), en orden de preferencia.
const TTS_MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts", "gemini-2.5-flash-preview-tts"];

/** Convierte texto a voz natural con Gemini. Devuelve el audio (WAV) listo para reproducir. */
export async function synthesize(text: string) {
  const prompt = `Leé esto como un orientador vocacional joven, cálido y cercano, con acento rioplatense de Uruguay, a ritmo natural:\n${text}`;
  let last: unknown;
  for (const model of TTS_MODELS) {
    try {
      const res = await genai().models.generateContent({
        model,
        contents: prompt,
        config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
      });
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (part?.inlineData?.data) return { audio: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType ?? "audio/wav" };
    } catch (err) {
      last = err;
      if (!(err instanceof ApiError && (err.status === 503 || err.status === 429 || err.status === 404))) throw err;
    }
  }
  throw last ?? new Error("Sin audio");
}
