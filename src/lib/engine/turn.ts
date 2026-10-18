import { v2Defaults } from "./defaults";
import { RUBRIC_VERSION } from "@/lib/rubric";
import { logEvent } from "@/lib/events";
import type { LLMProvider } from "@/lib/llm/provider";
import { ANALYZER_PROMPT_VERSION } from "@/prompts/analyzer.v1";
import { INTERVIEWER_PROMPT_VERSION } from "@/prompts/interviewer.v1";
import { analyze } from "./analyzer";
import { write } from "./interviewer";
import { maskPII } from "./pii";
import { detectIntent, MIN_TURNS_TO_CLOSE } from "./intents";
import { next, withIntent } from "./planner";
import { applyAnalysis, countTurnInLevel, markSummarized, newId, reopenLevel, resolveLevelConfirmation } from "./profile";
import { precheck, SAFETY_FOLLOWUP, SAFETY_MESSAGE, wantsToResume } from "./safety";
import type { Action, AgeRange, SessionState } from "./types";

/**
 * Orquestador del turno (A0, Parte 1). Orden fijo (Documento 2, sección 4):
 * guardar (enmascarado) → seguridad → analizador → perfil → planificador → entrevistador → guardas → guardar.
 */
export const PROMPT_VERSION = `${ANALYZER_PROMPT_VERSION}+${INTERVIEWER_PROMPT_VERSION}`;
export const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 30);
export const MIN_AGE = Number(process.env.MIN_AGE ?? 18);
export const CONSENT_VERSION = "consent.v1";

export const AGE_MIN: Record<AgeRange, number> = { A14_15: 14, A16_17: 16, A18_21: 18, A22_25: 22, A26_MAS: 26 };

export function newSession(opts: { ageRange: AgeRange; guardianConsent: boolean; model: string; userId?: string }): SessionState {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RETENTION_DAYS * 86_400_000).toISOString(),
    ageRange: opts.ageRange,
    consentAt: now.toISOString(),
    guardianConsent: opts.guardianConsent,
    status: "ACTIVE",
    phase: "DISCOVERY",
    currentLevel: 0,
    userTurns: 0,
    rubricVersion: RUBRIC_VERSION,
    promptVersion: PROMPT_VERSION,
    model: opts.model,
    userId: opts.userId,
    messages: [],
    evidence: [],
    levels: [0, 1, 2, 3].map((level) => ({ level, status: "OPEN" as const, turns: 0 })),
    pendingConfirmation: null,
    lastAction: null,
    lastIndicator: null,
    sameIndicatorTries: 0,
    qualityHistory: [],
    flatStrategyTried: false,
    closeOffered: false,
    beliefExamsInRow: 0,
    beliefExamsTotal: 0,
    lastN4Turn: 0,
    wentBack: [],
    openContradictions: [],
    safetyEvents: [],
    consents: [{ purpose: "session", version: CONSENT_VERSION, status: "granted", at: now.toISOString() }],
    tasks: [],
    recommendations: [],
    selectedPathId: null,
    pathQuestions: [],
    mentorResult: null,
    nextStep: null,
    feedback: null,
    ...v2Defaults(),
  };
}

function say(s: SessionState, content: string, action: Action) {
  s.messages.push({ id: newId("msg"), role: "ASSISTANT", content, action, createdAt: new Date().toISOString() });
  s.lastAction = action;
}

/** Aplica efectos de la acción elegida sobre el estado (antes de redactar). */
function commit(s: SessionState, a: Action) {
  if (a.type === "ADVANCE_LEVEL") s.currentLevel = Math.min(3, a.level);
  if (a.setLevel !== undefined) s.currentLevel = a.setLevel;
  if (a.type === "GO_BACK") {
    reopenLevel(s, a.level);
    if (a.indicatorId) s.wentBack.push(a.indicatorId);
  }
  if (a.type === "FLAT_PROFILE_STRATEGY") s.flatStrategyTried = true;
  if (a.type === "OFFER_CLOSE") s.closeOffered = true;
  if (a.type === "EXAMINE_BELIEF") {
    s.beliefExamsInRow += 1;
    s.beliefExamsTotal += 1;
  } else s.beliefExamsInRow = 0;
  if (a.level === 4 || a.indicatorId?.startsWith("N4.")) s.lastN4Turn = s.userTurns;
  if (a.indicatorId) {
    s.sameIndicatorTries = a.indicatorId === s.lastIndicator && (a.type === "ASK_DEEPEN" || a.type === "WAIT_CONFIRMATION") ? s.sameIndicatorTries + 1 : 0;
    s.lastIndicator = a.indicatorId;
  }
}

export function closeSession(s: SessionState) {
  s.status = "COMPLETED";
  s.phase = "PROFILE_REVIEW";
  logEvent("profile.closed", { session: s.id, turns: s.userTurns, evidence: s.evidence.length });
}

const CLOSE_TEXT =
  "Listo, con todo lo que me contaste armé tu devolución: lo que más aparece, tus intereses concretos y lo que te importa. Revisala tranquilo, corregí lo que no te represente y, si querés, después exploramos caminos para investigar.";

/** Primer mensaje del agente (sin mensaje de la persona). */
export async function greet(provider: LLMProvider, s: SessionState) {
  const a = next(s);
  commit(s, a);
  const { text } = await write(provider, s, a);
  say(s, text, a);
  return { reply: text, action: a };
}

