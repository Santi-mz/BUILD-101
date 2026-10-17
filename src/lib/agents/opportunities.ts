import type { Area } from "@/lib/rubric";
import type { Opportunity } from "@/lib/engine/types";
import type { CatalogProvider } from "./catalog";

/**
 * A2 · Investigador de oportunidades. Recibe un resumen mínimo y autorizado (sin citas ni datos personales),
 * consulta los catálogos por categoría en paralelo (máximo 3 búsquedas por turno) y devuelve candidatas con fuente.
 * No escribe al usuario.
 */
export type DiscoverInput = {
  interest_summary: string[];
  riasec: Partial<Record<Area, number>>;
  tags: string[];
  categories: Opportunity["category"][];
  limits: { max_candidates: number; max_calls: number };
};

export async function discoverOpportunities(input: DiscoverInput, providers: CatalogProvider[]): Promise<{ candidates: Opportunity[]; calls: number; errors: string[] }> {
  const categories = input.categories.slice(0, Math.min(3, input.limits.max_calls));
  const errors: string[] = [];
  let calls = 0;
  const perCategory = await Promise.all(
    categories.map(async (category) => {
      const results = await Promise.all(
        providers.map(async (p) => {
          if (calls >= input.limits.max_calls * providers.length) return [];
          calls++;
          try {
            return await p.search({ categories: [category], riasec: input.riasec, tags: input.tags, limit: input.limits.max_candidates });
          } catch (err) {
            errors.push(`${p.name}: ${String(err).slice(0, 80)}`);
            return [];
          }
        }),
      );
      return results.flat();
    }),
  );
  return { candidates: perCategory.flat().slice(0, input.limits.max_candidates * 3), calls, errors };
}
