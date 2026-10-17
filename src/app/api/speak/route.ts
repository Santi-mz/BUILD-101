import { supabaseServer } from "@/lib/supabase/server";
import { synthesize } from "@/lib/tts";

export const maxDuration = 60;

/** Texto a voz natural para las respuestas del agente. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { text } = (await req.json()) as { text?: string };
  const clean = (text ?? "").replace(/[*_#`>]/g, "").trim().slice(0, 600);
  if (!clean) return Response.json({ error: "Sin texto" }, { status: 400 });
  try {
    const { audio, mimeType } = await synthesize(clean);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": mimeType, "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "No pude generar la voz" }, { status: 502 });
  }
}
