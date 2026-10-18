import { z } from "zod";
import { body, fail, withSession } from "@/lib/api";
import { askAboutPath, chooseNextStep, currentRoute, selectPath } from "@/lib/agents/pathways";
import { llm } from "@/lib/llm/provider";
import { maskPII } from "@/lib/engine/pii";

const Req = z.object({
  pathId: z.string().max(80).optional(),
  question: z.string().min(2).max(400).optional(),
  nextStep: z.string().max(200).optional(),
});

/** Elegir una ruta, preguntar sobre ella o elegir el próximo paso. */
export async function POST(req: Request) {
  const input = await body(req, Req);
  if (input instanceof Response) return input;
  return withSession(async (s) => {
    if (input.nextStep) {
      chooseNextStep(s, input.nextStep);
      return;
    }
    if (!input.pathId) return fail(400, "bad_request", "Falta la ruta.");
    if (input.question) {
      const r = currentRoute(s, input.pathId);
      if (!r || s.selectedPathId !== input.pathId) return fail(409, "not_selected", "Primero elegí esa ruta.");
      await askAboutPath(llm(), s, r, maskPII(input.question));
      return;
    }
    if (!selectPath(s, input.pathId)) return fail(404, "not_found", "No encontré esa ruta.");
  }, req);
}
