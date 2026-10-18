import { v2Defaults } from "./defaults";
import { optionById, RUBRIC_VERSION, type Area, type Axis } from "@/lib/rubric";
import { logEvent } from "@/lib/events";
import { LLMUnavailable, type LLMProvider } from "@/lib/llm/provider";
import { ANALYZER_PROMPT_VERSION } from "@/prompts/analyzer.v1";
import { INTERVIEWER_PROMPT_VERSION } from "@/prompts/interviewer.v1";
import { analyze } from "./analyzer";
import { write } from "./interviewer";
import { ONE_MORE, optionsFor } from "./interviewer-v2";
import { maskPII } from "./pii";
import { detectIntent, MIN_TURNS_TO_CLOSE } from "./intents";
import { essentialsMet, isNoInfo, isV2, MAX_QUESTIONS, next, withIntent } from "./planner";
import { active, applyAnalysis, countTurnInLevel, markSummarized, newId, reopenLevel, resolveLevelConfirmation, topAreas } from "./profile";
import { precheck, SAFETY_FOLLOWUP, SAFETY_MESSAGE, wantsToResume } from "./safety";
import type { Action, AgeRange, AnalyzerOutput, AnswerQuality, CloseReason, SessionState } from "./types";

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

/**
 * ¿El mensaje del asistente es una pregunta de la IA? Todo mensaje de la entrevista lo es (saludo, preguntas,
 * mini-resumen y oferta de cierre), aunque el texto no termine en "?"; el cierre y el de seguridad no.
 */
const isQuestion = (action: Action) => action.type !== "CLOSE" && action.type !== "SAFETY";

/**
 * Guarda el mensaje del asistente. En v2 cuenta las preguntas y es el freno de último recurso del tope:
 * si este mensaje fuera la pregunta 9, se reemplaza por el cierre (defensa en profundidad, design.md §5).
 */
function say(s: SessionState, content: string, action: Action): { content: string; action: Action } {
  if (isV2(s) && isQuestion(action)) {
    if (s.questionsAsked >= MAX_QUESTIONS) return closeWith(s, "budget");
    s.questionsAsked += 1;
  }
  s.messages.push({ id: newId("msg"), role: "ASSISTANT", content, action, createdAt: new Date().toISOString() });
  s.lastAction = action;
  if (isV2(s)) s.lastOptions = action.options?.length ? action.options : null;
  return { content, action };
}

/** Cierra la entrevista v2 sin LLM: motivo, perfil provisional si faltan imprescindibles y mensaje fijo. */
function closeWith(s: SessionState, reason: CloseReason): { content: string; action: Action } {
  closeSession(s, reason);
  const action: Action = { type: "CLOSE", level: s.currentLevel, reason };
  const content = s.provisional ? CLOSE_TEXT_PROVISIONAL : CLOSE_TEXT;
  s.messages.push({ id: newId("msg"), role: "ASSISTANT", content, action, createdAt: new Date().toISOString() });
  s.lastAction = action;
  s.lastOptions = null;
  return { content, action };
}

/** Efectos de una acción v2 sobre el estado (antes de redactar). */
function commitV2(s: SessionState, a: Action) {
  if (a.indicatorId) {
    s.askedCount[a.indicatorId] = (s.askedCount[a.indicatorId] ?? 0) + 1;
    s.lastIndicator = a.indicatorId;
  }
  if (a.slot) {
    s.askedCount[a.slot] = (s.askedCount[a.slot] ?? 0) + 1;
    if (!s.slotsAsked.includes(a.slot)) s.slotsAsked.push(a.slot);
  }
  if (a.type === "ASK_DEEPEN" && a.indicatorId && !s.deepened.includes(a.indicatorId)) s.deepened.push(a.indicatorId);
  if (a.type === "MINI_SUMMARY") s.miniSummaryDone = true;
  if (a.type === "OFFER_CLOSE") s.closeOffered = true;
  else if (s.offerAccepted && a.type !== "CLOSE") s.extraAsked = true;
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

/** Cierra la sesión. En v2 guarda el motivo y marca el perfil provisional si faltan los casilleros imprescindibles. */
export function closeSession(s: SessionState, reason?: CloseReason) {
  s.status = "COMPLETED";
  s.phase = "PROFILE_REVIEW";
  if (reason) {
    s.closeReason = reason;
    s.provisional = !essentialsMet(s);
  }
  logEvent("profile.closed", { session: s.id, turns: s.userTurns, evidence: s.evidence.length, reason: reason ?? null, provisional: s.provisional });
}

const CLOSE_TEXT =
  "Listo, con todo lo que me contaste armé tu devolución: lo que más aparece, tus intereses concretos y lo que te importa. Revisala tranquilo, corregí lo que no te represente y, si querés, después exploramos caminos para investigar.";
const CLOSE_TEXT_PROVISIONAL =
  "Listo. Charlamos poco, así que esto es un perfil provisional: te muestro lo que alcancé a ver y lo que todavía no sé de vos. Si querés, después seguimos y lo completamos.";

/** Tiempo máximo del turno para las llamadas al LLM (la spec pide resolver el turno en menos de 45 s). */
const TURN_BUDGET_MS = 40_000;

/** El proveedor, pero sin pasarse del presupuesto del turno: si no queda tiempo, falla rápido (y se usa el plan B). */
function withDeadline(p: LLMProvider, deadline: number): LLMProvider {
  const guard = <T,>(run: () => Promise<T>): Promise<T> => {
    const left = deadline - Date.now();
    if (left < 1500) return Promise.reject(new LLMUnavailable("sin tiempo en el turno"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new LLMUnavailable("tiempo del turno agotado")), left);
    });
    return Promise.race([run(), limit]).finally(() => clearTimeout(timer));
  };
  return {
    name: p.name,
    get model() {
      return p.model;
    },
    json: (o) => guard(() => p.json(o)),
    text: (o) => guard(() => p.text(o)),
  };
}

