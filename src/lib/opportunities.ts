import { z } from "zod";
import { genai, withRetry } from "@/lib/agent/run";

// Oportunidades concretas y abiertas: becas, pasantías, empleos y cursos, en Uruguay o en el exterior.
export const OPPORTUNITY_KINDS = ["beca", "pasantia", "empleo", "curso"] as const;
export const OPPORTUNITY_SCOPES = ["nacional", "internacional"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];
export type OpportunityScope = (typeof OPPORTUNITY_SCOPES)[number];

export const Opportunity = z.object({
  kind: z.enum(OPPORTUNITY_KINDS),
  scope: z.enum(OPPORTUNITY_SCOPES),
  title: z.string().describe("Nombre de la convocatoria, beca, pasantía o puesto"),
  org: z.string().describe("Institución, empresa u organismo que la ofrece"),
  url: z.string().describe("URL de la convocatoria, copiada EXACTA de las fuentes"),
  deadline: z.string().optional().describe("Fecha de cierre si aparece en la fuente (ej: 30/11/2026); si no, omitir"),
  location: z.string().optional().describe("Ciudad o país, o 'remoto'"),
  why: z.string().describe("Por qué le sirve a esta persona, en una línea, en segunda persona"),
});
export type Opportunity = z.infer<typeof Opportunity>;

const KIND_QUERY: Record<OpportunityKind, string> = {
  beca: "becas abiertas convocatoria 2026",
  pasantia: "pasantías para estudiantes convocatoria abierta",
  empleo: "ofertas de empleo para jóvenes sin experiencia o junior",
  curso: "cursos gratuitos o becados inscripciones abiertas",
};
const LABEL: Record<OpportunityKind, string> = { beca: "becas", pasantia: "pasantías", empleo: "empleos", curso: "cursos" };

// Fuentes públicas oficiales que se leen directo cuando la búsqueda en Google no está disponible
// (por ejemplo, si se agotó la cuota gratis). Todas verificadas el 17/10/2026.
const OFFICIAL_SOURCES: { name: string; url: string; kinds: OpportunityKind[]; scope: OpportunityScope }[] = [
  { name: "AUCI · Becas para uruguayos en el exterior", url: "https://www.gub.uy/agencia-uruguaya-cooperacion-internacional/becas", kinds: ["beca"], scope: "internacional" },
  { name: "Fundación Carolina", url: "https://www.fundacioncarolina.es/formacion/", kinds: ["beca"], scope: "internacional" },
  { name: "DAAD (Alemania)", url: "https://www.daad.de/en/studying-in-germany/scholarships/", kinds: ["beca"], scope: "internacional" },
  { name: "Erasmus+", url: "https://erasmus-plus.ec.europa.eu/opportunities/opportunities-for-individuals/students", kinds: ["beca", "pasantia"], scope: "internacional" },
  { name: "Fulbright Uruguay", url: "https://fulbright.org.uy/", kinds: ["beca"], scope: "internacional" },
  { name: "ANII · Formación", url: "https://www.anii.org.uy/apoyos/formacion/", kinds: ["beca"], scope: "nacional" },
  { name: "Fondo de Solidaridad", url: "https://www.fondodesolidaridad.edu.uy/becas", kinds: ["beca"], scope: "nacional" },
  { name: "Udelar · Becas", url: "https://becas.udelar.edu.uy/", kinds: ["beca"], scope: "nacional" },
  { name: "INEFOP · Cursos", url: "https://www.inefop.uy/cursos", kinds: ["curso"], scope: "nacional" },
  { name: "INJU", url: "https://www.gub.uy/ministerio-desarrollo-social/inju", kinds: ["pasantia", "empleo", "curso"], scope: "nacional" },
];

/** Lee una página: texto visible y links (absolutos) para que la IA extraiga convocatorias. */
async function readPage(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (RumboBot; orientacion vocacional)" }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) return null;
  const html = await res.text();
  const links = [...html.matchAll(/<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => {
      try {
        return { url: new URL(m[1], url).toString(), text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() };
      } catch {
        return null;
      }
    })
    .filter((l): l is { url: string; text: string } => Boolean(l && l.text.length > 8 && l.url.startsWith("http")))
    .slice(0, 80);
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 5000);
  return { url, text, links };
}

/** Busca en Google (grounding de Gemini) y devuelve el texto encontrado y las URLs reales de las fuentes. */
async function groundedSearch(query: string) {
  const res = await withRetry((model) =>
    genai().models.generateContent({
      model,
      contents: `Buscá convocatorias ABIERTAS o vigentes (fecha de hoy: ${new Date().toISOString().slice(0, 10)}) para: ${query}. Para cada una: nombre, institución, requisitos clave, fecha de cierre si figura y la URL exacta de la página de la convocatoria.`,
      config: { tools: [{ googleSearch: {} }] },
    }),
  );
  const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
    .map((w) => ({ title: w.title ?? "", url: w.uri }));
  return { text: res.text ?? "", sources };
}

