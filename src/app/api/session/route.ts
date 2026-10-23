import { z } from "zod";
import { body, fail } from "@/lib/api";
import { logEvent } from "@/lib/events";
import { llm } from "@/lib/llm/provider";
import { AGE_MIN, MIN_AGE, greet, newSession } from "@/lib/engine/turn";
import { clearSessionCookie, loadSession, publicView, setSessionCookie } from "@/lib/session";
import { store } from "@/lib/store";
import { browserPreviewEnabled, previewEnvelope } from "@/lib/preview-session";
import { hasSupabase, supabaseServer } from "@/lib/supabase/server";

const Create = z.object({
  ageRange: z.enum(["A14_15", "A16_17", "A18_21", "A22_25", "A26_MAS"]),
  consent: z.literal(true),
  guardianConsent: z.boolean().optional(),
});

/** Crear sesión: consentimiento + rango de edad (R1, R2). Sin nombre, email ni teléfono. */
export async function POST(req: Request) {
  const input = await body(req, Create);
  if (input instanceof Response) return input;
  if (AGE_MIN[input.ageRange] < MIN_AGE && !input.guardianConsent) {
    return fail(403, "guardian_required", "Para tu rango de edad necesitamos que un adulto responsable confirme el consentimiento.");
  }
  let userId: string | undefined;
  if (hasSupabase()) {
    const { data } = await (await supabaseServer()).auth.getUser();
    userId = data.user?.id;
  }
  const provider = llm();
  const s = newSession({ ageRange: input.ageRange, guardianConsent: Boolean(input.guardianConsent), model: provider.model, userId });
  await greet(provider, s);
  s.model = provider.model;
  if (!browserPreviewEnabled()) {
    await store().save(s);
    await setSessionCookie(s);
  }
  logEvent("session.created", { session: s.id, llm: provider.name, store: browserPreviewEnabled() ? "browser-preview" : store().kind });
  return Response.json({ ...publicView(s), ...previewEnvelope(s) });
}

export async function GET() {
  const s = await loadSession();
  if (!s) return fail(404, "no_session", "No hay sesión.");
  return Response.json(publicView(s));
}

/** Borrar mis datos (R16): se elimina todo y se audita sin guardar el contenido. */
export async function DELETE() {
  const s = await loadSession();
  if (s) {
    await store().remove(s.id);
    await store().audit("deletion.completed", s.id, { messages: s.messages.length, evidence: s.evidence.length });
    logEvent("deletion.completed", { session: s.id });
  }
  await clearSessionCookie();
  return Response.json({ deleted: Boolean(s) });
}
