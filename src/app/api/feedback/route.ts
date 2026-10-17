import { z } from "zod";
import { body, withSession } from "@/lib/api";
import { maskPII } from "@/lib/engine/pii";

const Req = z.object({
  usefulness: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  wouldUseAgain: z.boolean(),
  comment: z.string().max(500).optional(),
});

/** Encuesta final opcional (validación del piloto). */
export async function POST(req: Request) {
  const input = await body(req, Req);
  if (input instanceof Response) return input;
  return withSession(async (s) => {
    s.feedback = { ...input, comment: input.comment ? maskPII(input.comment) : undefined, at: new Date().toISOString() };
  });
}
