import { AREAS, AREA_PLAIN, type Area } from "@/lib/rubric";
import type { CheckedOpportunity, Evidence, Filters, Route } from "@/lib/engine/types";
import { displayable } from "./verification";

/**
 * A4 · Selector / explicador de rutas. Restricciones duras primero, después compatibilidad con evidencias,
 * diversidad y calidad de fuente. Hasta 3 rutas; nunca rellena. No muestra porcentajes de compatibilidad.
 */
export type RankContext = { pct: Record<Area, number>; evidence: Evidence[]; keywords: string[] };

const TYPE_LABEL: Record<CheckedOpportunity["type"], string> = {
  degree: "Carrera",
  technical: "Tecnicatura o formación técnica",
  course: "Curso",
  internship: "Pasantía",
  exchange: "Intercambio",
  experience: "Experiencia formativa",
  occupation: "Campo de trabajo (referencia)",
};
export const typeLabel = (t: CheckedOpportunity["type"]) => TYPE_LABEL[t];

const ACTION_TODAY: Record<CheckedOpportunity["type"], string> = {
  degree: "Buscá el plan de estudios y mirá qué materias tiene el primer año.",
  technical: "Mirá el plan de la formación y anotá dos preguntas para hacerle a la institución.",
  course: "Revisá el programa del curso y fijate si hay una clase abierta o de prueba.",
  internship: "Anotá qué te gustaría aprender ahí y averiguá cómo es una jornada típica.",
  exchange: "Averiguá qué requisitos y costos suele tener un intercambio así, sin compromiso.",
  experience: "Probalo una vez: es de bajo costo y te da evidencia real de si te gusta.",
  occupation: "Leé la ficha de la ocupación y marcá qué tareas te llaman la atención y cuáles no.",
};

const TRADEOFF: Record<CheckedOpportunity["type"], string> = {
  degree: "Es un camino largo: conviene conocer el día a día antes de decidir.",
  technical: "Es más corto y práctico; puede tener menos teoría de la que esperás.",
  course: "Es corto: sirve para probar, no para definir todo.",
  internship: "Requiere tiempo y constancia; puede ser más rutinario de lo que imaginás.",
  exchange: "Implica mudarte un tiempo y puede tener costos.",
  experience: "Es una muestra chica: una sola experiencia no define un interés.",
  occupation: "Los datos son de EE.UU.: las condiciones en Uruguay pueden ser distintas.",
};

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function hardConstraintViolation(o: CheckedOpportunity, f: Filters): string | null {
  if (o.type === "occupation") return null; // es una referencia, no una oferta para cursar
  if (f.country === "UY" && o.country !== "UY") return "Queda fuera de Uruguay";
  if (f.modality === "presencial" && o.modality === "distancia") return "Es solo a distancia";
  if (f.modality === "distancia" && o.modality === "presencial") return "Es solo presencial";
  if (f.schedule === "nocturno" && o.schedule === "diurno") return "No tiene horario nocturno";
  if (f.cost === "gratuito" && o.cost === "pago") return "Es paga";
  return null;
}

function unknownFilters(o: CheckedOpportunity, f: Filters) {
  const q: string[] = [];
  if (o.type === "occupation") return q;
  if (f.modality !== "cualquiera" && o.modality === "unknown") q.push("¿Se puede cursar en la modalidad que necesitás?");
  if (f.schedule === "nocturno" && (o.schedule === "unknown" || !o.schedule)) q.push("¿Tiene horario nocturno?");
  if (f.cost === "gratuito" && (o.cost === "unknown" || !o.cost)) q.push("¿Es gratuita?");
  return q;
}

function similarity(pct: Record<Area, number>, r: Partial<Record<Area, number>>) {
  const a = AREAS.map((k) => pct[k] ?? 0);
  const b = AREAS.map((k) => r[k] ?? 0);
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n ? dot / n : 0;
}

export function score(o: CheckedOpportunity, ctx: RankContext) {
  const kw = new Set(ctx.keywords.map(norm));
  const tagHits = o.tags.filter((t) => [...kw].some((k) => k.includes(norm(t)) || norm(t).includes(k))).length;
  const quality = o.status === "verified" ? 0.2 : o.status === "partial" ? 0.1 : 0;
  return similarity(ctx.pct, o.riasec) + 0.15 * Math.min(3, tagHits) + quality;
}

