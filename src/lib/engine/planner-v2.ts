import { AREAS, rubric, type SlotId } from "@/lib/rubric";
import { detectIntent } from "./intents";
import { active, topAreas, weight } from "./profile";
import type { Action, SessionState } from "./types";

/**
 * Planificador v2 (spec .kiro/specs/demo-um-udelar, design.md §4): presupuesto de 8 preguntas,
 * casilleros de suficiencia y salida garantizada. Puro: no llama al LLM ni modifica el estado.
 *
 * Todo lo que decide se deriva también de la transcripción (preguntas hechas, casilleros preguntados,
 * profundizaciones, mini-resumen, oferta de cierre): el tope se cumple aunque un contador del estado
 * quede atrasado o la sesión venga de antes de la v2.
 */

/** Sesión con la rúbrica v1 (planificador por niveles) o v2 (presupuesto de preguntas). */
export const isV2 = (s: Pick<SessionState, "rubricVersion">) => !s.rubricVersion?.startsWith("1.");

const LIMITS = {
  maxQuestions: rubric.limits.maxQuestions ?? 8,
  offerCloseFrom: rubric.limits.offerCloseFrom ?? 4,
  closeWhenSufficientFrom: rubric.limits.closeWhenSufficientFrom ?? 5,
  stallToClose: rubric.limits.stallToClose ?? 2,
  miniSummaryFrom: 3,
  miniSummaryUntil: rubric.limits.miniSummaryUntil ?? 5,
  maxSlotAsks: 2,
};
export const MAX_QUESTIONS = LIMITS.maxQuestions;

const SLOT_ORDER: SlotId[] = rubric.slots?.length
  ? [...rubric.slots].sort((a, b) => a.priority - b.priority).map((x) => x.id)
  : ["E1", "E2", "E3", "C1", "C2", "C3"];
const ESSENTIAL: SlotId[] = ["E1", "E2", "E3"];
const COMPLEMENTARY: SlotId[] = ["C1", "C2", "C3"];
/** Indicadores con los que se pregunta cada casillero (con preguntas de ejemplo que terminan en "?"). */
const SLOT_QUESTIONS: Record<SlotId, string[]> = {
  E1: ["N0.ESTADO", "N0.INFO"],
  E2: ["N1.PERSONAS", "N3.FLOW", "N3.TEMA", "N2.I"],
  E3: ["N4.VALOR"],
  C1: ["N4.BARRERA"],
  C2: ["N3.RECHAZO"],
  C3: ["N3.ACTIVIDAD"],
};
const INTEREST = /^N2\.|^N3\.(ACTIVIDAD|TEMA|FLOW|ROL)$/;
/** Acciones que son preguntas de la IA aunque el texto no tenga "?" (para no contar de menos). */
const QUESTION_ACTIONS = new Set<Action["type"]>([
  "GREETING", "ASK_SLOT", "OFFER_OPTIONS", "ASK_DEEPEN", "MINI_SUMMARY", "OFFER_CLOSE",
  "ASK_NEW", "CHANGE_ANGLE", "WAIT_CONFIRMATION", "SUMMARIZE_LEVEL", "ADVANCE_LEVEL", "GO_BACK", "FLAT_PROFILE_STRATEGY", "EXAMINE_BELIEF",
]);

/** Frases de "sin información" (normalizadas sin tildes), design.md §4. */
const NO_INFO_TEXT = /^(no se|nose|ni idea|depende|capaz|puede ser|que se yo|paso|nada|ninguna|ninguno|no me interesa|no tengo idea|no|ninguna de estas|prefiero no decir)[.!?\s]*$/;
const normText = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

const assistantMsgs = (s: SessionState) => s.messages.filter((m) => m.role === "ASSISTANT");
const userMsgs = (s: SessionState) => s.messages.filter((m) => m.role === "USER");

/** Preguntas de la IA hechas hasta ahora: el mayor entre el contador del estado y la transcripción. */
export function questionsAsked(s: SessionState) {
  const fromTranscript = assistantMsgs(s).filter((m) => m.content.includes("?") || QUESTION_ACTIONS.has(m.action?.type ?? "CLOSE")).length;
  return Math.max(s.questionsAsked ?? 0, fromTranscript);
}

/** ¿Una respuesta es "sin información"? (design.md §4) */
export function isNoInfo(quality: string | undefined, evidenceAdded: boolean, analyzerFailed: boolean) {
  return analyzerFailed || quality === "EVASIVE" || quality === "OFF_TOPIC" || (quality === "BRIEF" && !evidenceAdded);
}

