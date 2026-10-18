import { commonOptions, indicator, optionsOf, rubric, type Area, type SlotId } from "@/lib/rubric";
import { LLMUnavailable, type LLMProvider } from "@/lib/llm/provider";
import { ACTION_GUIDE_V2, INTERVIEWER_V2_SYSTEM, SLOT_GUIDE } from "@/prompts/interviewer.v2";
import { check } from "./guards";
import { INTENT_GUIDE } from "./intents";
import { essentialsMet } from "./planner-v2";
import { active, panelLabel, topAreas } from "./profile";
import type { Action, OptionRef, SessionState } from "./types";

/**
 * Entrevistador v2 (spec demo-um-udelar, design.md §6). El LLM redacta solo el texto de la pregunta
 * (saludo, pregunta de un casillero y profundización); las opciones salen del banco y se adjuntan aparte.
 * Mini-resumen, oferta de cierre y "te dejo opciones" son plantillas fijas: no gastan LLM ni pueden fallar.
 */

/** Botón "Una pregunta más" de la oferta de cierre (no está en el banco). */
export const ONE_MORE: OptionRef = { id: "one_more", label: "Una pregunta más" };
export const SEE_PROFILE: OptionRef = { id: "see_profile", label: "Ver mi perfil" };
export const SUMMARY_OPTIONS: OptionRef[] = [
  { id: "summary_yes", label: "Sí, me representa" },
  { id: "summary_partial", label: "Más o menos" },
  { id: "summary_no", label: "No, no es así" },
];

const OPTIONS_DEFAULT = rubric.limits.optionsDefault?.[1] ?? 6;
const OPTIONS_AFTER_NO_INFO = rubric.limits.optionsAfterNoInfo ?? 8;
const ref = (o: { id: string; label: string }): OptionRef => ({ id: o.id, label: o.label });

/**
 * Opciones en botones para una acción: las del casillero que la persona todavía no eligió (3 a 6, u 8 después de
 * una respuesta sin información), más siempre "Ninguna de estas" y "Prefiero no decir".
 */
export function optionsFor(s: SessionState, a: Action): OptionRef[] {
  if (a.type === "MINI_SUMMARY") return SUMMARY_OPTIONS;
  if (a.type === "OFFER_CLOSE") return [SEE_PROFILE, ONE_MORE];
  if (a.type === "CLOSE" || a.type === "SAFETY") return [];
  const common = commonOptions().map(ref);
  if (!a.slot || a.type === "ASK_DEEPEN") return common;
  const said = new Set(s.messages.filter((m) => m.role === "USER").map((m) => m.content.trim().toLowerCase()));
  const max = a.type === "OFFER_OPTIONS" ? OPTIONS_AFTER_NO_INFO : OPTIONS_DEFAULT;
  const own = optionsOf(a.slot).filter((o) => !said.has(o.label.toLowerCase())).slice(0, max).map(ref);
  return [...own, ...common];
}

