/**
 * Enmascara datos que identifican a la persona antes de guardar (R15): email, teléfono, documento,
 * nombre propio cuando se presenta, centro educativo y dirección.
 */
const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]"],
  [/\b\d\.?\d{3}\.?\d{3}[-‐]?\d\b/g, "[documento]"],
  [/(\+?598[\s-]?)?\b0?9\d[\s-]?\d{3}[\s-]?\d{3}\b/g, "[teléfono]"],
  [/\b(?:2|4)\d{3}[\s-]?\d{4}\b/g, "[teléfono]"],
  [/\b([Mm]e llamo|[Mm]i nombre es|[Ss]oy (?:el|la))\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?/g, "$1 [nombre]"],
  [/\b([Ll]iceo|[Cc]olegio|[Ee]scuela|[Ii]nstituto)\s+(n[°º.]?\s*\d+|N[°º.]?\s*\d+|\d+|[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+){0,3})/g, "$1 [centro educativo]"],
  [/\b([Cc]alle|[Aa]venida|[Aa]v\.|[Bb]ulevar|[Bb]var\.)\s+[A-ZÁÉÍÓÚÑ\d][\wáéíóúñ.]*(\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ.]*){0,3}\s*(n[°º.]?\s*)?\d{1,5}\b/g, "[dirección]"],
  [/\b(instagram|tiktok|twitter|linkedin)\s*:?\s*@?[\w.]{3,}/gi, "[cuenta]"],
  [/@[\w.]{3,}/g, "[cuenta]"],
];

export function maskPII(text: string): string {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}
