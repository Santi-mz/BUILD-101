/**
 * Guardas de salida del entrevistador (Documento 2, sección 10). Deterministas.
 * Lista de bloqueo editable: carreras/profesiones, instituciones, mercado laboral y términos diagnósticos.
 */
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const CAREER_TERMS = [
  "medicina", "medic", "ingenier", "abogad", "abogacia", "derecho penal", "escribani", "arquitect", "psicolog", "psiquiatr",
  "contador", "contadur", "contabilidad", "economist", "enfermer", "odontolog", "dentista", "veterinari", "farmac", "nutricionist",
  "fisioterap", "kinesiolog", "fonoaudiolog", "profesorado", "magisterio", "maestr[oa] de", "docente de", "programador", "desarrollador",
  "informatica", "computacion", "analista de sistemas", "diseñador", "disenador", "diseno grafico", "comunicacion social",
  "periodis", "publicist", "marketing", "administracion de empresas", "licenciatura", "tecnicatura", "tecnologo", "carrera de",
  "estudiar (arte|musica|ciencias|diseno|teatro|cine)", "chef", "gastronomia", "policia", "militar", "piloto", "agronom", "biolog",
  "quimic", "fisic[oa] nuclear", "matematico", "actor", "actriz", "musico profesional", "productor musical", "ingeniero de sonido",
  "sonidist", "trabajador social", "sociolog", "antropolog", "historiador", "traductor", "relaciones internacionales", "notari",
];
export const INSTITUTION_TERMS = [
  "udelar", "universidad de la republica", "utec", "utu", "ort", "universidad catolica", "ucu", "universidad de montevideo", "claeh",
  "facultad", "universidad", "instituto", "escuela de", "inefop", "anep", "cfe", "ipa\\b",
];
export const LABOR_TERMS = ["mercado laboral", "salida laboral", "salidas laborales", "sueldo", "salario", "se gana bien", "tiene futuro", "demanda laboral", "empleabilidad"];
export const DIAGNOSTIC_TERMS = [
  "ansiedad", "ansios", "depresi", "deprimid", "trastorno", "tdah", "deficit de atencion", "autismo", "autista", "asperger", "bipolar",
  "diagnostic", "patolog", "toc\\b", "fobia", "dislexi",
];
const PERSONALITY_LABELS = ["sos (una persona )?(muy )?(creativ[oa]|social|introvertid[oa]|extrovertid[oa]|lider|artista|inteligente|analitic[oa]|practic[oa])"];

export type GuardMode = "interview" | "summary" | "safety";
export const WORD_LIMITS: Record<GuardMode, number> = { interview: 70, summary: 120, safety: 400 };

export function wordCount(t: string) {
  return t.trim().split(/\s+/).filter(Boolean).length;
}
export function questionCount(t: string) {
  return (t.match(/\?/g) ?? []).length;
}

/**
 * Verifica el borrador. `userWords`: términos que la persona ya usó (se pueden reflejar con sus palabras,
 * por ejemplo "medicina" en el escenario de presión familiar).
 */
export function check(draft: string, mode: GuardMode, userText = ""): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const t = norm(draft);
  const said = norm(userText);
  if (!draft.trim()) reasons.push("mensaje vacío");
  if (mode !== "safety" && questionCount(draft) > 1) reasons.push(`tiene ${questionCount(draft)} preguntas; máximo 1`);
  if (wordCount(draft) > WORD_LIMITS[mode]) reasons.push(`tiene ${wordCount(draft)} palabras; máximo ${WORD_LIMITS[mode]}`);
  const hit = (list: string[], label: string) => {
    for (const term of list) {
      const re = new RegExp(`\\b${term}`, "i");
      const m = t.match(re);
      if (m && !said.includes(m[0].trim())) {
        reasons.push(`nombra ${label} ("${m[0].trim()}")`);
        return;
      }
    }
  };
  if (mode !== "safety") {
    hit(CAREER_TERMS, "una carrera o profesión");
    hit(INSTITUTION_TERMS, "una institución");
    hit(LABOR_TERMS, "datos del mercado laboral");
    hit(DIAGNOSTIC_TERMS, "un término diagnóstico");
    hit(PERSONALITY_LABELS, "una etiqueta de personalidad");
  }
  return { ok: reasons.length === 0, reasons };
}
