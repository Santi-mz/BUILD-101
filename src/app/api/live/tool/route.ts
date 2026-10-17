import { connectMcp, genai, webSearch } from "@/lib/agent/run";
import { shouldStop, type ProfileData } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

/** Ejecuta en el servidor una herramienta que pidió el agente de voz (Gemini Live) para el usuario logueado. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { name, args } = (await req.json()) as { name: string; args: Record<string, unknown> };
  try {
    if (name === "web_search") return Response.json({ result: await webSearch(genai(), String(args.query ?? "")) });

    const trail: string[] = [];
    const mcp = await connectMcp(user.id, supabase, trail);
    const res = await mcp.client.callTool({ name, arguments: args ?? {} });
    await mcp.close();
    let out = (res.content as { text?: string }[]).map((c) => c.text ?? "").join("\n");

    const { data: cur } = await supabase.from("profiles").select("data,status,question_count").eq("user_id", user.id).maybeSingle();
    const d = (cur?.data ?? {}) as ProfileData;
    const patch: Record<string, unknown> = {};
    // En voz no hay mensajes de texto que contar: cada actualización del perfil es una respuesta.
    if (name === "update_profile" && !res.isError) patch.question_count = (cur?.question_count ?? 0) + 1;
    if (trail.length) patch.data = { ...d, graph_trail: [...new Set([...(d.graph_trail ?? []), ...trail])].slice(-40) };
    if (Object.keys(patch).length) await supabase.from("profiles").update(patch).eq("user_id", user.id);

    const answers = (patch.question_count as number | undefined) ?? cur?.question_count ?? 0;
    if (name === "update_profile" && cur?.status !== "final") {
      const stop = shouldStop(d.riasec ? d : null, answers);
      if (stop) out += "\n[Sistema] El perfil está listo para cerrar: no hagas más preguntas; navegá el grafo, buscá opciones reales con web_search, llamá a finalize_profile y contale el resultado.";
    }
    return Response.json(res.isError ? { error: out } : { result: out });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "La herramienta falló" });
  }
}