/** Primer mensaje del agente (sin mensaje de la persona). */
export async function greet(provider: LLMProvider, s: SessionState) {
  const a = next(s);
  if (isV2(s)) commitV2(s, a);
  else commit(s, a);
  const { text } = await write(provider, s, a);
  if (isV2(s)) a.options = optionsFor(s, a);
  say(s, text, a);
  return { reply: text, action: a };
}

export type TurnOptions = { forceClose?: boolean; optionId?: string };

/** Procesa un turno completo. Muta `s`. */
export async function runTurn(provider: LLMProvider, s: SessionState, rawText: string, opts: TurnOptions = {}) {
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

  // 2. Prechequeo de seguridad por reglas (igual en v1 y v2: la seguridad va siempre primero).
  const pre = precheck(text);
  if (pre.flag) return safetyStop(s, msgId, pre.category ?? "MALESTAR_INTENSO");

  if (isV2(s)) return runTurnV2(provider, s, text, msgId, opts);

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

// ---------------------------------------------------------------------------------------------
// Turno v2 (spec demo, design.md §5): cierre a pedido sin LLM, opciones sin LLM, contadores y presupuesto.
// ---------------------------------------------------------------------------------------------
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const NO_INFO_TEXT = /^(no se|nose|ni idea|depende|capaz|puede ser|que se yo|paso|nada|ninguna|ninguno|no me interesa|no tengo idea|no)[.!?\s]*$/;
const SUMMARY_REJECT = /^(no|nop|nope)\b|\bno es asi\b|\bno me representa\b|^para nada|^nada que ver/;
const SUMMARY_PARTIAL = /\b(mas o menos|masomenos|en parte|algo asi|mas bien no)\b/;
const SUMMARY_CONFIRM = /^(si|sii+|exacto|tal cual|me representa|dale|obvio|claro|totalmente|correcto)\b/;
/** Respuesta afirmativa a la oferta de cierre: quiere ver el perfil. */
const OFFER_YES = /^(si|sii+|dale|ok|okey|okay|listo|bueno|ta|vamos|veamos|de una|obvio|claro|si,? (dale|veamos|vamos|mostrame)|ahora)\b(?!.*\b(mas|otra|seguir|seguimos)\b)/;
export { ONE_MORE } from "./interviewer-v2";

/** Respuesta al mini-resumen: confirma o descarta lo que se resumió (las evidencias de las áreas destacadas). */
function resolveMiniSummary(s: SessionState, text: string): "CONFIRMED" | "REJECTED" | "PARTIAL" | null {
  const t = norm(text);
  const result = SUMMARY_PARTIAL.test(t) ? "PARTIAL" : SUMMARY_REJECT.test(t) ? "REJECTED" : SUMMARY_CONFIRM.test(t) ? "CONFIRMED" : null;
  if (!result || result === "PARTIAL") return result;
  const top = new Set(topAreas(active(s)));
  for (const e of s.evidence) {
    if (e.status !== "PENDING" || e.polarity !== 1 || !e.area || !top.has(e.area)) continue;
    Object.assign(e, { status: result, changedBy: "summary" });
  }
  logEvent("level.confirmed", { session: s.id, level: 2, result });
  return result;
}

/** Evidencia de una opción del banco, con el texto de la opción como cita (sin llamar al analizador). */
function optionOutput(label: string, evidence: { indicatorId: string; area?: Area; axis?: Axis; value?: string }[], noInfo: boolean): AnalyzerOutput {
  return {
    evidence: evidence.map((e) => ({ ...e, polarity: 1, kind: "DECLARED", concrete: false, quote: label, rationale: `Opción elegida: ${label}` })),
    contradictions: [],
    answerQuality: noInfo ? "EVASIVE" : "RICH",
    risk: { flag: false },
  };
}

async function runTurnV2(provider: LLMProvider, s: SessionState, text: string, msgId: string, opts: TurnOptions) {
  const intent = detectIntent(text);
  if (intent) logEvent("intent.detected", { session: s.id, intent });

  // 3. Pidió el perfil (botón o texto): se cierra SIN llamar al LLM.
  if (opts.forceClose || intent === "CLOSE") {
    s.closeRequested = true;
    const out = closeWith(s, "user");
    return { reply: out.content, action: out.action, safety: false };
  }

  const prev = s.lastAction;
  const deadline = Date.now() + TURN_BUDGET_MS;
  const llm = withDeadline(provider, deadline);
  const before = s.evidence.length;
  let noInfo = false;
  let quality: AnswerQuality = "RICH";
  const shortReply = text.split(/\s+/).length <= 6;

  const option = opts.optionId ? s.lastOptions?.find((o) => o.id === opts.optionId) : undefined;
  if (option?.id === ONE_MORE.id) {
    // "Una pregunta más" en la oferta de cierre.
    s.offerAccepted = true;
  } else if (option) {
    // 4. Opción del banco: evidencia registrada sin analizador.
    const bank = optionById(option.id);
    noInfo = Boolean(bank?.noInfo);
    quality = noInfo ? "EVASIVE" : "RICH";
    applyAnalysis(s, optionOutput(option.label, bank?.evidence ?? [], noInfo), msgId, option.label);
    if (bank?.marksDone && bank.group !== "COMMON") s.askedCount[`done:${bank.group}`] = 1;
    if (prev?.type === "MINI_SUMMARY") resolveMiniSummary(s, option.label);
  } else if (prev?.type === "MINI_SUMMARY" && shortReply && resolveMiniSummary(s, text)) {
    // "Sí" / "Más o menos" / "No" al mini-resumen: no hace falta el analizador.
  } else if (prev?.type === "OFFER_CLOSE" && shortReply) {
    // "¿Lo vemos ahora o preferís una pregunta más?" → "sí", "dale", "ok" es verlo; lo demás, una pregunta más.
    if (OFFER_YES.test(norm(text))) {
      s.closeRequested = true;
      const out = closeWith(s, "user");
      return { reply: out.content, action: out.action, safety: false };
    }
    s.offerAccepted = true;
  } else {
    // Texto libre: analizador (con el presupuesto del turno). Si falla, ya cae al analizador por reglas.
    const { output, fallback } = await analyze(llm, s, text);
    if (output.risk.flag) return safetyStop(s, msgId, output.risk.category ?? "MALESTAR_INTENSO");
    applyAnalysis(s, output, msgId, text);
    if (prev?.type === "MINI_SUMMARY") resolveMiniSummary(s, text);
    const added = s.evidence.length > before;
    quality = intent ? "OFF_TOPIC" : output.answerQuality;
    // Un fallo del LLM cuenta como "sin información" solo si el analizador por reglas tampoco sacó nada.
    // Un "no sé" o una intención ("ya te lo dije", "¿qué me recomendás?") no necesitan al LLM para entenderse:
    // son respuestas sin información (stall), no fallos del LLM. Solo cuenta como fallo un texto con contenido
    // que ni el LLM ni las reglas pudieron leer. (En producción, con la cuota de Gemini agotada, cada "no sé"
    // contaba como fallo y a la segunda se ofrecía cerrar diciendo "con lo que me contaste…".)
    // "Estoy triste" puede venir con información ("…pero me gusta dibujar"): no se la fuerza a "sin información".
    const plainNoInfo = Boolean(intent && intent !== "SAD") || NO_INFO_TEXT.test(norm(text));
    if (fallback && !added && !plainNoInfo && !intent) {
      s.llmFailures += 1;
      logEvent("agent.fallback", { session: s.id, agent: "analyzer" });
    } else if (!fallback) s.llmFailures = 0;
    noInfo = plainNoInfo || isNoInfo(quality, added, fallback && !added);
  }

  s.qualityHistory = [...s.qualityHistory, quality].slice(-6);
  s.stall = noInfo ? s.stall + 1 : 0;
  logEvent("profile.updated", { session: s.id, evidence: s.evidence.length, level: s.currentLevel });

  // 6. Planificador v2 (puro).
  const planned = next(s);
  const a: Action = intent && planned.type !== "CLOSE" ? withIntent(s, planned, intent, MIN_TURNS_TO_CLOSE) : planned;
  commitV2(s, a);
  if (a.type === "CLOSE") {
    const out = closeWith(s, a.reason ?? "sufficient");
    return { reply: out.content, action: out.action, safety: false };
  }

  // 7–8. Entrevistador (con plantilla si el LLM falla o no hay tiempo) + guardas.
  const { text: reply, source } = await write(llm, s, a);
  if (source === "template" && provider.name !== "mock") logEvent("agent.fallback", { session: s.id, agent: "interviewer" });
  // 9. Opciones del banco y guardar (say aplica el freno del tope).
  a.options = optionsFor(s, a);
  const out = say(s, reply, a);
  return { reply: out.content, action: out.action, safety: false };
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
