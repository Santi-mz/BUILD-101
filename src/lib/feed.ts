import type { SupabaseClient } from "@supabase/supabase-js";
import { RIASEC_KEYS, type ProfileData, type RiasecKey } from "@/lib/profile";

export type NewsItem = {
  id: number;
  url: string;
  title: string;
  source: string | null;
  summary: string | null;
  category: string | null;
  riasec: Partial<Record<RiasecKey, number>>;
  topics: string[];
  published_at: string | null;
  match?: number;
};

/**
 * Sin perfil: últimas noticias. Con perfil: ordenadas por afinidad RIASEC (etiquetada por la IA)
 * + coincidencia con los intereses que detectó el agente + frescura.
 */
export async function getFeed(supabase: SupabaseClient, profile: ProfileData | null, limit = 24) {
  const personalized = Boolean(profile?.riasec);
  const { data } = await supabase
    .from("news")
    .select("id,url,title,source,summary,category,riasec,topics,published_at")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(personalized ? 200 : limit);
  const items = (data ?? []) as NewsItem[];
  if (!profile?.riasec) return { items, personalized };

  const p = profile.riasec;
  const keywords = (profile.interests_keywords ?? []).map((k) => k.toLowerCase());
  const pNorm = Math.hypot(...RIASEC_KEYS.map((k) => p[k].score)) || 1;
  const now = Date.now();

  const scored = items.map((n) => {
    const nNorm = Math.hypot(...RIASEC_KEYS.map((k) => n.riasec[k] ?? 0)) || 1;
    const cosine = RIASEC_KEYS.reduce((a, k) => a + p[k].score * (n.riasec[k] ?? 0), 0) / (pNorm * nNorm);
    const text = `${n.title} ${n.summary ?? ""} ${n.topics.join(" ")}`.toLowerCase();
    const kw = keywords.filter((k) => text.includes(k)).length;
    const ageDays = n.published_at ? (now - new Date(n.published_at).getTime()) / 86_400_000 : 30;
    const score = cosine + 0.15 * Math.min(kw, 3) + 0.2 * Math.max(0, 1 - ageDays / 14);
    return { item: { ...n, match: Math.round(cosine * 100) }, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return { items: scored.slice(0, limit).map((s) => s.item), personalized };
}

/** Noticia publicada en los últimos 3 días. */
export const isFresh = (publishedAt: string | null) => Boolean(publishedAt && Date.now() - new Date(publishedAt).getTime() < 3 * 86_400_000);
