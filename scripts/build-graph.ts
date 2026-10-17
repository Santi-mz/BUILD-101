/**
 * Arma el grafo de carreras de Rumbo a partir de O*NET 31.0 (onetcenter.org, licencia CC BY 4.0)
 * y traduce los nombres al español con Gemini. Escribe src/data/career-graph.json.
 *
 * Uso: npx tsx --env-file=.env.local scripts/build-graph.ts <carpeta db_31_0_text>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { genai, withRetry } from "../src/lib/agent/run";
import type { CareerGraph } from "../src/lib/graph";

const dir = process.argv[2];
const rows = (file: string) =>
  readFileSync(join(dir, `${file}.txt`), "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((l) => l.split("\t"));

const RIASEC: Record<string, string> = { Realistic: "R", Investigative: "I", Artistic: "A", Social: "S", Enterprising: "E", Conventional: "C" };
const IMPORTANT = 3.5; // importancia mínima (escala 1-5) para crear una arista

async function translate(items: string[], what: string): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const schema = z.object({ es: z.array(z.string()) });
    const res = await withRetry((model) =>
      genai().models.generateContent({
        model,
        contents: `Traducí al español rioplatense neutro estos ${what} de la base O*NET, en el mismo orden, uno por elemento (exactamente ${chunk.length}). Usá el nombre con que se conoce en Uruguay, corto, sin explicaciones:\n${JSON.stringify(chunk)}`,
        config: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema) },
      }),
    );
    const es = schema.parse(JSON.parse(res.text ?? "{}")).es;
    if (es.length !== chunk.length) throw new Error(`Traducción incompleta de ${what}: ${es.length}/${chunk.length}`);
    out.push(...es);
    console.log(`  ${what}: ${out.length}/${items.length}`);
  }
  return out;
}

async function main() {
  const occData = rows("Occupation Data");
  const occ = new Map(occData.map(([code, title, description]) => [code, { title, description }]));

  // Vector RIASEC (escala O*NET 1-7 normalizada a 0-1)
  const riasec = new Map<string, Record<string, number>>();
  for (const [code, , name, scale, value] of rows("Career Interest Types")) {
    if (scale !== "OI" || !RIASEC[name]) continue;
    const v = riasec.get(code) ?? {};
    v[RIASEC[name]] = Math.round(((Number(value) - 1) / 6) * 100) / 100;
    riasec.set(code, v);
  }
  const codes = [...occ.keys()].filter((c) => riasec.get(c) && Object.keys(riasec.get(c)!).length === 6);

  const zone = new Map(rows("Job Zones").map(([code, z]) => [code, Number(z)]));

  const importance = (file: string, prefix: string) => {
    const names = new Map<string, string>();
    const edges: [string, string, number][] = [];
    for (const [code, id, name, scale, value] of rows(file)) {
      if (scale !== "IM") continue;
      names.set(`${prefix}:${id}`, name);
      if (Number(value) >= IMPORTANT) edges.push([`occ:${code}`, `${prefix}:${id}`, Math.round(Number(value) * 10) / 10]);
    }
    return { names, edges };
  };
  const skills = importance("Essential Skills", "skill");
  const knowledge = importance("Knowledge", "know");

  const related: [string, string, number][] = [];
  for (const [code, rel, tier] of rows("Related Occupations")) {
    if (tier === "Supplemental" || !codes.includes(code) || !codes.includes(rel)) continue;
    related.push([`occ:${code}`, `occ:${rel}`, tier === "Primary-Short" ? 1 : 0.7]);
  }

  console.log(`Ocupaciones: ${codes.length}, habilidades: ${skills.names.size}, conocimientos: ${knowledge.names.size}`);
  const titlesEs = await translate(codes.map((c) => occ.get(c)!.title), "nombres de ocupaciones");
  const skillIds = [...skills.names.keys()];
  const skillEs = await translate(skillIds.map((id) => skills.names.get(id)!), "nombres de habilidades");
  const knowIds = [...knowledge.names.keys()];
  const knowEs = await translate(knowIds.map((id) => knowledge.names.get(id)!), "áreas de conocimiento o estudio");

  const graph: CareerGraph = {
    source: "O*NET 31.0 Database, U.S. Department of Labor/Employment and Training Administration (USDOL/ETA), CC BY 4.0. Traducción al español con IA.",
    nodes: [
      ...Object.entries(RIASEC).map(([en, id]) => ({ id: `riasec:${id}`, kind: "riasec" as const, name: id, en })),
      ...codes.map((c, i) => ({
        id: `occ:${c}`,
        kind: "occupation" as const,
        name: titlesEs[i],
        en: occ.get(c)!.title,
        description: occ.get(c)!.description,
        riasec: riasec.get(c)!,
        zone: zone.get(c) ?? null,
      })),
      ...skillIds.map((id, i) => ({ id, kind: "skill" as const, name: skillEs[i], en: skills.names.get(id)! })),
      ...knowIds.map((id, i) => ({ id, kind: "knowledge" as const, name: knowEs[i], en: knowledge.names.get(id)! })),
    ],
    edges: [
      ...codes.flatMap((c) =>
        Object.entries(riasec.get(c)!)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 2)
          .map(([k, v]) => ({ from: `occ:${c}`, to: `riasec:${k}`, rel: "interest" as const, w: v })),
      ),
      ...skills.edges.map(([from, to, w]) => ({ from, to, rel: "skill" as const, w })),
      ...knowledge.edges.map(([from, to, w]) => ({ from, to, rel: "knowledge" as const, w })),
      ...related.map(([from, to, w]) => ({ from, to, rel: "related" as const, w })),
    ],
  };
  mkdirSync("src/data", { recursive: true });
  writeFileSync("src/data/career-graph.json", JSON.stringify(graph));
  console.log(`Listo: ${graph.nodes.length} nodos, ${graph.edges.length} aristas`);
}

main();
