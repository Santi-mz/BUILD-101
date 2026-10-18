import { z } from "zod";
import { body, fail, withSession } from "@/lib/api";
import { llm } from "@/lib/llm/provider";
import { ONE_MORE, runTurn } from "@/lib/engine/turn";
import { optionById } from "@/lib/rubric";
import { feedProfile, publicView } from "@/lib/session";
import { hasSupabase, supabaseServer } from "@/lib/supabase/server";
import type { SessionState } from "@/lib/engine/types";

export const maxDuration = 60;

const Turn = z.object({ message: z.string().max(2000).optional(), close: z.boolean().optional(), optionId: z.string().max(40).optional() });

/** Un turno de la Parte 1 (A0 + analizador + planificador + entrevistador). */
export async function POST(req: Request) {
  const input = await body(req, Turn);
  if (input instanceof Response) return input;
  // Con un botón (optionId) sin texto, el mensaje que queda en la charla es el texto de la opción.
  const optionLabel = input.optionId ? (input.optionId === ONE_MORE.id ? ONE_MORE.label : optionById(input.optionId)?.label) : undefined;
  const text = input.message?.trim() || optionLabel || (input.close ? "Quiero terminar y ver lo que entendiste." : "");
  if (!text) return fail(400, "empty", "Mensaje vacío.");
  return withSession(async (s) => {
    const provider = llm();
    const out = await runTurn(provider, s, text, { forceClose: input.close, optionId: input.optionId });
    s.model = provider.model;
    if (s.status === "COMPLETED" && out.action.type === "CLOSE") await syncFeedProfile(s);
    return Response.json({ ...publicView(s), reply: out.reply, safety: out.safety });
  }, req);
}

/** Si la persona entró con cuenta, el perfil cerrado ordena su feed de noticias. */
async function syncFeedProfile(s: SessionState) {
  if (!hasSupabase() || !s.userId) return;
  try {
    const supabase = await supabaseServer();
    const { data: prev } = await supabase.from("profiles").select("data").eq("user_id", s.userId).maybeSingle();
    await supabase.from("profiles").upsert({
      user_id: s.userId,
      data: { strengths: [], values: [], constraints: {}, evidence: [], ...(prev?.data ?? {}), ...feedProfile(s) },
      status: "final",
      question_count: s.userTurns,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // El feed es opcional: si falla, la sesión sigue igual.
  }
}
