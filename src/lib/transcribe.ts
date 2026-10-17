import { genai, withRetry } from "@/lib/agent/run";

/** Transcribe audio (WAV) a texto con Gemini. Devuelve "" si no se entendió nada. */
export async function transcribe(audio: Buffer, mimeType = "audio/wav", context = "") {
  const res = await withRetry((model) =>
    genai().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: audio.toString("base64") } },
            {
              text: `Transcribí literalmente lo que dice esta persona (español rioplatense de Uruguay, puede usar voseo y modismos).${context ? ` Está respondiendo a esta pregunta de un orientador vocacional: "${context}". Usala solo para desambiguar palabras dudosas, nunca para inventar.` : ""} Devolvé solo el texto, sin comillas ni comentarios. Si no se entiende nada o es silencio, devolvé una cadena vacía.`,
            },
          ],
        },
      ],
    }),
  );
  return (res.text ?? "").trim().replace(/^["“]|["”]$/g, "");
}
