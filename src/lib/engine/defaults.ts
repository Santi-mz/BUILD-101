import type { SessionState, V2State } from "./types";

/** Valores iniciales del estado v2 (spec demo, design.md §3). */
export const v2Defaults = (): V2State => ({
  questionsAsked: 0,
  stall: 0,
  llmFailures: 0,
  askedCount: {},
  deepened: [],
  miniSummaryDone: false,
  offerAccepted: false,
  extraAsked: false,
  slotsAsked: [],
  closeRequested: false,
  closeReason: null,
  provisional: false,
  lastOptions: null,
});

const countQuestions = (s: Pick<SessionState, "messages">) => (s.messages ?? []).filter((m) => m.role === "ASSISTANT" && m.content.includes("?")).length;

/**
 * Completa una sesión guardada antes de la v2 con los campos nuevos. Las preguntas ya hechas se cuentan desde
 * los mensajes, así una sesión vieja que ya pasó el tope cierra en el próximo turno (design.md, Error Handling).
 */
export function withDefaults(s: SessionState): SessionState {
  const d = v2Defaults();
  const out = { ...d, ...s } as SessionState;
  if (!("questionsAsked" in s)) out.questionsAsked = countQuestions(s);
  if (!("closeOffered" in s)) out.closeOffered = false;
  return out;
}