/**
 * Busca oportunidades reales para un perfil. Solo devuelve las que tienen una URL de las fuentes de la
 * búsqueda (así no hay links inventados).
 */
export async function findOpportunities(opts: {
  profile: string; // resumen del perfil e intereses, en texto
  keywords: string[];
  kinds: OpportunityKind[];
  scope: OpportunityScope;
  news?: { title: string; url: string; category: string | null }[]; // noticias reales de la base (pasantías, empleo, becas)
}) {
  const where = opts.scope === "nacional" ? "en Uruguay" : "internacionales para estudiantes o jóvenes de Uruguay o Latinoamérica";
  let searches: { text: string; sources: { title: string; url: string }[] }[] = [];
  try {
    searches = await Promise.all(
      opts.kinds.map((k) => groundedSearch(`${KIND_QUERY[k]} ${where} relacionadas con ${opts.keywords.slice(0, 4).join(", ") || "su perfil"}`)),
    );
  } catch (err) {
    console.warn("Búsqueda en Google no disponible, uso fuentes oficiales:", err instanceof Error ? err.message.slice(0, 120) : err);
  }
  if (searches.flatMap((s) => s.sources).length === 0) {
    // Respaldo: páginas oficiales leídas directo + noticias reales de la base.
    const pages = (
      await Promise.all(OFFICIAL_SOURCES.filter((src) => src.scope === opts.scope && src.kinds.some((k) => opts.kinds.includes(k))).map((src) => readPage(src.url).catch(() => null)))
    ).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const news = opts.scope === "nacional" ? (opts.news ?? []) : [];
    searches = [
      ...pages.map((p) => ({
        text: `Página oficial ${p.url}:\n${p.text}\nLinks:\n${p.links.map((l) => `${l.text} -> ${l.url}`).join("\n")}`,
        sources: [{ title: p.url, url: p.url }, ...p.links.map((l) => ({ title: l.text, url: l.url }))],
      })),
      ...(news.length
        ? [{ text: `Noticias reales recientes:\n${news.map((n) => `[${n.category}] ${n.title} -> ${n.url}`).join("\n")}`, sources: news.map((n) => ({ title: n.title, url: n.url })) }]
        : []),
    ];
  }
  const sources = searches.flatMap((s) => s.sources);
  if (sources.length === 0) return [];

  const schema = z.object({ items: z.array(Opportunity) });
  const res = await withRetry((model) =>
    genai().models.generateContent({
      model,
      contents: `Perfil de la persona: ${opts.profile}\n\nResultados de búsqueda (${opts.kinds.map((k) => LABEL[k]).join(", ")}, ${opts.scope}):\n${searches
        .map((s) => s.text)
        .join("\n---\n")}\n\nFuentes (usá SOLO estas URLs, copiadas exactas):\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}\n\nDevolvé hasta 6 oportunidades concretas, abiertas o recurrentes, que le sirvan a esta persona. No inventes fechas ni URLs.`,
      config: {
        systemInstruction: "Extraés oportunidades reales para jóvenes (becas, pasantías, empleos, cursos). Solo datos presentes en el texto y las fuentes.",
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(schema),
      },
    }),
  );
  const items = schema.parse(JSON.parse(res.text ?? "{}")).items;
  const allowed = new Set(sources.map((s) => s.url));
  // Control de calidad: descartar cualquier URL que no salga de las fuentes de la búsqueda.
  return items
    .filter((o) => allowed.has(o.url) && opts.kinds.includes(o.kind) && !isExpired(o.deadline))
    .map((o) => ({ ...o, scope: opts.scope }));
}

/** true si la fecha de cierre (dd/mm/aaaa) ya pasó. Sin fecha o con formato desconocido: se conserva. */
export function isExpired(deadline?: string) {
  const m = deadline?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return false;
  const end = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59);
  return end.getTime() < Date.now();
}

/** Une oportunidades nuevas con las guardadas, sin repetir URLs (las nuevas primero). */
export function mergeOpportunities(current: Opportunity[] = [], fresh: Opportunity[] = []) {
  const seen = new Set<string>();
  return [...fresh, ...current].filter((o) => !isExpired(o.deadline)).filter((o) => (seen.has(o.url) ? false : (seen.add(o.url), true))).slice(0, 30);
}
