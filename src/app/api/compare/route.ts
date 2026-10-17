import { z } from "zod";
import { genai, withRetry } from "@/lib/agent/run";
import { affinity, occupationFacts } from "@/lib/graph";
import type { ProfileData } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 60;

const Comparison = z.object({
  summary: z.string().describe("Dos o tres frases, en segunda persona y rioplatense, sobre qué camino le conviene más y por qué"),
  rows: z
    .array(z.object({ aspect: z.string(), a: z.string(), b: z.string() }))
    .describe("4 a 6 filas: afinidad con tus intereses, qué hay que estudiar, cuánto tiempo de preparación, habilidades que ya tenés, qué te faltaría, cómo es el día a día"),
  first_step: z.string().describe("Un primer paso concreto que puede hacer esta semana en Uruguay"),
});

/** Compara dos ocupaciones del grafo de carreras contra el perfil del usuario. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const { a, b } = (await req.json()) as { a?: string; b?: string };
  const fa = a ? occupationFacts(a) : null;
  const fb = b ? occupationFacts(b) : null;
  if (!fa || !fb || a === b) return Response.json({ error: "Elegí dos ocupaciones distintas." }, { status: 400 });

  const { data: prof } = await supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle();
  const p = prof?.data as ProfileData | null;
  if (!p?.riasec) return Response.json({ error: "Primero armá tu perfil en el chat." }, { status: 400 });
  const scores = Object.fromEntries(Object.entries(p.riasec).map(([k, v]) => [k, v.score]));

  const facts = {
    perfil: { riasec: scores, fortalezas: p.strengths, valores: p.values, condiciones: p.constraints, resumen: p.summary },
    A: { ...fa, afinidad: `${affinity(scores, fa.id)}%` },
    B: { ...fb, afinidad: `${affinity(scores, fb.id)}%` },
  };
  try {
    const res = await withRetry((model) =>
      genai().models.generateContent({
        model,
        contents: `Compará estos dos caminos para esta persona. Usá solo estos datos (vienen del grafo de ocupaciones O*NET y de su perfil); no inventes cifras.\n${JSON.stringify(facts)}`,
        config: {
          systemInstruction: "Sos un orientador vocacional en Uruguay. Comparás dos ocupaciones de forma honesta y concreta para un joven.",
          responseMimeType: "application/json",
          responseJsonSchema: z.toJSONSchema(Comparison),
        },
      }),
    );
    const out = Comparison.parse(JSON.parse(res.text ?? "{}"));
    return Response.json({ ...out, a: { name: fa.name, affinity: affinity(scores, fa.id) }, b: { name: fb.name, affinity: affinity(scores, fb.id) } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "No pude comparar ahora. Probá en un minuto." }, { status: 502 });
  }
}
