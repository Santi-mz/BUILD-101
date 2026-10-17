// Cliente mínimo de NCBI E-utilities (PubMed). Gratis; con NCBI_API_KEY sube el límite de 3 a 10 req/s.
const BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export type PubmedArticle = {
  pmid: string;
  title: string;
  journal: string;
  year: string;
  authors: string;
  abstract: string;
  url: string;
};

function params(extra: Record<string, string>) {
  const p = new URLSearchParams({ db: "pubmed", tool: "rumbo", ...extra });
  if (process.env.NCBI_API_KEY) p.set("api_key", process.env.NCBI_API_KEY);
  return p.toString();
}

export async function searchPubmed(query: string, max = 5): Promise<PubmedArticle[]> {
  const search = await fetch(
    `${BASE}/esearch.fcgi?${params({ term: query, retmax: String(max), retmode: "json", sort: "relevance" })}`,
  );
  if (!search.ok) throw new Error(`PubMed esearch ${search.status}`);
  const ids: string[] = (await search.json()).esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const [summaryRes, abstractRes] = await Promise.all([
    fetch(`${BASE}/esummary.fcgi?${params({ id: ids.join(","), retmode: "json" })}`),
    fetch(`${BASE}/efetch.fcgi?${params({ id: ids.join(","), rettype: "abstract", retmode: "xml" })}`),
  ]);
  const summary = (await summaryRes.json()).result ?? {};
  const xml = abstractRes.ok ? await abstractRes.text() : "";
  const abstracts = parseAbstracts(xml);

  return ids
    .filter((id) => summary[id])
    .map((id) => {
      const s = summary[id];
      return {
        pmid: id,
        title: s.title,
        journal: s.source,
        year: String(s.pubdate ?? "").slice(0, 4),
        authors: (s.authors ?? []).slice(0, 3).map((a: { name: string }) => a.name).join(", "),
        abstract: (abstracts[id] ?? "").slice(0, 1200),
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    });
}

function parseAbstracts(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const article of xml.split("<PubmedArticle>").slice(1)) {
    const pmid = article.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    if (!pmid) continue;
    const parts = [...article.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, ""),
    );
    out[pmid] = parts.join(" ");
  }
  return out;
}
