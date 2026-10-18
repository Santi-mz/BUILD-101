import { levelOf, rubric } from "@/lib/rubric";
import { active, confirmedValues, evidenceOfLevel, exitCriteriaMet, isFlatProfile, levelState, mentionedValues, specifics } from "./profile";
import type { Action, SessionState } from "./types";

/**
 * Planificador determinista (Documento 2, sección 8). Decide la próxima acción y el indicador objetivo.
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
    if (list.length !== 1 || list[0].concrete) continue;
    const id = list[0].indicatorId;
    const deepened = s.messages.some((m) => m.action?.type === "ASK_DEEPEN" && m.action.indicatorId === id);
    if (!deepened) return id;
  }
  return null;
}

export function next(s: SessionState): Action {
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
    // Sin nada que resumir (se llegó al tope de turnos sin evidencia): se avanza sin pedir confirmación.
    if (st !== "CONFIRMED" && evidenceOfLevel(s, lvl).length === 0) {
      const target = Math.min(lvl + 1, 3);
      if (lvl === 3) return { type: "CLOSE", level: 3 };
      return { type: "ADVANCE_LEVEL", level: target, indicatorId: nextIndicator(s, target), notes: "nivel sin evidencia" };
    }
    if (st !== "CONFIRMED") return { type: "SUMMARIZE_LEVEL", level: lvl };
    if (lvl === 2 && isFlatProfile(active(s)) && !s.flatStrategyTried) return { type: "FLAT_PROFILE_STRATEGY", level: 2 };
    if (lvl === 3) {
      const extra = levelState(s, 3).turns - (levelOf(3).exitCriteria?.maxTurns ?? 8);
      if (closeReady(s) || extra >= 1) return { type: "CLOSE", level: 3 };
      return { type: "ASK_NEW", level: 4, indicatorId: missingN4(s) };
    }
    // Saltar niveles que ya estaban confirmados (por ejemplo, al volver atrás por una contradicción).
    let target = lvl + 1;
    while (target <= 3 && levelState(s, target).status === "CONFIRMED") target++;
    if (target > 3) return { ...next({ ...s, currentLevel: 3 }), setLevel: 3 };
    return { type: "ADVANCE_LEVEL", level: target, indicatorId: nextIndicator(s, target) };
  }

  const q = s.qualityHistory;
  const last = q[q.length - 1];
  if (last === "EVASIVE" && q[q.length - 2] === "EVASIVE") {
    return { type: "CHANGE_ANGLE", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator), notes: "no insistir" };
  }
  if ((last === "BRIEF" || last === "EVASIVE") && s.lastIndicator && s.sameIndicatorTries < P.maxDeepenTries) {
    return { type: "ASK_DEEPEN", level: lvl, indicatorId: s.lastIndicator, notes: "pedir un ejemplo concreto" };
  }
  if ((last === "BRIEF" || last === "EVASIVE") && s.lastIndicator) {
    return { type: "CHANGE_ANGLE", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator), notes: "no insistir" };
  }

  const single = singleUnconcrete(s, lvl);
  if (single) return { type: "ASK_DEEPEN", level: lvl, indicatorId: single, notes: "pedir un ejemplo concreto" };

  if (lvl >= 1 && s.userTurns - s.lastN4Turn >= P.n4EveryTurns) {
    return { type: "ASK_NEW", level: 4, indicatorId: nextIndicator(s, 4, s.lastIndicator) };
  }
  if (s.userTurns >= rubric.limits.offerCloseAtUserTurns && !s.closeOffered) return { type: "OFFER_CLOSE", level: lvl };
  return { type: "ASK_NEW", level: lvl, indicatorId: nextIndicator(s, lvl, s.lastIndicator) };
}
