import { levelOf, rubric } from "@/lib/rubric";
import { active, confirmedValues, evidenceOfLevel, exitCriteriaMet, isFlatProfile, levelState, mentionedValues, specifics } from "./profile";
import type { Intent } from "./intents";
import { isV2, nextV2 } from "./planner-v2";
import type { Action, SessionState } from "./types";

export { complementaryCount, essentialsMet, isNoInfo, isV2, MAX_QUESTIONS, nextSlot, nextV2, questionsAsked, slotStatus } from "./planner-v2";

/**
 * Planificador activo según la rúbrica de la sesión: v2 (demo, presupuesto de 8 preguntas, planner-v2.ts)
 * o v1 (Documento 2, sección 8: conversaciones largas por niveles). Los dos son puros.
 */
export function next(s: SessionState): Action {
  return isV2(s) ? nextV2(s) : nextV1(s);
}

/**
 * Planificador determinista v1 (Documento 2, sección 8). Decide la próxima acción y el indicador objetivo.
 * Es puro: no modifica el estado.
 */
const P = rubric.planner;
const has = (s: SessionState, id: string) => active(s).some((e) => e.indicatorId === id);

export function closeReady(s: SessionState) {
  const n0 = levelState(s, 0).status === "CONFIRMED";
  const n2 = levelState(s, 2).status === "CONFIRMED";
  const values = Math.max(confirmedValues(s).length, mentionedValues(s).length);
  return n0 && n2 && specifics(s).length >= P.minSpecificsToClose && values >= P.minValuesToClose;
}

/** El indicador menos cubierto del nivel (empate: orden de la rúbrica), evitando repetir el último. */
export function nextIndicator(s: SessionState, lvl: number, exclude?: string | null): string {
  let ids = levelOf(lvl).indicators.map((i) => i.id);
  // Con conflicto externo, priorizar experiencias propias (N3.ACTIVIDAD) y dejar expectativas para después (P).
  if (has(s, "N0.CONF_EXT")) {
    if (lvl === 3) ids = ["N3.ACTIVIDAD", ...ids.filter((i) => i !== "N3.ACTIVIDAD")];
    if (lvl === 4) ids = [...ids.filter((i) => i !== "N4.EXPECT"), "N4.EXPECT"];
  }
  const count = (id: string) => active(s).filter((e) => e.indicatorId === id).length;
  const asked = (id: string) => s.messages.filter((m) => m.action?.indicatorId === id).length;
  const pool = ids.filter((i) => i !== exclude);
  const ranked = (pool.length ? pool : ids).map((id, order) => ({ id, order, c: count(id), a: asked(id) }));
  ranked.sort((x, y) => x.c - y.c || x.a - y.a || x.order - y.order);
  return ranked[0].id;
}

function missingN4(s: SessionState) {
  if (Math.max(confirmedValues(s).length, mentionedValues(s).length) < P.minValuesToClose) return "N4.VALOR";
  return nextIndicator(s, 4, s.lastIndicator);
}

/** Una evidencia única y sin ejemplo concreto en el nivel: conviene pedir un episodio. */
function singleUnconcrete(s: SessionState, lvl: number) {
  const ev = evidenceOfLevel(s, lvl).filter((e) => e.kind === "DECLARED");
  const byInd = new Map<string, typeof ev>();
  for (const e of ev) byInd.set(e.indicatorId + (e.area ?? ""), [...(byInd.get(e.indicatorId + (e.area ?? "")) ?? []), e]);
  for (const list of byInd.values()) {
    if (list.length !== 1 || list[0].concrete || !deepenable(list[0].indicatorId)) continue;
    const id = list[0].indicatorId;
    const deepened = s.messages.some((m) => m.action?.type === "ASK_DEEPEN" && m.action.indicatorId === id);
    if (!deepened) return id;
  }
  return null;
}

