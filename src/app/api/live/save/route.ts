import type { Content } from "@google/genai";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Guarda en la conversación los turnos de la charla por voz en vivo (lo que dijo el usuario y lo que respondió
 * Rumbo, transcriptos por Gemini Live), para verlos después en el chat y seguir desde ahí.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { turns } = (await req.json()) as { turns?: { role: "user" | "agent"; text: string }[] };
  const clean = (turns ?? []).map((t) => ({ ...t, text: String(t.text ?? "").trim().slice(0, 4000) })).filter((t) => t.text);
  if (clean.length === 0) return Response.json({ saved: 0 });

  const { data: conv } = await supabase.from("conversations").select("messages").eq("user_id", user.id).maybeSingle();
  const history = (conv?.messages as Content[]) ?? [];
  if (history.length === 0) history.push({ role: "user", parts: [{ text: "Hola, quiero empezar mi orientación vocacional." }] });
  for (const t of clean) history.push({ role: t.role === "user" ? "user" : "model", parts: [{ text: t.text }] });
  await supabase.from("conversations").upsert({ user_id: user.id, messages: history, updated_at: new Date().toISOString() });
  return Response.json({ saved: clean.length });
}
