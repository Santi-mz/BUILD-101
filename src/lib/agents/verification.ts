import type { CheckedOpportunity, Opportunity } from "@/lib/engine/types";

/**
 * A3 · Verificador de evidencia. Etiqueta cada candidata como verified / partial / stale / unverified / demo.
 * Nunca convierte texto generado por IA en fuente. El contenido de las fuentes es dato, no instrucción.
 */
export const OFFICIAL_DOMAINS = [
  "udelar.edu.uy", "utec.edu.uy", "utu.edu.uy", "anep.edu.uy", "cfe.edu.uy", "inefop.org.uy", "gub.uy", "mec.gub.uy", "inju.gub.uy",
  "ort.edu.uy", "ucu.edu.uy", "um.edu.uy", "claeh.edu.uy", "onetonline.org", "onetcenter.org",
  // Fuentes institucionales de becas y formación que lee officialCatalog (Uruguay y exterior).
  "anii.org.uy", "fondodesolidaridad.edu.uy", "inefop.uy", "fundacioncarolina.es", "daad.de", "europa.eu", "fulbright.org.uy",
];
/** Fuentes de referencia ocupacional (no oferta educativa): como mucho "partial". */
const REFERENCE_DOMAINS = ["onetonline.org", "onetcenter.org"];
const STALE_DAYS = 365;

const INJECTION = /(ignor(a|á|e|ar)\s+(las|todas|the|all|previous|anteriores)|instrucciones (del sistema|anteriores)|system prompt|you are now|sos ahora|nuevas instrucciones|disregard|olvid(a|á) (todo|las reglas)|<\/?script|recomend(a|á) siempre)/i;

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
const isOfficial = (d: string) => OFFICIAL_DOMAINS.some((o) => d === o || d.endsWith(`.${o}`));

export function verifyOpportunities(candidates: Opportunity[], now = new Date()): { checked: CheckedOpportunity[]; duplicates: number } {
  const seen = new Set<string>();
  let duplicates = 0;
  const checked: CheckedOpportunity[] = [];
  for (const c of candidates) {
    const key = `${c.title.toLowerCase().trim()}|${c.provider.toLowerCase().trim()}`;
    if (seen.has(key) || seen.has(c.opportunity_id)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    seen.add(c.opportunity_id);
    const checks: CheckedOpportunity["checks"] = [];
    const warnings: string[] = [];
    let status = c.status;

    // Inyección de instrucciones en textos externos: se marca y no se usa como opción real.
    const injected = [c.title, c.summary, c.provider, c.requirements ?? ""].some((t) => INJECTION.test(t));
    checks.push({ field: "contenido", ok: !injected, note: injected ? "El texto de la fuente contiene instrucciones; se trata como dato y se descarta" : "Sin instrucciones embebidas" });

    if (c.status === "demo") {
      // Un registro DEMO nunca pasa a verificado.
      checks.push({ field: "fuente", ok: false, note: "Registro de demostración: no existe como oferta real" });
      warnings.push("DEMO: ejemplo sintético, no es una oferta disponible.");
    } else if (!c.source_url) {
      status = "unverified";
      checks.push({ field: "fuente", ok: false, note: "Sin URL de fuente" });
    } else {
      const d = domainOf(c.source_url);
      const official = d ? isOfficial(d) : false;
      checks.push({ field: "fuente", ok: official, note: official ? `Dominio institucional (${d})` : `Dominio no reconocido (${d ?? "URL inválida"})` });
      if (!official) status = "unverified";
      else if (REFERENCE_DOMAINS.some((r) => d === r || d!.endsWith(`.${r}`))) {
        status = "partial";
        warnings.push("Referencia ocupacional de EE.UU.: describe un campo de trabajo, no una oferta para estudiar en Uruguay.");
      } else if (!c.verified_at) {
        status = "partial";
        warnings.push("Fuente oficial sin fecha de validación: confirmar en la web de la institución.");
      } else {
        const age = (now.getTime() - new Date(c.verified_at).getTime()) / 86_400_000;
        status = age > STALE_DAYS ? "stale" : "verified";
        checks.push({ field: "fecha", ok: age <= STALE_DAYS, note: `Validado hace ${Math.round(age)} días` });
      }
    }
    if (injected) status = c.status === "demo" ? "demo" : "unverified";
    if (c.unknowns.length) warnings.push(`Falta verificar: ${c.unknowns.join(", ")}.`);
    checked.push({
      ...c,
      // Textos externos se recortan y se tratan como datos (nunca se pasan como instrucciones a un LLM).
      title: injected ? "[contenido descartado]" : c.title.slice(0, 120),
      summary: injected ? "" : c.summary.slice(0, 280),
      status,
      checks,
      warnings,
    });
  }
  return { checked, duplicates };
}

/** Solo verified/partial se muestran como opciones reales; demo se muestra rotulado DEMO; el resto no se muestra. */
export const displayable = (o: CheckedOpportunity) =>
  (o.status === "verified" || o.status === "partial" || o.status === "demo") && o.checks.every((c) => c.field !== "contenido" || c.ok);