/** Planificador v1 (Documento 2, sección 8): conversaciones largas por niveles. Se usa con sesiones de la rúbrica v1. */
export function nextV1(s: SessionState): Action {
  const lvl = s.currentLevel;
  if (s.status === "SAFETY_STOP") return { type: "SAFETY", level: lvl };
  if (s.userTurns === 0) return { type: "GREETING", level: 0, indicatorId: "N0.ESTADO" };
  if (s.userTurns >= rubric.limits.forceCloseAtUserTurns) return { type: "CLOSE", level: lvl };
  if (s.pendingConfirmation) return { type: "WAIT_CONFIRMATION", level: s.pendingConfirmation.level };

  // Volver a un nivel confirmado si algo lo contradice (R8). Una sola vez por indicador.
  for (const c of s.openContradictions) {
    const L = Number(c.indicatorId.slice(1, 2));
    if (L < 4 && L <= lvl && levelState(s, L).status === "CONFIRMED" && !s.wentBack.includes(c.indicatorId)) {
      return { type: "GO_BACK", level: L, indicatorId: c.indicatorId, notes: c.description };
    }
  }

  const ready = exitCriteriaMet(s, lvl);
  // Creencias rígidas: examinarlas con preguntas suaves antes de avanzar (máximo 2 seguidas).
  const beliefPending = has(s, "N0.CREENCIAS") && s.beliefExamsInRow < P.maxBeliefExamsInRow && s.beliefExamsTotal < P.maxBeliefExamsInRow;
  if (beliefPending && !(ready && levelState(s, lvl).status !== "CONFIRMED")) {
    return { type: "EXAMINE_BELIEF", level: lvl, indicatorId: "N0.CREENCIAS" };
  }

  if (ready) {
    const st = levelState(s, lvl).status;
    if (st !== "CONFIRMED") return { type: "SUMMARIZE_LEVEL", level: lvl };
    if (lvl === 2 && isFlatProfile(active(s)) && !s.flatStrategyTried) return { type: "FLAT_PROFILE_STRATEGY", level: 2 };
    if (lvl === 3) {
      const extra = levelState(s, 3).turns - (levelOf(3).exitCriteria?.maxTurns ?? 8);
      if (closeReady(s) || extra >= 3) return { type: "CLOSE", level: 3 };
      return { type: "ASK_NEW", level: 4, indicatorId: missingN4(s) };
    }
    // Saltar niveles que ya estaban confirmados (por ejemplo, al volver atrás por una contradicción).
    let target = lvl + 1;
    while (target <= 3 && levelState(s, target).status === "CONFIRMED") target++;
    if (target > 3) return { ...nextV1({ ...s, currentLevel: 3 }), setLevel: 3 };
    return { type: "ADVANCE_LEVEL", level: target, indicatorId: nextIndicator(s, target) };
  }

  const q = s.qualityHistory;
  const last = q[q.length - 1];
  if (last === "EVASIVE" && q[q.length - 2] === "EVASIVE") {
    return { type: "CHANGE_ANGLE", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator), notes: "no insistir" };
  }
  // En el estado de decisión (N0) y en lo que le importa (N4) una respuesta corta puede ser completa
  // ("todo abierto"): pedir "una vez puntual" ahí no tiene sentido. Si dejó evidencia se sigue; si no, otro ángulo.
  // Un solo pedido de ejemplo por tema: si ya se profundizó, se sigue con lo que haya (no "bajémoslo a algo puntual" otra vez).
  const deepenedJustNow = s.lastAction?.type === "ASK_DEEPEN";
  // Pedir "una vez puntual en la que pasó eso" solo si la respuesta corta nombró una actividad o interés (N1–N3):
  // a "está todo abierto" o "asado" no hay "eso" sobre qué pedir un ejemplo.
  const nothingToDeepen = !madeInterestNow(s);
  if ((last === "BRIEF" || last === "EVASIVE") && s.lastIndicator && (!deepenable(s.lastIndicator) || deepenedJustNow || nothingToDeepen)) {
    if (last === "EVASIVE" || !gotSomethingNow(s)) return { type: "CHANGE_ANGLE", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator), notes: "no insistir" };
    return afterAnswer(s, lvl);
  }
  if ((last === "BRIEF" || last === "EVASIVE") && s.lastIndicator && s.sameIndicatorTries < P.maxDeepenTries) {
    // El ejemplo se pide sobre lo que la persona acaba de nombrar, no sobre el tema de la pregunta anterior.
    return { type: "ASK_DEEPEN", level: lvl, indicatorId: interestNow(s) ?? s.lastIndicator, notes: "pedir un ejemplo concreto" };
  }
  if ((last === "BRIEF" || last === "EVASIVE") && s.lastIndicator) {
    return { type: "CHANGE_ANGLE", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator), notes: "no insistir" };
  }

  // Después de una respuesta rica no se vuelve atrás a pedir ejemplos de algo anterior: se sigue.
  const single = last !== "RICH" ? singleUnconcrete(s, lvl) : null;
  if (single) return { type: "ASK_DEEPEN", level: lvl, indicatorId: single, notes: "pedir un ejemplo concreto" };
  return afterAnswer(s, lvl);
}

