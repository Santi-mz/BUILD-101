// Fuentes reales de noticias. Google News RSS por búsqueda temática (Uruguay / región).
// Ojo: los términos de Google News RSS hablan de uso personal; para producción conviene sumar RSS propios de medios.
const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=UY&ceid=UY:es-419`;

export const NEWS_FEEDS: { category: string; url: string }[] = [
  { category: "empleo", url: gnews("empleo jóvenes Uruguay") },
  { category: "pasantias", url: gnews("pasantías Uruguay") },
  { category: "becas", url: gnews("becas estudiantes Uruguay") },
  { category: "estudios", url: gnews("Udelar carreras inscripciones") },
  { category: "estudios", url: gnews("UTEC UTU cursos") },
  { category: "tecnologia", url: gnews("empleo tecnología programación Uruguay") },
  { category: "salud", url: gnews("salud carreras profesionales Uruguay") },
  { category: "arte", url: gnews("industrias creativas diseño Uruguay") },
  { category: "emprendimiento", url: gnews("emprendedores startups Uruguay") },
  { category: "orientacion", url: gnews("orientación vocacional") },
];

export type RawNews = {
  url: string;
  title: string;
  source: string;
  published_at: string | null;
  category: string;
};

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

export async function fetchFeed(feed: { category: string; url: string }, limit = 8): Promise<RawNews[]> {
  const res = await fetch(feed.url, { headers: { "User-Agent": "Mozilla/5.0 (RumboBot)" } });
  if (!res.ok) return [];
  const xml = await res.text();
  return xml
    .split("<item>")
    .slice(1, limit + 1)
    .map((item) => {
      const tag = (t: string) => decode(item.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
      const source = tag("source");
      let title = tag("title");
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const date = tag("pubDate");
      return {
        url: tag("link"),
        title,
        source,
        published_at: date ? new Date(date).toISOString() : null,
        category: feed.category,
      };
    })
    .filter((n) => n.url && n.title);
}