/** La k-ésima respuesta contando desde la última (0 = la última), con su evidencia y si fue sin información. */
function answerAt(s: SessionState, k: number) {
  const users = userMsgs(s);
  const msg = users[users.length - 1 - k];
  if (!msg) return null;
  const quality = s.qualityHistory[s.qualityHistory.length - 1 - k];
  const evidence = active(s).filter((e) => e.messageId === msg.id);
  // La respuesta al mini-resumen o a la oferta de cierre ("sí", "dale") no es una respuesta sin información.
  const idx = s.messages.indexOf(msg);
  const prev = s.messages.slice(0, idx).reverse().find((m) => m.role === "ASSISTANT");
  const neutral = prev?.action?.type === "MINI_SUMMARY" || prev?.action?.type === "OFFER_CLOSE";
  const noInfo = !neutral && evidence.length === 0 && (NO_INFO_TEXT.test(normText(msg.content)) || isNoInfo(quality, false, false));
  return { msg, evidence, noInfo };
}

/** Respuestas sin información seguidas al final de la charla. */
function stallCount(s: SessionState) {
  let n = 0;
  for (let k = 0; ; k++) {
    const a = answerAt(s, k);
    if (!a?.noInfo) break;
    n++;
  }
  return Math.max(s.stall ?? 0, n);
}

/** Veces que se preguntó un casillero (el saludo pregunta E1). */
const slotAsks = (s: SessionState, slot: SlotId) =>
  assistantMsgs(s).filter((m) => m.action?.slot === slot || (slot === "E1" && m.action?.type === "GREETING")).length;

/** ¿Contestó "ninguna" (o sin información) a la pregunta de un casillero? Cuenta como cubierto (C1). */
function answeredNoneTo(s: SessionState, slot: SlotId) {
  const msgs = s.messages;
  return msgs.some(
    (m, i) =>
      m.role === "ASSISTANT" &&
      m.action?.slot === slot &&
      msgs[i + 1]?.role === "USER" &&
      (NO_INFO_TEXT.test(normText(msgs[i + 1].content)) || /\bninguna en especial\b/i.test(msgs[i + 1].content)),
  );
}

/** Estado de los casilleros (design.md §1, Requirement 3.1). */
export function slotStatus(s: SessionState): Record<SlotId, boolean> {
  const ev = active(s).filter((e) => weight(e) > 0);
  const positive = ev.filter((e) => e.polarity === 1);
  const sameArea = AREAS.some((a) => positive.filter((e) => e.area === a && INTEREST.test(e.indicatorId)).length >= 2);
  return {
    E1: ev.some((e) => e.indicatorId.startsWith("N0.")) || slotAsks(s, "E1") >= 1,
    E2: sameArea,
    E3: positive.some((e) => e.indicatorId === "N4.VALOR"),
    C1: ev.some((e) => e.indicatorId === "N4.BARRERA") || answeredNoneTo(s, "C1") || (s.askedCount?.["done:C1"] ?? 0) > 0,
    C2: ev.some((e) => e.indicatorId === "N3.RECHAZO" || (e.polarity === -1 && e.indicatorId.startsWith("N2."))),
    C3: positive.some((e) => e.concrete && /^N[123]\./.test(e.indicatorId)),
  };
}

export const essentialsMet = (s: SessionState) => {
  const st = slotStatus(s);
  return ESSENTIAL.every((x) => st[x]);
};
export const complementaryCount = (s: SessionState) => {
  const st = slotStatus(s);
  return COMPLEMENTARY.filter((x) => st[x]).length;
};

/** Primer casillero imprescindible faltante y preguntado menos de 2 veces; después los complementarios. */
export function nextSlot(s: SessionState, exclude?: SlotId | null): SlotId | null {
  const st = slotStatus(s);
  for (const slot of SLOT_ORDER) if (slot !== exclude && !st[slot] && slotAsks(s, slot) < LIMITS.maxSlotAsks) return slot;
  return null;
}

/** Indicador con el que se pregunta un casillero: el primero de su lista que todavía no se usó. */
function slotIndicator(s: SessionState, slot: SlotId) {
  const used = new Set(assistantMsgs(s).map((m) => m.action?.indicatorId));
  return SLOT_QUESTIONS[slot].find((id) => !used.has(id)) ?? SLOT_QUESTIONS[slot][0];
}

function ask(s: SessionState, type: "ASK_SLOT" | "OFFER_OPTIONS", slot: SlotId): Action {
  const indicatorId = slotIndicator(s, slot);
  return { type, slot, indicatorId, level: Number(indicatorId.slice(1, 2)) };
}

