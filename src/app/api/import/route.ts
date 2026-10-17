import type { Content } from "@google/genai";
import { extractFromGithub, extractFromPdf, importNote, type Extracted, type ImportSource } from "@/lib/imports";
import type { ProfileData } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;
const MAX_PDF_BYTES = 4 * 1024 * 1024; // límite de cuerpo de Vercel: 4.5 MB

/**
 * Importa datos de otra app (CV / LinkedIn en PDF, o GitHub), los extrae con IA,
 * los guarda en el perfil y los suma a la conversación para que el agente los use.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const form = await req.formData();
  const source = form.get("source") as ImportSource | null;
  let extracted: Extracted;
  try {
    if (source === "cv") {
      const file = form.get("file");
      if (!(file instanceof File) || file.type !== "application/pdf") return Response.json({ error: "Subí un archivo PDF." }, { status: 400 });
      if (file.size > MAX_PDF_BYTES) return Response.json({ error: "El PDF pesa más de 4 MB." }, { status: 400 });
      extracted = await extractFromPdf(Buffer.from(await file.arrayBuffer()));
    } else if (source === "github") {
      const username = String(form.get("username") ?? "").trim().replace(/^@/, "");
      if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) return Response.json({ error: "Ese usuario de GitHub no es válido." }, { status: 400 });
      extracted = await extractFromGithub(username);
    } else {
      return Response.json({ error: "Fuente desconocida." }, { status: 400 });
    }
  } catch (err) {
    console.error(err);
    return Response.json({ error: err instanceof Error && err.message.length < 120 ? err.message : "No pude leer esa fuente. Probá de nuevo." }, { status: 502 });
  }

  const [{ data: conv }, { data: prof }] = await Promise.all([
    supabase.from("conversations").select("messages").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("data,status,question_count").eq("user_id", user.id).maybeSingle(),
  ]);
  const history = (conv?.messages as Content[]) ?? [];
  if (history.length === 0) history.push({ role: "user", parts: [{ text: "Hola, quiero empezar mi orientación vocacional." }] });
  history.push({ role: "user", parts: [{ text: importNote(source, extracted) }] });

  const data = (prof?.data ?? {}) as ProfileData;
  const imports = [...(data.imports ?? []).filter((i) => i.source !== source), { source, summary: extracted.summary, at: new Date().toISOString() }];

  await Promise.all([
    supabase.from("conversations").upsert({ user_id: user.id, messages: history, updated_at: new Date().toISOString() }),
    supabase.from("profiles").upsert({
      user_id: user.id,
      data: { ...data, imports },
      status: prof?.status ?? "in_progress",
      question_count: prof?.question_count ?? 0,
    }),
  ]);

  return Response.json({ summary: extracted.summary, skills: extracted.skills.slice(0, 6) });
}
