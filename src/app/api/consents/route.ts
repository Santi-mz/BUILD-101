import { z } from "zod";
import { body, fail, withSession } from "@/lib/api";
import { logEvent } from "@/lib/events";
import { CONSENT_VERSION } from "@/lib/engine/turn";

const Req = z.object({ purpose: z.literal("mentors"), pathId: z.string().max(80), action: z.enum(["grant", "withdraw"]) });

/** manage_consent: permiso específico para buscar personas con experiencia en una ruta elegida. */
export async function POST(req: Request) {
  const input = await body(req, Req);
  if (input instanceof Response) return input;
  return withSession(async (s) => {
    if (s.selectedPathId !== input.pathId) return fail(409, "not_selected", "Primero elegí esa ruta.");
    s.consents.push({ purpose: "mentors", version: CONSENT_VERSION, status: input.action === "grant" ? "granted" : "withdrawn", at: new Date().toISOString(), pathId: input.pathId });
    if (input.action === "withdraw") s.mentorResult = null;
    logEvent(input.action === "grant" ? "mentor.consent.granted" : "mentor.consent.required", { session: s.id, path: input.pathId });
  }, req);
}