/** Procesa un turno completo. Muta `s`. */
export async function runTurn(provider: LLMProvider, s: SessionState, rawText: string, opts: { forceClose?: boolean } = {}) {
  // 1. Guardar mensaje de la persona con datos personales enmascarados (R15).
  const text = maskPII(rawText.trim().slice(0, 2000));
  const msgId = newId("msg");
  s.messages.push({ id: msgId, role: "USER", content: text, createdAt: new Date().toISOString() });
  logEvent("message.received", { session: s.id, turn: s.userTurns + 1, chars: text.length });

  // Sesión detenida por seguridad: solo se retoma si lo pide explícitamente y no hay riesgo actual.
  if (s.status === "SAFETY_STOP") {
    const risk = precheck(text);
    if (!risk.flag && wantsToResume(text)) {
      s.status = "ACTIVE";
    } else {
      if (risk.flag) recordSafety(s, msgId, risk.category ?? "MALESTAR_INTENSO");
      say(s, risk.flag ? SAFETY_MESSAGE : SAFETY_FOLLOWUP, { type: "SAFETY", level: s.currentLevel });
      return { reply: s.messages[s.messages.length - 1].content, action: s.lastAction!, safety: true };
    }
  }
  if (s.status === "COMPLETED") return { reply: CLOSE_TEXT, action: { type: "CLOSE", level: s.currentLevel } as Action, safety: false };

  s.userTurns += 1;
  countTurnInLevel(s, s.currentLevel);

  // 2. Prechequeo de seguridad por reglas.
  const pre = precheck(text);
  if (pre.flag) return safetyStop(s, msgId, pre.category ?? "MALESTAR_INTENSO");

  // 3–4. Analizador + bandera de riesgo del analizador.
  const { output, fallback } = await analyze(provider, s, text);
  if (fallback) logEvent("agent.fallback", { session: s.id, agent: "analyzer" });
  if (output.risk.flag) return safetyStop(s, msgId, output.risk.category ?? "MALESTAR_INTENSO");

  // 5. Perfil. Una intención explícita ("quiero terminar", "ya te lo dije", "no entiendo") no es una respuesta
  // breve: no cuenta para pedir ejemplos, y "no entiendo" tampoco cuenta como respuesta al resumen pendiente.
  let intent = detectIntent(text);
  if (intent) logEvent("intent.detected", { session: s.id, intent });
  // Segundo "no entiendo" seguido sobre el mismo resumen: no se vuelve a explicar, se toma como parcial y se sigue.
  if (intent === "CONFUSED" && s.pendingConfirmation && s.lastAction?.intent === "CONFUSED") {
    resolveLevelConfirmation(s, s.pendingConfirmation.level, "PARTIAL");
    intent = null;
  }
  const hadPending = s.pendingConfirmation?.level;
  const pendingTries = s.pendingConfirmation?.tries;
  applyAnalysis(s, intent === "CONFUSED" ? { ...output, confirmation: undefined, evidence: [] } : output, msgId, text);
  if (intent === "CONFUSED" && s.pendingConfirmation && pendingTries !== undefined) s.pendingConfirmation.tries = pendingTries;
  s.qualityHistory = [...s.qualityHistory, intent ? "OFF_TOPIC" : output.answerQuality].slice(-6);
  logEvent("profile.updated", { session: s.id, evidence: s.evidence.length, level: s.currentLevel });
  if (hadPending !== undefined && !s.pendingConfirmation) logEvent("level.confirmed", { session: s.id, level: hadPending, result: output.confirmation?.result ?? "PARTIAL" });

  // 6. Planificador (o cierre pedido por la persona).
  const planned = next(s);
  const a: Action = opts.forceClose ? { type: "CLOSE", level: s.currentLevel } : intent ? withIntent(s, planned, intent, MIN_TURNS_TO_CLOSE) : planned;
  commit(s, a);
  if (a.type === "CLOSE") {
    closeSession(s);
    say(s, CLOSE_TEXT, a);
    return { reply: CLOSE_TEXT, action: a, safety: false };
  }

  // 7–8. Entrevistador + guardas.
  const { text: reply, source } = await write(provider, s, a);
  if (source === "template" && provider.name !== "mock") logEvent("agent.fallback", { session: s.id, agent: "interviewer" });
  if (a.type === "SUMMARIZE_LEVEL") {
    markSummarized(s, a.level, reply);
    logEvent("level.summarized", { session: s.id, level: a.level });
  }
  // 9. Guardar mensaje del agente con su acción.
  say(s, reply, a);
  return { reply, action: a, safety: false };
}

function recordSafety(s: SessionState, messageId: string, category: string) {
  // Se registra la categoría, nunca el texto del mensaje.
  s.safetyEvents.push({ id: newId("safety"), category, at: new Date().toISOString() });
  logEvent("safety.stop", { session: s.id, category, message: messageId });
}

function safetyStop(s: SessionState, messageId: string, category: string) {
  s.status = "SAFETY_STOP";
  recordSafety(s, messageId, category);
  const a: Action = { type: "SAFETY", level: s.currentLevel };
  say(s, SAFETY_MESSAGE, a);
  return { reply: SAFETY_MESSAGE, action: a, safety: true };
}