/** Próxima acción v2, en el orden estricto de design.md §4. */
export function nextV2(s: SessionState): Action {
  const lvl = s.currentLevel;
  if (s.status === "SAFETY_STOP") return { type: "SAFETY", level: lvl };
  if (s.userTurns === 0) return { type: "GREETING", level: 0, slot: "E1", indicatorId: "N0.ESTADO" };

  const asked = questionsAsked(s);
  const last = answerAt(s, 0);
  const assistants = assistantMsgs(s);
  const prevAction = assistants.at(-1)?.action;

  // Pidió el perfil (botón o texto) → cerrar.
  if (s.closeRequested || (last && detectIntent(last.msg.content) === "CLOSE")) return { type: "CLOSE", level: lvl, reason: "user" };
  // Presupuesto agotado: nunca una novena pregunta.
  if (asked >= LIMITS.maxQuestions) return { type: "CLOSE", level: lvl, reason: "budget" };

  // Oferta de cierre: cualquier respuesta que no sea pedir el perfil cuenta como "Una pregunta más".
  const offerIdx = s.messages.findIndex((m) => m.role === "ASSISTANT" && m.action?.type === "OFFER_CLOSE");
  const closeOffered = s.closeOffered || offerIdx >= 0;
  const afterOffer = offerIdx >= 0 ? s.messages.slice(offerIdx + 1) : [];
  const offerAccepted = s.offerAccepted || afterOffer.some((m) => m.role === "USER");
  const extraAsked = s.extraAsked || afterOffer.some((m) => m.role === "ASSISTANT");
  if (offerAccepted && extraAsked) return { type: "CLOSE", level: lvl, reason: "offer_accepted" };
  if (offerAccepted) {
    const slot = nextSlot(s);
    return slot ? ask(s, "ASK_SLOT", slot) : { type: "CLOSE", level: lvl, reason: "sufficient" };
  }

  const ess = essentialsMet(s);
  // Suficiente: imprescindibles + al menos un complementario, desde la pregunta 5.
  if (ess && complementaryCount(s) >= 1 && asked >= LIMITS.closeWhenSufficientFrom) return { type: "CLOSE", level: lvl, reason: "sufficient" };
  // Ofrecer cerrar, una sola vez.
  if (ess && asked >= LIMITS.offerCloseFrom && !closeOffered) return { type: "OFFER_CLOSE", level: lvl };
  // Dos respuestas sin información seguidas, con algo de charla: perfil provisional.
  if (stallCount(s) >= LIMITS.stallToClose && asked >= LIMITS.offerCloseFrom) return { type: "CLOSE", level: lvl, reason: "stalled" };
  // LLM caído dos veces seguidas: ofrecer cerrar con lo que hay.
  if ((s.llmFailures ?? 0) >= 2 && !closeOffered) return { type: "OFFER_CLOSE", level: lvl };

  // Respuesta sin información: hasta 8 opciones y OTRO tema. Nunca pedir un ejemplo.
  if (last?.noInfo) {
    const slot = nextSlot(s, prevAction?.slot ?? null) ?? nextSlot(s);
    return slot ? ask(s, "OFFER_OPTIONS", slot) : { type: "CLOSE", level: lvl, reason: "stalled" };
  }

  // Información sin ejemplo: se pide un ejemplo concreto UNA sola vez en la charla (cuenta para C3), y solo al
  // principio. La spec permite uno por indicador; con varios intereses seguidos eso eran 5 pedidos de ejemplo al hilo.
  const deepened = new Set([...(s.deepened ?? []), ...assistants.filter((m) => m.action?.type === "ASK_DEEPEN").map((m) => m.action?.indicatorId)]);
  const interests = (last?.evidence ?? []).filter((e) => e.polarity === 1 && /^N[123]\./.test(e.indicatorId));
  if (interests.length && !interests.some((e) => e.concrete) && asked <= LIMITS.miniSummaryUntil && deepened.size === 0) {
    const target = interests.find((e) => !deepened.has(e.indicatorId));
    if (target) return { type: "ASK_DEEPEN", level: Number(target.indicatorId.slice(1, 2)), slot: "C3", indicatorId: target.indicatorId, notes: "pedir un ejemplo concreto" };
  }

  // Un único mini-resumen, entre la pregunta 3 y la 5, si ya se destaca algún área.
  const miniDone = s.miniSummaryDone || assistants.some((m) => m.action?.type === "MINI_SUMMARY");
  if (!miniDone && asked >= LIMITS.miniSummaryFrom && asked <= LIMITS.miniSummaryUntil && topAreas(active(s)).length >= 1) {
    return { type: "MINI_SUMMARY", level: 2 };
  }

  const slot = nextSlot(s);
  return slot ? ask(s, "ASK_SLOT", slot) : { type: "CLOSE", level: lvl, reason: "sufficient" };
}
