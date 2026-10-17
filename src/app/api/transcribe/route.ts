import { supabaseServer } from "@/lib/supabase/server";
import { transcribe } from "@/lib/transcribe";

export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024; // ~2 minutos de WAV mono a 16 kHz; límite de cuerpo de Vercel 4.5 MB

/** Voz a texto para el chat: el navegador manda WAV y Gemini lo transcribe. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const audio = Buffer.from(await req.arrayBuffer());
  if (audio.length === 0) return Response.json({ error: "No llegó audio." }, { status: 400 });
  if (audio.length > MAX_BYTES) return Response.json({ error: "El audio es muy largo. Probá con algo más corto." }, { status: 400 });
  try {
    const context = decodeURIComponent(req.headers.get("x-rumbo-pregunta") ?? "").slice(0, 400);
    const text = await transcribe(audio, req.headers.get("content-type") ?? "audio/wav", context);
    return Response.json({ text });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "No pude entender el audio. Probá de nuevo." }, { status: 502 });
  }
}
