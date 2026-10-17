import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MODEL } from "@/lib/agent/run";
import { NEWS_FEEDS, fetchFeed } from "@/lib/news-sources";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 300;

const r = z.number().min(0).max(1);
const Tagged = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      relevant: z.boolean().describe("false si no sirve para orientación vocacional, estudio o trabajo"),
      summary: z.string().describe("Una o dos frases en español, qué significa para alguien que elige qué estudiar o dónde trabajar"),
      riasec: z.object({ R: r, I: r, A: r, S: r, E: r, C: r }),
      topics: z.array(z.string()).describe("3 a 5 temas en minúscula"),
    }),
  ),
});

// Lo llama Vercel Cron una vez por día (vercel.json). También se puede correr a mano con el secreto.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const db = supabaseAdmin();

  const raw = (await Promise.all(NEWS_FEEDS.map((f) => fetchFeed(f)))).flat();
  const unique = [...new Map(raw.map((n) => [n.url, n])).values()];
  const { data: existing } = await db.from("news").select("url").in("url", unique.map((n) => n.url));
  const seen = new Set((existing ?? []).map((e) => e.url));
  const fresh = unique.filter((n) => !seen.has(n.url)).slice(0, 40);
  if (fresh.length === 0) return Response.json({ inserted: 0 });

  // La IA resume, filtra y etiqueta cada noticia con pesos RIASEC: sin esto no hay feed personalizado.
  const anthropic = new Anthropic();
  const res = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(Tagged) },
    system:
      "Etiquetás noticias para una app de orientación vocacional en Uruguay. Para cada titular, decidí si es relevante, resumilo y asigná cuánto se relaciona con cada tipo RIASEC de Holland (0 a 1).",
    messages: [
      {
        role: "user",
        content: fresh.map((n, i) => `${i}. [${n.category}] ${n.title} (${n.source})`).join("\n"),
      },
    ],
  });
  const tagged = res.parsed_output?.items ?? [];

  const rows = tagged
    .filter((t) => t.relevant && fresh[t.index])
    .map((t) => ({ ...fresh[t.index], summary: t.summary, riasec: t.riasec, topics: t.topics }));
  const { error } = await db.from("news").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ fetched: raw.length, tagged: tagged.length, inserted: rows.length });
}
