import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, type AgentEvent } from "@/lib/agent/run";
import { completeness, riasecCode, shouldStop, type ProfileData } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 300;

type Msg = Anthropic.Beta.BetaMessageParam;

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { message, wantsResults } = (await req.json()) as { message?: string; wantsResults?: boolean };

  const [{ data: conv }, { data: prof }] = await Promise.all([
    supabase.from("conversations").select("messages").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("data,status,question_count").eq("user_id", user.id).maybeSingle(),
  ]);
  const history: Msg[] = (conv?.messages as Msg[]) ?? [];
  const isStart = history.length === 0;
  let questionCount = prof?.question_count ?? 0;

  if (isStart) {
    history.push({ role: "user", content: "Hola, quiero empezar mi orientación vocacional." });
  } else {
    if (!message?.trim()) return new Response("Mensaje vacío", { status: 400 });
    history.push({ role: "user", content: message.trim().slice(0, 2000) });
    questionCount += 1;
  }

  // Condición de parada: la decide el servidor, no el modelo.
  const stop = wantsResults ? "user" : shouldStop(prof?.data as ProfileData | null, questionCount);
  if (stop && prof?.status !== "final") {
    const why = {
      user: "el usuario pidió ver sus resultados",
      confidence: "todas las dimensiones superaron el umbral de confianza y el top 3 se mantuvo estable",
      max_questions: "se llegó al máximo de preguntas",
    }[stop];
    // Mensaje de sistema a mitad de conversación (no rompe el caché del historial).
    history.push({
      role: "system",
      content: `El perfil está listo para cerrar (${why}). No hagas más preguntas: buscá opciones reales con web_search, llamá a finalize_profile y escribí el cierre.`,
    });
  }

  await supabase
    .from("profiles")
    .upsert({ user_id: user.id, data: prof?.data ?? {}, status: prof?.status ?? "in_progress", question_count: questionCount });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent | Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      await runAgent({ history, userId: user.id, supabase, emit });

      await supabase.from("conversations").upsert({ user_id: user.id, messages: history, updated_at: new Date().toISOString() });
      const { data: after } = await supabase
        .from("profiles")
        .select("data,status,question_count")
        .eq("user_id", user.id)
        .maybeSingle();
      const p = after?.data as ProfileData | null;
      emit({
        type: "profile",
        status: after?.status,
        questionCount: after?.question_count ?? questionCount,
        completeness: after?.status === "final" ? 1 : completeness(p),
        code: riasecCode(p),
      });
      controller.close();
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}

/** Historial visible para la UI (solo texto de usuario y asistente). */
export async function GET() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });
  const [{ data: conv }, { data: prof }] = await Promise.all([
    supabase.from("conversations").select("messages").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("data,status,question_count").eq("user_id", user.id).maybeSingle(),
  ]);
  const visible: { role: "user" | "assistant"; text: string }[] = [];
  let lastChoices: { question: string; options: string[] } | null = null;
  for (const m of ((conv?.messages as Msg[]) ?? []).slice(1)) {
    if (m.role === "system") continue;
    if (typeof m.content === "string") {
      visible.push({ role: m.role, text: m.content });
      lastChoices = null;
      continue;
    }
    for (const b of m.content) {
      if (b.type === "text" && b.text.trim()) visible.push({ role: m.role, text: b.text });
      if (b.type === "tool_use" && b.name === "offer_choices") {
        lastChoices = b.input as { question: string; options: string[] };
        visible.push({ role: "assistant", text: lastChoices.question });
      }
    }
  }
  const p = prof?.data as ProfileData | null;
  return Response.json({
    messages: visible,
    choices: lastChoices,
    profile: {
      status: prof?.status ?? "in_progress",
      questionCount: prof?.question_count ?? 0,
      completeness: prof?.status === "final" ? 1 : completeness(p),
      code: riasecCode(p),
    },
  });
}