// ---------------------------------------------------------------------------------------------
// Plantillas (sin LLM)
// ---------------------------------------------------------------------------------------------
const SLOT_ASK: Record<SlotId, string> = {
  E1: "¿Cómo estás hoy con esto de elegir qué hacer después?",
  E2: "¿Qué cosas disfrutás hacer, de esas que se te pasan las horas?",
  E3: "Si pensás en un trabajo o estudio que te deje conforme, ¿qué tendría que tener sí o sí?",
  C1: "¿Hay algo práctico que tengas que tener en cuenta, como horarios, plata o dónde vivís?",
  C2: "¿Y qué cosas preferirías evitar, aunque puedas hacerlas?",
  C3: "¿Me contás algo que hayas hecho hace poco y te haya gustado mucho?",
};
const SLOT_OPTIONS_ASK: Record<SlotId, string> = {
  E1: "¿Cuál se parece más a cómo estás con esto de elegir?",
  E2: "¿Cuál de estas cosas disfrutás más?",
  E3: "¿Qué te importaría más en lo que hagas?",
  C1: "¿Hay algo de esto que tengas que tener en cuenta?",
  C2: "¿Hay algo de esto que preferirías evitar?",
  C3: "¿Me contás algo que hayas hecho hace poco y te haya gustado?",
};
const INTENT_OPENERS: Record<NonNullable<Action["intent"]>, string> = {
  CLOSE: "Ya casi.",
  ALREADY_SAID: "Tenés razón, ya me lo contaste.",
  CONFUSED: "Perdón, lo pregunto más fácil.",
  ASK_RECOMMENDATION: "Al final te muestro caminos concretos para investigar; para eso necesito conocerte un poco más.",
  SAD: "Lamento que estés así. Si es más que lo de estudiar, hablarlo con alguien de confianza ayuda (Línea Vida: 0800 0767, 24 h). Vamos de a poco.",
  ABOUT_BOT: "Sí, soy una IA: te hago pocas preguntas para ayudarte a pensar qué te gusta, pero no decido por vos.",
  PROGRESS: `Son ${rubric.limits.maxQuestions ?? 8} preguntas como mucho, y podés ver tu perfil cuando quieras.`,
};
const AREA_PLAIN: Record<Area, string> = {
  R: "hacer cosas con las manos o el cuerpo",
  I: "entender cómo funcionan las cosas",
  A: "crear y expresarte",
  S: "ayudar y acompañar a otros",
  E: "organizar y convencer a otros",
  C: "ordenar y registrar",
};

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];
const shortQuote = (q: string, n = 10) => {
  const w = q.replace(/[¿?"]/g, "").trim().split(/\s+/);
  return w.length > n ? `${w.slice(0, n).join(" ")}…` : w.join(" ");
};
const lastUser = (s: SessionState) => [...s.messages].reverse().find((m) => m.role === "USER");

/** Texto fijo del mini-resumen: las áreas que más aparecieron, en lenguaje llano, con una cita. */
export function miniSummaryText(s: SessionState) {
  const areas = topAreas(active(s), 2);
  if (!areas.length) return "Hasta acá todavía veo poco, y está bien. ¿Te parece que sigamos un poco más?";
  // La cita: mejor algo que escribió con sus palabras (y concreto) que el texto de un botón.
  const fromOption = (e: { rationale: string }) => e.rationale.startsWith("Opción elegida");
  const support = active(s)
    .filter((e) => e.polarity === 1 && e.indicatorId !== "N3.RECHAZO" && e.area === areas[0])
    .sort((x, y) => Number(fromOption(x)) - Number(fromOption(y)) || Number(y.concrete) - Number(x.concrete))[0];
  const what = areas.map((a) => AREA_PLAIN[a]).join(" y ");
  const cite = support ? `, por ejemplo cuando ${fromOption(support) ? "elegiste" : "dijiste"} "${shortQuote(support.quote)}"` : "";
  return `Hasta acá veo que te tira ${what}${cite}. ¿Va por ahí?`;
}

export function templateV2(s: SessionState, a: Action): string {
  const slot = a.slot;
  const user = lastUser(s);
  const added = Boolean(user && s.evidence.some((e) => e.messageId === user.id));
  // Reconocer lo que pesa (miedo a equivocarse, lo que esperan en casa) antes de seguir preguntando.
  const said = user ? s.evidence.filter((e) => e.messageId === user.id && e.status !== "REJECTED") : [];
  const empathy = said.some((e) => e.indicatorId === "N0.CREENCIAS")
    ? "Es re común tener ese miedo, y elegir algo no es para siempre."
    : said.some((e) => e.indicatorId === "N0.CONF_EXT" || e.indicatorId === "N4.INFLUENCIA")
      ? "Tiene sentido que pese lo que esperan en tu casa; acá importa lo que te pasa a vos."
      : "";
  const opener = [a.intent ? INTENT_OPENERS[a.intent] : "", empathy].filter(Boolean).join(" ");
  switch (a.type) {
    case "GREETING":
      return "¡Hola! Soy una IA para explorar qué te gusta y qué te importa. No es un test: son pocas preguntas y no hace falta tener nada claro. ¿Cómo estás hoy con esto de elegir qué hacer después?";
    case "OFFER_OPTIONS": {
      const lead = opener || pick(["Tranqui, no hace falta tenerlo claro.", "Dale, vamos por otro lado.", "No pasa nada."], s.userTurns);
      return `${lead} Te dejo algunas opciones. ${SLOT_OPTIONS_ASK[slot ?? "E2"]}`;
    }
    case "ASK_DEEPEN": {
      const target = [...s.evidence].reverse().find((e) => e.indicatorId === a.indicatorId && e.status !== "REJECTED");
      const echo = target ? shortQuote(target.quote) : "";
      return `${opener ? opener + " " : ""}${echo ? `Dijiste "${echo}". ` : ""}¿Me contás la última vez que lo hiciste y qué parte te gustó más?`;
    }
    case "MINI_SUMMARY":
      // Si acaba de contar algo que pesa (miedo, presión), se reconoce antes del resumen.
      return [opener, miniSummaryText(s)].filter(Boolean).join(" ");
    case "OFFER_CLOSE":
      // Honesto: solo dice "ya puedo armarte un perfil" si tiene los imprescindibles (si no, ofrece lo que hay).
      return [
        opener,
        essentialsMet(s)
          ? "Con lo que me contaste ya puedo armarte un perfil. ¿Lo vemos ahora o preferís una pregunta más?"
          : "Todavía sé poco de vos, pero puedo mostrarte lo que tengo hasta ahora. ¿Lo vemos o preferís una pregunta más?",
      ]
        .filter(Boolean)
        .join(" ");
    case "ASK_SLOT":
    default: {
      const ack = added && !opener ? pick(["Buenísimo.", "Te sigo.", "Gracias por contarlo.", "Ok, anotado."], s.userTurns) : "";
      // La pregunta sale del casillero, para que coincida con los botones; la segunda vez, una alternativa.
      const asked = s.messages.filter((m) => m.role === "ASSISTANT" && m.action?.slot === slot).length;
      const question = asked > 0 ? SLOT_OPTIONS_ASK[slot ?? "E2"] : SLOT_ASK[slot ?? "E2"];
      return [opener, ack, question].filter(Boolean).join(" ");
    }
  }
}

// ---------------------------------------------------------------------------------------------
// LLM (saludo, pregunta de casillero y profundización)
// ---------------------------------------------------------------------------------------------
// El saludo es fijo: así abrir la charla es instantáneo aunque Gemini esté lento o sin cuota.
const LLM_ACTIONS = new Set<Action["type"]>(["ASK_SLOT", "ASK_DEEPEN"]);
/** Si el LLM tarda más que esto en redactar una pregunta, se usa la plantilla (que ya es buena). */
const LLM_QUESTION_MS = 8_000;
const MAX_WORDS = 45;

const normQ = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
const questionPart = (t: string) => t.match(/¿[^?]*\?/g)?.at(-1) ?? t;
/** El texto repite una pregunta que el asistente ya hizo en la charla. */
function repeats(s: SessionState, draft: string) {
  const q = normQ(questionPart(draft));
  return s.messages.some((m) => m.role === "ASSISTANT" && (normQ(m.content) === normQ(draft) || normQ(questionPart(m.content)) === q));
}

function buildPromptV2(s: SessionState, a: Action) {
  const ind = a.indicatorId ? indicator(a.indicatorId) : undefined;
  const recent = s.messages.slice(-4).map((m) => `${m.role === "USER" ? "Persona" : "Vos"}: ${m.content}`).join("\n");
  const told = active(s)
    .filter((e) => e.polarity === 1)
    .slice(-8)
    .map((e) => `- ${panelLabel(e)} ("${shortQuote(e.quote, 12)}")`);
  const asked = s.messages.filter((m) => m.role === "ASSISTANT").map((m) => `- ${questionPart(m.content)}`).slice(-8);
  return `ACCIÓN: ${a.type}
QUÉ HACER: ${ACTION_GUIDE_V2[a.type] ?? ""}${a.intent ? `\nATENDÉ PRIMERO ESTO: ${INTENT_GUIDE[a.intent]}` : ""}
TEMA A PREGUNTAR: ${a.slot ? SLOT_GUIDE[a.slot] : ""}${a.slot ? `\nPregunta de referencia (tiene que encajar con los botones): ${SLOT_ASK[a.slot]}` : ind ? `\nPregunta de referencia: ${ind.exampleQuestions[0]}` : ""}

LO QUE YA CONTÓ (no se lo vuelvas a preguntar)
${told.length ? told.join("\n") : "(nada todavía)"}

PREGUNTAS QUE YA HICISTE (no repitas ninguna)
${asked.length ? asked.join("\n") : "(ninguna)"}

ÚLTIMOS MENSAJES
${recent || "(inicio de la charla)"}

Escribí solo el mensaje.`;
}

export async function writeV2(provider: LLMProvider, s: SessionState, a: Action): Promise<{ text: string; source: "llm" | "retry" | "template" }> {
  const said = s.messages.filter((m) => m.role === "USER").map((m) => m.content).join(" \n ");
  const ok = (t: string) => check(t, "interview", said).ok && !repeats(s, t);
  if (provider.name !== "mock" && LLM_ACTIONS.has(a.type)) {
    let prompt = buildPromptV2(s, a);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const draft = (await provider.text({ system: INTERVIEWER_V2_SYSTEM, prompt, maxMs: LLM_QUESTION_MS })).replace(/\*\*/g, "").trim();
        const g = check(draft, "interview", said);
        if (draft.split(/\s+/).length > MAX_WORDS) g.reasons.push(`tiene más de ${MAX_WORDS} palabras`);
        if (repeats(s, draft)) g.reasons.push("repite una pregunta que ya hiciste");
        if (!g.reasons.length) return { text: draft, source: attempt ? "retry" : "llm" };
        prompt += `\n\nTu borrador anterior no pasó las validaciones: ${g.reasons.join("; ")}. Reescribilo corrigiendo eso.`;
      } catch (err) {
        console.warn(JSON.stringify({ event: "interviewer.error", attempt, error: String(err).slice(0, 120) }));
        if (err instanceof LLMUnavailable) break;
      }
    }
  }
  const t = templateV2(s, a);
  if (ok(t) || a.type === "MINI_SUMMARY" || a.type === "OFFER_CLOSE") return { text: t, source: "template" };
  // Si la plantilla repite una pregunta anterior, la alternativa del casillero.
  const alt = `${a.intent ? INTENT_OPENERS[a.intent] + " " : ""}${SLOT_OPTIONS_ASK[a.slot ?? "E2"]}`;
  return { text: ok(alt) ? alt : t, source: "template" };
}