const mainArea = (r: Partial<Record<Area, number>>, pct: Record<Area, number>) =>
  [...AREAS].sort((x, y) => (r[y] ?? 0) * (1 + (pct[y] ?? 0) / 100) - (r[x] ?? 0) * (1 + (pct[x] ?? 0) / 100))[0];

function explain(o: CheckedOpportunity, ctx: RankContext, filters: Filters): Route {
  const area = mainArea(o.riasec, ctx.pct);
  const support = ctx.evidence
    .filter((e) => e.area === area && e.polarity === 1 && e.status !== "REJECTED")
    .sort((x, y) => Number(y.status === "CONFIRMED") - Number(x.status === "CONFIRMED") || Number(y.concrete) - Number(x.concrete));
  const quote = support[0]?.quote;
  const weakArea = AREAS.filter((a) => (o.riasec[a] ?? 0) >= 0.5 && (ctx.pct[a] ?? 0) < 10 && a !== area)[0];
  const demo = o.status === "demo";
  return {
    path_id: o.opportunity_id,
    opportunity: o,
    what: o.summary || o.title,
    why_this: quote
      ? `Aparece porque contaste "${quote.slice(0, 120)}", y esto tiene mucho de ${AREA_PLAIN[area].toLowerCase()}.`
      : `Se relaciona con ${AREA_PLAIN[area].toLowerCase()}, algo que apareció en la charla.`,
    evidence_ids: support.slice(0, 3).map((e) => e.id),
    potential_appeal: `Podría atraerte si te engancha ${AREA_PLAIN[area].toLowerCase()}.`,
    potential_tradeoffs: `${TRADEOFF[o.type]}${weakArea ? ` También tiene una parte de ${AREA_PLAIN[weakArea].toLowerCase()}, que en la charla apareció poco.` : ""}`,
    known: demo
      ? "DEMO: es un ejemplo sintético para mostrar cómo funciona. No es una oferta real ni está disponible."
      : `Fuente: ${o.source_name ?? o.provider}${o.verified_at ? `, validada el ${o.verified_at.slice(0, 10)}` : ""}. Estado: ${o.status === "verified" ? "verificada" : "parcial"}. ${o.warnings.filter((w) => !w.startsWith("Falta")).join(" ")}`.trim(),
    open_questions: [...unknownFilters(o, filters), ...o.unknowns.map((u) => `Falta verificar: ${u}`)].slice(0, 5),
    action_today: ACTION_TODAY[o.type],
  };
}

export function rankPaths(checked: CheckedOpportunity[], filters: Filters, ctx: RankContext, max = 3) {
  const excluded: { id: string; title: string; reason: string }[] = [];
  const valid = checked.filter((o) => {
    if (!displayable(o)) return false;
    const v = hardConstraintViolation(o, filters);
    if (v) excluded.push({ id: o.opportunity_id, title: o.title, reason: v });
    return !v;
  });
  const ranked = valid.map((o) => ({ o, s: score(o, ctx) })).sort((a, b) => b.s - a.s);
  // Diversidad: primero la mejor de cada categoría, sin repetir tipo; después completar por puntaje.
  const chosen: typeof ranked = [];
  for (const cat of ["training", "practical", "adjacent"] as const) {
    const best = ranked.find((r) => r.o.category === cat && !chosen.includes(r) && !chosen.some((c) => c.o.type === r.o.type));
    if (best && chosen.length < max) chosen.push(best);
  }
  for (const r of ranked) if (chosen.length < max && !chosen.includes(r)) chosen.push(r);
  const routes = chosen.slice(0, max).map((r) => explain(r.o, ctx, filters));
  const note =
    routes.length === 0
      ? "No encontré opciones que cumplan tus condiciones. Podemos ampliar los filtros si querés."
      : routes.length < max
        ? `Encontré ${routes.length} ${routes.length === 1 ? "opción válida" : "opciones válidas"} con tus condiciones; no voy a rellenar con inventos.`
        : "Tres caminos distintos para investigar. Ninguno es una recomendación definitiva.";
  return { routes, excluded, note };
}
