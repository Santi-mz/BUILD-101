import type { RiskCategory } from "./types";

/**
 * Prechequeo de riesgo por reglas, antes del analizador (Documento 2, sección 11).
 * Ante la duda se marca: es preferible un falso positivo a seguir preguntando por intereses.
 */
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const RULES: { category: RiskCategory; patterns: RegExp[] }[] = [
  {
    category: "SUICIDIO",
    patterns: [
      /\bsuicid/,
      /\b(me quiero|quiero|voy a|ganas de|pienso en) (matarme|morir(me)?|suicidarme)\b/,
      /\bmatarme\b/,
      /\bme (quiero|voy a) matar\b/,
      /\bno (quiero|tengo ganas de) (seguir )?viviendo\b/,
      /\bno quiero (vivir|estar viv[oa]|existir|despertarme|despertar)\b/,
      /\b(quiero|prefiero) (estar muert[oa]|desaparecer)\b/,
      /\bno (vale|tiene sentido) (la pena )?(seguir )?vivir\b/,
      /\b(terminar|acabar) con (todo|mi vida)\b/,
      /\bquitarme la vida\b/,
      /\bmejor (si )?(no estuviera|me muero|muerto)\b/,
    ],
  },
  {
    category: "AUTOLESION",
    patterns: [
      /\bautolesi/,
      /\b(me|nos) (corto|corte|cortaba|lastimo|lastime|quemo|pego)\b(?! (el|la|los|las|un|una|mi|mis) (pelo|unas|uñas|barba|flequillo|dedo))/,
      /\bcortarme\b(?! (el|la|los|las|un|una|mi|mis) (pelo|unas|uñas|barba|flequillo))/,
      /\b(lastimarme|hacerme dano|hacerme mal a proposito)\b/,
    ],
  },
  {
    category: "VIOLENCIA",
    patterns: [
      /\b(lo|la|los|las|te) voy a matar\b/,
      /\bquiero matar a\b/,
      /\bme (pegan|golpean|maltratan|abusan|amenazan)\b/,
      /\b(abuso|abusaron|violaron|violencia) (de mi|en mi casa|conmigo)\b/,
      /\bme (abuso|violo|toco sin)\b/,
      /\bllevar un arma\b/,
    ],
  },
  {
    category: "MALESTAR_INTENSO",
    patterns: [
      /\bno (aguanto|soporto) mas\b/,
      /\bno puedo mas\b(?! (de|con) (risa|la risa|hambre|sueno))/,
      /\bestoy (desesperad[oa]|destruid[oa])\b/,
      /\bme siento (vaci[oa]|sin salida|un estorbo|una carga)\b/,
      /\b(ataques? de panico|no paro de llorar)\b/,
    ],
  },
];

/** Expresiones coloquiales que NO son riesgo (falsos positivos comunes). */
const BENIGN = [
  /\bme muero (de|por) (risa|ganas|hambre|sueno|calor|frio|amor|verguenza)\b/,
  /\bme mata(n)? (de risa|la curiosidad)\b/,
  /\bmatar el tiempo\b/,
  /\bme corto el pelo\b/,
  /\bun juego de (matar|disparos)\b/,
];

export function precheck(text: string): { flag: boolean; category?: RiskCategory } {
  let t = norm(text);
  for (const b of BENIGN) t = t.replace(b, " ");
  for (const r of RULES) if (r.patterns.some((p) => p.test(t))) return { flag: true, category: r.category };
  return { flag: false };
}

/** Plantilla fija (debe revisarla un profesional antes del piloto). Fuente: MSP; revisar vigencia antes de publicar. */
export const SAFETY_MESSAGE = `Gracias por contármelo. Lo que sentís importa, y no tenés por qué atravesarlo solo o sola. Dejemos la charla vocacional por ahora.

Te sugiero hablar hoy con un adulto de confianza. Y si en algún momento sentís que estás en riesgo, podés llamar ya:

• Línea Vida: 0800 0767 o *0767 desde el celular (24 horas, gratuita)
• Emergencias: 911
• Línea de apoyo emocional: 0800 1920
• Línea Azul (niños y adolescentes): 0800 5050

Soy una herramienta de exploración vocacional, no reemplazo a un profesional. Si más adelante querés retomar la charla, escribime "quiero seguir explorando".`;

export const SAFETY_FOLLOWUP = `Sigo acá. Si estás pasando un momento difícil, por favor hablá con un adulto de confianza o llamá a la Línea Vida (0800 0767 o *0767, 24 horas, gratuita). Si te sentís bien para retomar la exploración, escribime "quiero seguir explorando".`;

/** La persona pide volver explícitamente a la exploración. */
export function wantsToResume(text: string) {
  return /\b(quiero|podemos|me gustaria) (seguir|volver|retomar)( (a|con) (la )?(explorar|exploracion|charla|preguntas))?|\bseguir explorando\b|\bretomemos\b|\bsigamos\b/.test(norm(text));
}
