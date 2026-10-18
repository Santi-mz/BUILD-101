import { AREAS, REGIONS } from "./catalogo";
import type { Seleccion } from "./filtros";

// Tipos de Holland que puede traer la devolución (?riasec=I,A). Solo se muestran; no eligen un área por la persona.
export const RIASEC: Record<string, string> = { R: "Realista", I: "Investigador", A: "Artístico", S: "Social", E: "Emprendedor", C: "Convencional" };
const norm = (t: string | null) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Selección inicial desde la URL, para enlazar la página desde otras pantallas sin acoplarlas:
 * /donde-estudiar?area=emp&carrera=Economía&region=uy&pais=Uruguay&riasec=E,S
 * La carrera se reconoce sin importar mayúsculas ni tildes. Los valores que no existen se ignoran.
 */
export function seleccionInicial(params: URLSearchParams): Seleccion & { riasec: string[] } {
  const area = AREAS.find((a) => a.id === params.get("area")) ?? AREAS[0];
  const career = area.careers.find((c) => norm(c) === norm(params.get("carrera"))) ?? null;
  const region = REGIONS.find((r) => r.id === params.get("region")) ?? REGIONS[0];
  const country = region.countries.find((c) => norm(c) === norm(params.get("pais"))) ?? null;
  const riasec = [...new Set((params.get("riasec") ?? "").toUpperCase().split(/[\s,]+/).filter((k) => k in RIASEC))];
  return { area: area.id, career, region: region.id, country, riasec };
}

/** La URL refleja la selección, así se puede recargar o compartir sin perderla. */
export function urlDe(sel: Seleccion, riasec: string[]) {
  const q = new URLSearchParams({ area: sel.area, region: sel.region });
  if (sel.career) q.set("carrera", sel.career);
  if (sel.country) q.set("pais", sel.country);
  if (riasec.length) q.set("riasec", riasec.join(","));
  return `/donde-estudiar?${q}`;
}
