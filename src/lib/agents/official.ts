import type { Opportunity } from "@/lib/engine/types";
import { findOpportunities, type OpportunityKind, type OpportunityScope } from "@/lib/opportunities";
import { RIASEC_LABELS, type RiasecKey } from "@/lib/profile";
import type { Area } from "@/lib/rubric";
import type { CatalogProvider } from "./catalog";

const TIMEOUT_MS = 40_000;

const TYPE: Record<OpportunityKind, Opportunity["type"]> = { beca: "exchange", curso: "course", pasantia: "internship", empleo: "experience" };

/**
 * Catálogo de fuentes oficiales reales (becas, cursos, pasantías y empleos, en Uruguay y en el exterior).
 * Lee las páginas institucionales (AUCI, ANII, Fondo de Solidaridad, Udelar, INEFOP, INJU, Fundación Carolina,
 * DAAD, Erasmus+, Fulbright) y la IA extrae convocatorias. Solo deja URLs de esas fuentes. Si tarda o falla,
 * devuelve vacío y los otros proveedores siguen.
 */
export const officialCatalog = (): CatalogProvider => ({
  name: "official",
  async search({ categories, riasec, tags, limit }) {
    const kinds: OpportunityKind[] = [
      ...(categories.includes("training") ? (["beca", "curso"] as const) : []),
      ...(categories.includes("practical") ? (["pasantia", "empleo"] as const) : []),
    ];
    if (!kinds.length) return [];
    const top = (Object.entries(riasec) as [Area, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => RIASEC_LABELS[k as RiasecKey] ?? k);
    const profile = `Persona joven en Uruguay. Intereses principales: ${top.join(", ") || "sin definir"}. Temas: ${tags.join(", ") || "sin definir"}.`;
    const scopes: OpportunityScope[] = categories.includes("training") ? ["nacional", "internacional"] : ["nacional"];

    const run = Promise.all(scopes.map((scope) => findOpportunities({ profile, keywords: tags, kinds, scope }).catch(() => [])));
    const timeout = new Promise<never[][]>((resolve) => setTimeout(() => resolve([]), TIMEOUT_MS));
    const found = (await Promise.race([run, timeout])).flat();
    const now = new Date().toISOString();

    return found.slice(0, limit * 2).map((o, i) => ({
      opportunity_id: `oficial_${i}_${o.url.replace(/[^a-z0-9]/gi, "").slice(-24)}`,
      type: TYPE[o.kind],
      category: o.kind === "beca" || o.kind === "curso" ? ("training" as const) : ("practical" as const),
      title: o.title,
      summary: o.why,
      provider: o.org,
      country: o.scope === "nacional" ? "UY" : (o.location ?? "Exterior"),
      modality: "unknown" as const,
      schedule: "unknown" as const,
      cost: o.kind === "beca" ? ("gratuito" as const) : ("unknown" as const),
      requirements: o.deadline ? `Cierra ${o.deadline}` : null,
      riasec: riasec,
      tags,
      status: "unverified" as const, // el verificador A3 decide según el dominio y la fecha
      source_url: o.url,
      source_name: o.org,
      // Leímos la página institucional recién: es la fecha de verificación de la fuente.
      verified_at: now,
      unknowns: o.deadline ? ["requisitos exactos", "cupos"] : ["fecha de cierre", "requisitos exactos", "cupos"],
    }));
  },
});
