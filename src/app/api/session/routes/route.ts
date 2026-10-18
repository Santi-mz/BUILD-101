import { z } from "zod";
import { body, fail, withSession } from "@/lib/api";
import { rejectAll, researchPaths, suggestedFilters } from "@/lib/agents/pathways";

const Req = z.object({
  action: z.enum(["research", "reject"]).default("research"),
  filters: z
    .object({
      country: z.literal("UY"),
      modality: z.enum(["cualquiera", "presencial", "distancia"]),
      schedule: z.enum(["cualquiera", "nocturno"]),
      cost: z.enum(["cualquiera", "gratuito"]),
    })
    .optional(),
});

/** Pedir rutas (A2 → A3 → A4) o "Ninguna me convence". Solo después de cerrar la Parte 1. */
export async function POST(req: Request) {
  const input = await body(req, Req);
  if (input instanceof Response) return input;
  return withSession(async (s) => {
    if (input.action === "reject") {
      rejectAll(s);
      return;
    }
    if (s.status !== "COMPLETED") return fail(409, "not_ready", "Primero terminemos de charlar para entender qué te interesa.");
    await researchPaths(s, input.filters ?? suggestedFilters(s));
  }, req);
}
