import { rubric } from "@/lib/rubric";

/**
 * Intenciones de la persona que no son respuestas a la pregunta: pedir terminar, reclamar que ya lo dijo,
 * no entender, o pedir una recomendación. Deterministas (funcionan igual con Gemini o con reglas)
 * y se evalúan antes que el planificador, que si no las trataba como respuestas "breves".
 */
export type Intent = "CLOSE" | "ALREADY_SAID" | "CONFUSED" | "ASK_RECOMMENDATION" | "SAD" | "ABOUT_BOT" | "PROGRESS";

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const RULES: [Intent, RegExp][] = [
  [
    "CLOSE",
    /\b(quiero (terminar|cortar|parar|ver (los |mis )?resultados|ver lo que entendiste)|terminemos|cortemos|no quiero (mas|seguir)( preguntas| respondiendo| contestando)?|basta de preguntas|ya (fue|esta bien),? (terminemos|cortemos)|mostrame (los |mis )?resultados|dame (los |mis )?resultados|ver (los |mis )?resultados ya|(quiero )?ver (mi |el )?perfil|quiero (el|mi|los|mis) resultados?|mostrame (lo que entendiste|el perfil|mi perfil))\b|^(ya esta|basta|listo,? terminemos)[.!]*$/,
  ],
  ["ALREADY_SAID", /\b(ya te (lo )?(dije|explique|conte|respondi)|eso ya te lo|te lo acabo de decir|(otra vez|de nuevo) (lo mismo|la misma pregunta)|me (estas )?(repitiendo|repetis)|ya lo (dije|conte|respondi)|no entendiste|no me entendiste|no me estas escuchando)\b/],
  ["CONFUSED", /\b(no (te )?entiendo( (que|lo que) (decis|me preguntas|me decis))?$|que (me )?(decis|quisiste decir|significa eso)|de que (me )?(hablas|estas hablando)|no se (a )?que te referis)\b|^(que|eh|como)\?+$|^\?+$/],
  ["ASK_RECOMMENDATION", /\b(que me recomend\w*|que (carrera|estudio|deberia estudiar|tendria que estudiar|me conviene estudiar)|decime (una|que) (carrera|estudiar|hacer|estudio)|recomenda(me|s) (una carrera|algo|que estudiar)|para que (carrera )?sirvo|que (puedo|podria) estudiar)\b/],
  // Tristeza o bajón SIN riesgo (el riesgo lo detecta antes safety.ts y corta la charla): contener y seguir.
  ["SAD", /\b(estoy (re |muy |medio |bastante |super )?(triste|mal|bajonead[oa]|angustiad[oa]|deprimid[oa]|depre)|me siento (re |muy |medio )?(mal|triste|sol[oa]|vaci[oa]|perdid[oa])|ando (re |muy )?(triste|mal|bajonead[oa])|no me hallo|todo me sale mal)\b/],
  ["ABOUT_BOT", /\b(sos (un |una )?(bot|robot|ia|inteligencia artificial|humano|persona|real|chatgpt)|eres (un )?bot|hablo con (un bot|una maquina|una persona|alguien)|quien sos|que sos)\b/],
  ["PROGRESS", /\b(cuantas (preguntas )?(faltan|quedan|son|mas)|falta mucho|cuanto (falta|dura|tarda|queda)|ya (termina|terminamos)\?)/],
];

/** La primera intención que matchea, en orden de prioridad (cerrar gana sobre todo lo demás). */
export function detectIntent(text: string): Intent | null {
  const t = norm(text);
  // Un mensaje largo es una respuesta, aunque incluya alguna de estas frases.
  if (!t || t.length > 220) return null;
  for (const [intent, re] of RULES) {
    // "No entiendo la matemática" es una respuesta, no confusión: solo mensajes cortos.
    if (intent === "CONFUSED" && t.split(" ").length > 8) continue;
    if (re.test(t)) return intent;
  }
  return null;
}

/** Turnos mínimos para que un pedido de cierre lleve a una devolución con algo de contenido. */
export const MIN_TURNS_TO_CLOSE = 3;

/** Lo que el entrevistador tiene que hacer con cada intención (va al prompt del LLM y elige la plantilla). */
export const INTENT_GUIDE: Record<Intent, string> = {
  CLOSE: "La persona quiere terminar pero todavía falta información. Decile en una frase que con una o dos respuestas más ya le podés mostrar algo útil, y hacé la pregunta. Sin presionar.",
  ALREADY_SAID: "La persona reclamó que ya lo había dicho. Reconocelo en pocas palabras (\"Tenés razón\"), no repitas la pregunta anterior ni pidas lo mismo de otra forma, y pasá a otro tema.",
  CONFUSED: "La persona no entendió el mensaje anterior. Pedí perdón en pocas palabras y reformulá lo mismo más simple, con palabras cotidianas y un ejemplo.",
  ASK_RECOMMENDATION:
    "La persona pidió que le recomiendes qué estudiar. Explicale en una frase que al final de la charla le mostrás caminos concretos para investigar, con fuentes, y que para eso te falta conocerla un poco más. No nombres carreras. Después hacé la pregunta.",
  SAD: "La persona dijo que está triste o mal. Validalo con calidez en una frase, sin diagnosticar ni minimizar; decile que si es más que lo de estudiar, hablarlo con alguien de confianza ayuda (Línea Vida 0800 0767, 24 horas). Después, con suavidad, la pregunta.",
  ABOUT_BOT: "La persona preguntó si sos un bot. Decile que sí, que sos una IA que hace pocas preguntas para ayudarla a pensar qué le gusta, y que no decidís por ella. Después la pregunta.",
  PROGRESS: `La persona preguntó cuánto falta. Decile que son ${rubric.limits.maxQuestions ?? 8} preguntas como mucho y que puede ver su perfil cuando quiera. Después la pregunta.`,
};
