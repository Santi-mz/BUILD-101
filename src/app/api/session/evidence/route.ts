import { z } from "zod";
import { body, fail, withSession } from "@/lib/api";
import { logEvent } from "@/lib/events";
import { setEvidenceStatus } from "@/lib/engine/profile";

const Patch = z.object({ id: z.string().max(80), status: z.enum(["REJECTED", "CONFIRMED"]) });

/** Panel "Lo que voy entendiendo": "no es así" o "sí, es así" (R13, R7). */
export async function POST(req: Request) {
  const input = await body(req, Patch);
  if (input instanceof Response) return input;
  return withSession(async (s) => {
    if (!setEvidenceStatus(s, input.id, input.status)) return fail(404, "not_found", "No encontré ese dato.");
    logEvent(input.status === "REJECTED" ? "profile.corrected" : "profile.updated", { session: s.id });
  });
}
