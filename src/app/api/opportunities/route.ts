import { findOpportunities, mergeOpportunities, OPPORTUNITY_KINDS, type OpportunityKind, type OpportunityScope } from "@/lib/opportunities";
import { riasecCode, RIASEC_LABELS, topThree, type ProfileData } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;

/** Busca oportunidades reales (becas, pasantías, empleos, cursos) para el perfil del usuario y las guarda. */
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const body = (await req.json()) as { kinds?: OpportunityKind[]; scope?: OpportunityScope };
  const kinds = (body.kinds ?? ["beca", "pasantia", "empleo"]).filter((k) => OPPORTUNITY_KINDS.includes(k));
  const scope: OpportunityScope = body.scope === "internacional" ? "internacional" : "nacional";

  const { data: prof } = await supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle();
  const p = prof?.data as ProfileData | null;
  if (!p?.riasec) return Response.json({ error: "Primero armá tu perfil en el chat." }, { status: 400 });

  const profile = `Código ${riasecCode(p)} (${topThree(p).map((k) => RIASEC_LABELS[k]).join(", ")}). ${p.summary} Fortalezas: ${p.strengths.join(", ")}. Condiciones: ${JSON.stringify(p.constraints)}`;
  const { data: news } = await supabase
    .from("news")
    .select("title,url,category")
    .in("category", ["pasantias", "empleo", "becas"])
    .order("published_at", { ascending: false })
    .limit(25);
  try {
    const found = await findOpportunities({ profile, keywords: p.interests_keywords ?? [], kinds, scope, news: news ?? [] });
    const opportunities = mergeOpportunities(p.opportunities, found);
    await supabase.from("profiles").update({ data: { ...p, opportunities } }).eq("user_id", user.id);
    return Response.json({ found: found.length, opportunities });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "No pude buscar ahora. Probá en un minuto." }, { status: 502 });
  }
}
