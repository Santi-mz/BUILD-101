import { GoogleGenAI } from "@google/genai";
import { fail } from "@/lib/api";
import { LIVE_INSTRUCTION, LIVE_MODEL, LIVE_TOOLS } from "@/lib/agent/live";
import { loadSession } from "@/lib/session";

/**
 * Da al navegador un token temporal de un solo uso para Gemini Live (la clave nunca sale del servidor),
 * junto con las instrucciones y la herramienta que conecta la voz con el motor de la entrevista.
 */
export async function POST() {
  const s = await loadSession();
  if (!s) return fail(404, "no_session", "No hay una sesión activa. Empezá de nuevo desde el inicio.");
  if (s.status !== "ACTIVE") return fail(409, "closed", "La charla ya terminó.");
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.keyvercel;
  if (!apiKey) return fail(503, "no_key", "La voz en vivo necesita la clave de Gemini.");

  try {
    const admin = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
    const token = await admin.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    });
    return Response.json({ token: token.name, model: LIVE_MODEL, systemInstruction: LIVE_INSTRUCTION, tools: LIVE_TOOLS });
  } catch (err) {
    console.error(JSON.stringify({ event: "live.token_error", error: String(err).slice(0, 200) }));
    return fail(502, "live_unavailable", "No pude arrancar la voz en vivo. Probá de nuevo en un momento.");
  }
}