/** Pedir un episodio concreto solo tiene sentido para intereses y actividades (niveles 1 a 3). */
const deepenable = (id: string) => /^N[123]\./.test(id);

const lastUserId = (s: SessionState) => [...s.messages].reverse().find((m) => m.role === "USER")?.id;

/** El último mensaje de la persona dejó alguna evidencia. */
function gotSomethingNow(s: SessionState) {
  const id = lastUserId(s);
  return active(s).some((e) => e.messageId === id);
}

/** El indicador de la actividad o interés que nombró el último mensaje (algo sobre lo que tiene sentido pedir un ejemplo). */
function interestNow(s: SessionState): string | undefined {
  const id = lastUserId(s);
  const own = active(s).filter((e) => e.messageId === id && deepenable(e.indicatorId) && e.polarity === 1);
  return (own.find((e) => e.indicatorId.startsWith(`N${s.currentLevel}.`)) ?? own[0])?.indicatorId;
}
const madeInterestNow = (s: SessionState) => interestNow(s) !== undefined;

/**
 * Ajusta la acción del planificador a una intención explícita de la persona (intents.ts).
 * Cerrar con poca información no da una devolución útil: se avisa y se sigue, pero nunca se pide un ejemplo encima.
 */
export function withIntent(s: SessionState, a: Action, intent: Intent, minTurnsToClose: number): Action {
  const lvl = s.currentLevel;
  const question = (x: Action): Action =>
    x.type === "ASK_DEEPEN" ? { type: "ASK_NEW", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator) } : x;
  if (a.type === "SAFETY" || a.type === "CLOSE") return a;
  // v2: el planificador ya trata las intenciones (cerrar → CLOSE; el resto, como respuesta sin información);
  // acá solo se adjunta la intención para que el mensaje la reconozca.
  if (isV2(s)) return { ...a, intent };
  switch (intent) {
    case "CLOSE":
      if (s.userTurns >= minTurnsToClose) return { type: "CLOSE", level: lvl };
      return { ...question(a), intent };
    case "ALREADY_SAID":
      if (a.type === "SUMMARIZE_LEVEL" || a.type === "ADVANCE_LEVEL") return { ...a, intent };
      return { type: "CHANGE_ANGLE", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator), notes: "no insistir", intent };
    case "CONFUSED":
      if (s.pendingConfirmation) return { type: "WAIT_CONFIRMATION", level: s.pendingConfirmation.level, intent };
      return { type: "ASK_NEW", level: lvl, indicatorId: s.lastIndicator ?? nextIndicator(s, lvl), intent };
    case "ASK_RECOMMENDATION":
      return { ...question(a), intent };
  }
}

/** Siguiente pregunta cuando la respuesta alcanzó: cada tanto lo que le importa (N4), si no el indicador menos cubierto. */
function afterAnswer(s: SessionState, lvl: number): Action {
  if (lvl >= 1 && s.userTurns - s.lastN4Turn >= P.n4EveryTurns) {
    return { type: "ASK_NEW", level: 4, indicatorId: nextIndicator(s, 4, s.lastIndicator) };
  }
  if (s.userTurns >= rubric.limits.offerCloseAtUserTurns && !s.closeOffered) return { type: "OFFER_CLOSE", level: lvl };
  return { type: "ASK_NEW", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator) };
}
