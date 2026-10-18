import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { logEvent } from "@/lib/events";
import { findVerifiedMentors, hasMentorConsent } from "@/lib/agents/mentors";
import { newId } from "@/lib/engine/profile";

const Req = z.object({ pathId: z.string().max(80) });

/** find_verified_mentors (A5). Sin ruta elegida y consentimiento devuelve 403. */
export async function POST(req: Request) {
  const input = await body(req, Req);
  if (input instanceof Response) return input;
  return withSession(async (s) => {
    if (!hasMentorConsent(s, input.pathId)) logEvent("mentor.consent.required", { session: s.id, path: input.pathId });
    const t = { taskId: newId("task"), type: "FIND_MENTORS" as const, agent: "A5" as const, status: "running" as const, createdAt: new Date().toISOString() };
    const result = await findVerifiedMentors(s, input.pathId); // lanza ConsentError (403) si falta algo
    s.tasks.push({ ...t, status: "completed", finishedAt: new Date().toISOString(), summary: `${result.matches.length} perfiles DEMO; reales: 0` });
    s.mentorResult = result;
    s.phase = "MATCHING_HUMANS";
    logEvent("mentor.search.demo", { session: s.id, path: input.pathId, matches: result.matches.length });
  }, req);
}
