import catalog from "@/data/catalog.demo.json";
import { getNode, matchProfile } from "@/lib/graph";
import type { Area } from "@/lib/rubric";
import type { Opportunity } from "@/lib/engine/types";
import { officialCatalog } from "./official";

/**
 * Adaptadores de catálogo (CatalogProvider). Se pueden sumar fuentes institucionales reales
 * sin tocar los agentes: cada proveedor devuelve candidatas con su fuente y estado.
 */
export interface CatalogProvider {
  name: string;
  search(q: { categories: Opportunity["category"][]; riasec: Partial<Record<Area, number>>; tags: string[]; limit: number }): Promise<Opportunity[]>;
}

/** Catálogo de demostración: todo es sintético y queda con status "demo". */
export const demoCatalog = (items: Omit<Opportunity, "status" | "source_url" | "verified_at" | "unknowns">[] = catalog.items as never): CatalogProvider => ({
  name: "demo",
  async search({ categories, limit }) {
    return items
      .filter((i) => categories.includes(i.category))
      .slice(0, limit * 3)
      .map((i) => ({
        ...i,
        status: "demo" as const,
        source_url: null,
        source_name: "Catálogo de demostración",
        verified_at: null,
        unknowns: ["existencia real", "plan de estudios", "requisitos", "costos", "fechas"],
      }));
  },
});

/**
 * O*NET (dataset incluido en el repo): ocupaciones reales como "campo de trabajo de referencia".
 * No es oferta educativa en Uruguay; la ficha lo aclara.
 */
export const onetCatalog = (): CatalogProvider => ({
  name: "onet",
  async search({ categories, riasec, limit }) {
    if (!categories.includes("adjacent")) return [];
    const vec = Object.fromEntries(["R", "I", "A", "S", "E", "C"].map((k) => [k, riasec[k as Area] ?? 0]));
    if (!Object.values(vec).some((v) => v > 0)) return [];
    return matchProfile(vec, Math.max(3, limit)).map((m) => {
      const node = getNode(m.id);
      const code = m.id.replace(/^occ:/, "");
      return {
        opportunity_id: `onet_${code}`,
        type: "occupation" as const,
        category: "adjacent" as const,
        title: m.name,
        summary: `Ocupación real de la base O*NET (${m.en ?? node?.en ?? ""}). La ficha original está en inglés y describe tareas y conocimientos de ese trabajo.`,
        provider: "O*NET OnLine (Departamento de Trabajo de EE.UU.)",
        country: "US",
        modality: "unknown" as const,
        schedule: "unknown" as const,
        cost: "unknown" as const,
        requirements: m.preparation ?? null,
        riasec: (node?.riasec ?? {}) as Partial<Record<Area, number>>,
        tags: [],
        status: "unverified" as const,
        source_url: `https://www.onetonline.org/link/summary/${code}`,
        source_name: "O*NET 31.0 (CC BY 4.0)",
        verified_at: null,
        unknowns: ["cómo se estudia en Uruguay", "condiciones de trabajo locales", "nombre traducido con IA"],
      };
    });
  },
});

// officialCatalog (Marto): convocatorias reales de fuentes institucionales. En los tests no se usa (hace pedidos reales).
export const defaultProviders = (): CatalogProvider[] => [...(process.env.VITEST ? [] : [officialCatalog()]), demoCatalog(), onetCatalog()];
