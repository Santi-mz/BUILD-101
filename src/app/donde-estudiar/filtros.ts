import { CATALOG_REGIONS, FICHAS, FUENTES_BECAS, type Ficha, type Modo } from "./catalogo";

/**
 * Filtros honestos: cada filtro responde "yes", "no" o "unknown" según lo que publica la fuente.
 * Un programa coincide solo si todos sus filtros dan "yes"; con algún "unknown" va aparte como información
 * incompleta, y con algún "no" queda afuera. Lo desconocido nunca cuenta como gratuito, con beca o con modalidad.
 */
export type Budget = "any" | "free" | "aid";
export type Lang = "any" | "es" | "en" | "pt" | "de";
export type Filtros = { budget: Budget; becas: boolean; lang: Lang; mode: "any" | Modo };
export type Seleccion = { area: string; career: string | null; region: string; country: string | null };
export type Check = { key: keyof Filtros; label: string; value: "yes" | "no" | "unknown" };
export type Resultado = { ficha: Ficha; relation: "direct" | "related" | "area"; checks: Check[] };

export const FILTROS_INICIALES: Filtros = { budget: "any", becas: false, lang: "any", mode: "any" };
export const LANG_LABEL: Record<Exclude<Lang, "any">, string> = { es: "español", en: "inglés", pt: "portugués", de: "alemán" };
export const MODE_LABEL: Record<Modo, string> = { presencial: "presencial", hibrida: "híbrida", distancia: "a distancia" };

export function checks(f: Ficha, filtros: Filtros): Check[] {
  const out: Check[] = [];
  if (filtros.budget !== "any") {
    let value: Check["value"] = "unknown";
    if (f.tuition === "free") value = "yes";
    else if (filtros.budget === "free" && f.tuition === "paid") value = "no";
    else if (filtros.budget === "aid" && f.tuition === "paid") value = f.becaConfirmada ? "yes" : "unknown";
    out.push({ key: "budget", label: filtros.budget === "free" ? "matrícula gratuita" : "gratuita o con beca", value });
  }
  if (filtros.becas) out.push({ key: "becas", label: "beca confirmada para la carrera", value: f.becaConfirmada ? "yes" : "unknown" });
  // Ninguna fuente del catálogo publica el idioma de cursado.
  if (filtros.lang !== "any") out.push({ key: "lang", label: `idioma ${LANG_LABEL[filtros.lang]}`, value: "unknown" });
  if (filtros.mode !== "any") {
    const value = f.modes ? (f.modes.includes(filtros.mode) ? "yes" : "no") : "unknown";
    out.push({ key: "mode", label: `modalidad ${MODE_LABEL[filtros.mode]}`, value });
  }
  return out;
}

function relation(f: Ficha, career: string | null): Resultado["relation"] | null {
  if (!career) return "area";
  if (f.direct.includes(career)) return "direct";
  if (f.related.includes(career)) return "related";
  return null;
}

export const tieneCatalogo = (sel: Seleccion) =>
  CATALOG_REGIONS.includes(sel.region) && FICHAS.some((f) => f.areaId === sel.area && f.region === sel.region && (!sel.country || f.pais === sel.country));

export function buscar(sel: Seleccion, filtros: Filtros) {
  const res = { direct: [] as Resultado[], related: [] as Resultado[], incomplete: [] as Resultado[], excluded: [] as Resultado[] };
  for (const f of FICHAS) {
    if (f.areaId !== sel.area || f.region !== sel.region || (sel.country && f.pais !== sel.country)) continue;
    const rel = relation(f, sel.career);
    if (!rel) continue;
    const c = checks(f, filtros);
    const r: Resultado = { ficha: f, relation: rel, checks: c };
    if (c.some((x) => x.value === "no")) res.excluded.push(r);
    else if (c.some((x) => x.value === "unknown")) res.incomplete.push(r);
    else (rel === "related" ? res.related : res.direct).push(r);
  }
  return res;
}

export const fuentesBecas = (sel: Seleccion) =>
  FUENTES_BECAS.filter((s) => s.regions.includes(sel.region) && (!s.countries || !sel.country || s.countries.includes(sel.country)));
