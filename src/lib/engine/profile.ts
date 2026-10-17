import { AREAS, AREA_LABELS, indicator, levelOf, levelOfIndicator, rubric, valueLabel, type Area } from "@/lib/rubric";
import type { AnalyzerOutput, Evidence, LevelState, SessionState } from "./types";

/**
 * Perfil: código determinista y puro (Documento 2, sección 9). El LLM nunca calcula puntajes ni porcentajes.
 */
const W = rubric.weights;

export function weight(e: Evidence): number {
  if (e.status === "REJECTED") return 0;
  if (e.status === "CONFIRMED") return W.confirmed;
  if (e.kind === "HYPOTHESIS") return W.hypothesis;
  return e.concrete ? W.declaredConcrete : W.declared;
}
export const contribution = (e: Evidence) => (e.polarity === 1 ? weight(e) : -W.againstFactor * weight(e));

/** Evidencias que suman a un área: N2.* y las N3.* vinculadas a un área. */
const countsForArea = (e: Evidence) => Boolean(e.area) && (e.indicatorId.startsWith("N2.") || e.indicatorId.startsWith("N3."));

export function areaScores(evidence: Evidence[]): Record<Area, number> {
  const out = Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<Area, number>;
  for (const e of evidence) if (countsForArea(e)) out[e.area!] += contribution(e);
  for (const a of AREAS) out[a] = Math.max(0, out[a]);
  return out;
}

/** Porcentajes que suman exactamente 100 (método del resto mayor). */
export function percentages(scores: Record<Area, number>): Record<Area, number> {
  const total = AREAS.reduce((s, a) => s + scores[a], 0);
  const out = Object.fromEntries(AREAS.map((a) => [a, 0])) as Record<Area, number>;
  if (total <= 0) return out;
  const raw = AREAS.map((a) => ({ a, v: (100 * scores[a]) / total }));
  let assigned = 0;
  for (const r of raw) {
    out[r.a] = Math.floor(r.v);
    assigned += out[r.a];
  }
  const rest = [...raw].sort((x, y) => y.v - Math.floor(y.v) - (x.v - Math.floor(x.v)) || AREAS.indexOf(x.a) - AREAS.indexOf(y.a));
  for (let i = 0; i < 100 - assigned; i++) out[rest[i].a] += 1;
  return out;
}

export function strongEvidenceCount(evidence: Evidence[]) {
  return evidence.filter((e) => countsForArea(e) && weight(e) >= 2).length;
}

export type Confidence = "baja" | "media" | "alta";
export function displayInfo(evidence: Evidence[]) {
  const scores = areaScores(evidence);
  const n = strongEvidenceCount(evidence);
  const areas = AREAS.filter((a) => scores[a] > 0).length;
  const show = n >= rubric.display.minEvidenceForPercentages && areas >= rubric.display.minAreasForPercentages;
  const c = rubric.display.confidence;
  const confidence: Confidence = n < c.mediumFrom ? "baja" : n < c.highFrom ? "media" : "alta";
  return { scores, pct: percentages(scores), show, confidence, strongCount: n };
}

export function axes(evidence: Evidence[]) {
  const pole = { PERSONAS: 0, COSAS: 0, DATOS: 0, IDEAS: 0 };
  for (const e of evidence) if (e.axis) pole[e.axis] += contribution(e);
  for (const k of Object.keys(pole) as (keyof typeof pole)[]) pole[k] = Math.max(0, pole[k]);
  const ratio = (a: number, b: number) => (a + b > 0 ? Math.round((100 * a) / (a + b)) : null);
  return { personasVsCosas: ratio(pole.PERSONAS, pole.COSAS), ideasVsDatos: ratio(pole.IDEAS, pole.DATOS), poles: pole };
}

/** Perfil plano: ninguna área con puntaje >= flatRatio × la mediana de las seis. */
export function isFlatProfile(evidence: Evidence[]) {
  const s = Object.values(areaScores(evidence)).sort((a, b) => a - b);
  const median = (s[2] + s[3]) / 2;
  const max = s[5];
  if (max === 0) return true;
  if (median === 0) return false;
  return max < rubric.planner.flatRatio * median;
}

export const active = (s: SessionState) => s.evidence.filter((e) => e.status !== "REJECTED");
export const evidenceOfLevel = (s: SessionState, lvl: number) => active(s).filter((e) => levelOfIndicator(e.indicatorId) === lvl);

/** Intereses específicos: N3 a favor (sin rechazos), distintos por valor o cita. */
export function specifics(s: SessionState) {
  const seen = new Set<string>();
  return active(s).filter((e) => {
    if (!e.indicatorId.startsWith("N3.") || e.indicatorId === "N3.RECHAZO" || e.polarity !== 1) return false;
    const key = (e.value ?? e.quote).toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const confirmedValues = (s: SessionState) =>
  [...new Set(s.evidence.filter((e) => e.indicatorId === "N4.VALOR" && e.status === "CONFIRMED" && e.value && e.polarity === 1).map((e) => e.value!))];
export const mentionedValues = (s: SessionState) =>
  [...new Set(active(s).filter((e) => e.indicatorId === "N4.VALOR" && e.value && e.polarity === 1).map((e) => e.value!))];

export const levelState = (s: SessionState, lvl: number): LevelState =>
  s.levels.find((l) => l.level === lvl) ?? { level: lvl, status: "OPEN", turns: 0 };

function setLevel(s: SessionState, next: LevelState) {
  s.levels = [...s.levels.filter((l) => l.level !== next.level), next].sort((a, b) => a.level - b.level);
}

/** Áreas destacadas (regla de dos evidencias: dos episodios distintos o uno confirmado). */
export function topAreas(evidence: Evidence[], max = 3): Area[] {
  const scores = areaScores(evidence);
  const support = (a: Area) => evidence.filter((e) => e.area === a && e.polarity === 1 && e.status !== "REJECTED" && weight(e) > 0);
  return AREAS.filter((a) => scores[a] > 0 && (support(a).length >= 2 || support(a).some((e) => e.status === "CONFIRMED")))
    .sort((a, b) => scores[b] - scores[a])
    .slice(0, max);
}

/** ¿Se cumple el criterio de salida del nivel? (incluye el tope de turnos por nivel, decisión de diseño P). */
export function exitCriteriaMet(s: SessionState, lvl: number): boolean {
  const L = levelOf(lvl);
  const c = L.exitCriteria;
  if (!c) return false;
  const ev = evidenceOfLevel(s, lvl).filter((e) => weight(e) > 0);
  const turnsCap = levelState(s, lvl).turns >= c.maxTurns;
  if (lvl === 0) {
    const ok = (c.requiredIndicators ?? []).every((id) => ev.some((e) => e.indicatorId === id)) && ev.length >= (c.minEvidence ?? 1);
    return ok || (turnsCap && ev.length > 0);
  }
  if (lvl === 1) {
    const n = c.minEvidencePerAxisPair ?? 2;
    const pair = (a: string, b: string) => ev.filter((e) => e.axis === a || e.axis === b);
    const ok = [pair("PERSONAS", "COSAS"), pair("DATOS", "IDEAS")].every((p) => p.length >= n && (!c.requiresConcrete || p.some((e) => e.concrete)));
    return ok || (turnsCap && ev.length > 0);
  }
  if (lvl === 2) {
    const scores = areaScores(active(s));
    const minPer = c.minEvidencePerTopArea ?? 2;
    const strong = AREAS.filter((a) => {
      const sup = ev.filter((e) => e.area === a && e.polarity === 1);
      return scores[a] > 0 && sup.length >= minPer && (!c.requiresConcrete || sup.some((e) => e.concrete));
    });
    return strong.length >= (c.minAreasWithEvidence ?? 1) || (turnsCap && ev.length > 0);
  }
  if (lvl === 3) return specifics(s).length >= (c.minSpecifics ?? 3) || (turnsCap && specifics(s).length > 0);
  return false;
}

let idCounter = 0;
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Aplica la salida (ya validada) del analizador: suma evidencias nuevas, resuelve confirmaciones y contradicciones.
 * Muta y devuelve `s`.
 */
export function applyAnalysis(s: SessionState, out: AnalyzerOutput, messageId: string, userText: string): SessionState {
  const now = new Date().toISOString();
  // Primero se resuelve la confirmación pendiente (afecta lo anterior), después se suman las evidencias nuevas.
  if (s.pendingConfirmation && out.confirmation?.target === "LEVEL_SUMMARY") {
    resolveLevelConfirmation(s, s.pendingConfirmation.level, out.confirmation.result);
  } else if (s.pendingConfirmation) {
    s.pendingConfirmation.tries += 1;
    // Si no respondió a la confirmación dos veces, se toma como parcial: solo lo dicho explícitamente.
    if (s.pendingConfirmation.tries >= 2) resolveLevelConfirmation(s, s.pendingConfirmation.level, "PARTIAL");
  }
  const text = norm(userText);
  for (const ev of out.evidence) {
    const ind = indicator(ev.indicatorId);
    if (!ind) continue; // solo indicadores de la rúbrica
    // La cita tiene que ser textual del último mensaje; si no, se usa un fragmento literal.
    const quote = ev.quote && text.includes(norm(ev.quote)) ? ev.quote.slice(0, 200) : userText.slice(0, 200);
    const area = ind.area ?? (ev.indicatorId.startsWith("N3.") || ind.perArea ? ev.area : undefined);
    const axis = ind.axis;
    const value = ev.indicatorId === "N4.VALOR" ? normalizeValue(ev.value) : ev.value?.slice(0, 60);
    if (ev.indicatorId === "N4.VALOR" && !value) continue;
    const dup = s.evidence.some(
      (e) => e.messageId === messageId && e.indicatorId === ev.indicatorId && e.area === area && (e.value ?? "") === (value ?? ""),
    );
    if (dup) continue;
    s.evidence.push({
      id: newId("ev"),
      messageId,
      indicatorId: ev.indicatorId,
      area,
      axis,
      value,
      polarity: ev.polarity,
      kind: ev.kind,
      concrete: ev.kind === "DECLARED" ? ev.concrete : false,
      status: "PENDING",
      quote,
      rationale: ev.rationale.slice(0, 160),
      createdAt: now,
    });
  }
  // Contradicciones con niveles ya confirmados (el planificador decide si volver).
  s.openContradictions = out.contradictions.filter((c) => indicator(c.indicatorId));
  return s;
}

/** Confirmación del resumen de un nivel (R6, R7). */
export function resolveLevelConfirmation(s: SessionState, lvl: number, result: "CONFIRMED" | "REJECTED" | "PARTIAL") {
  const now = new Date().toISOString();
  const affected = (e: Evidence) => e.status === "PENDING" && (levelOfIndicator(e.indicatorId) === lvl || (lvl >= 1 && e.indicatorId.startsWith("N4.")));
  const L = levelState(s, lvl);
  if (result === "REJECTED") {
    // "No es así": se descarta lo del nivel que estaba en el resumen y se adopta la versión de la persona (R7).
    for (const e of s.evidence)
      if (affected(e) && (e.kind === "HYPOTHESIS" || levelOfIndicator(e.indicatorId) === lvl)) Object.assign(e, { status: "REJECTED", changedBy: "summary" });
    setLevel(s, { ...L, status: "OPEN", turns: Math.max(0, L.turns - 2) });
  } else {
    for (const e of s.evidence) {
      if (!affected(e)) continue;
      if (result === "CONFIRMED" || e.kind === "DECLARED") Object.assign(e, { status: "CONFIRMED", changedBy: "summary" });
    }
    setLevel(s, { ...L, status: "CONFIRMED", confirmedAt: now });
  }
  s.pendingConfirmation = null;
}

/** La persona marca un ítem del panel como "no es así" (R13) o lo confirma. */
export function setEvidenceStatus(s: SessionState, evidenceId: string, status: "REJECTED" | "CONFIRMED") {
  const e = s.evidence.find((x) => x.id === evidenceId);
  if (!e) return false;
  e.status = status;
  e.changedBy = "user";
  return true;
}

export function markSummarized(s: SessionState, lvl: number, summary: string) {
  setLevel(s, { ...levelState(s, lvl), status: "SUMMARIZED", summary });
  s.pendingConfirmation = { level: lvl, tries: 0 };
}

export function reopenLevel(s: SessionState, lvl: number) {
  setLevel(s, { ...levelState(s, lvl), status: "OPEN", turns: 0 });
  s.currentLevel = lvl;
}

export function countTurnInLevel(s: SessionState, lvl: number) {
  const L = levelState(s, lvl);
  setLevel(s, { ...L, turns: L.turns + 1 });
}

const VALUE_ALIASES: Record<string, string> = {
  logro: "logro", resultados: "logro", autonomia: "autonomia", independencia: "autonomia", libertad: "autonomia",
  reconocimiento: "reconocimiento", buen_ambiente: "buen_ambiente", ambiente: "buen_ambiente", relaciones: "buen_ambiente",
  ayudar: "ayudar", ayuda: "ayudar", apoyo: "ayudar", estabilidad: "estabilidad", seguridad: "estabilidad",
  ingresos: "ingresos", plata: "ingresos", dinero: "ingresos", creatividad: "creatividad", equilibrio: "equilibrio",
  tiempo_libre: "equilibrio", aprendizaje: "aprendizaje", aprender: "aprendizaje", variedad: "variedad",
};
export function normalizeValue(v?: string) {
  if (!v) return undefined;
  const k = norm(v).replace(/\s+/g, "_");
  return VALUE_ALIASES[k] ?? (rubric.values.some((x) => x.id === k) ? k : undefined);
}

// ---------- Snapshot (ProfileSnapshot.data) ----------
export function snapshot(s: SessionState) {
  const act = active(s);
  const info = displayInfo(act);
  const ax = axes(act);
  const autoef = act.filter((e) => e.indicatorId === "N4.AUTOEF");
  return {
    riasec: Object.fromEntries(AREAS.map((a) => [a, { score: info.scores[a], pct: info.pct[a], label: AREA_LABELS[a] }])),
    show: info.show,
    confidence: info.confidence,
    strongCount: info.strongCount,
    disclaimer: rubric.display.disclaimer,
    axes: { personasVsCosas: ax.personasVsCosas, ideasVsDatos: ax.ideasVsDatos },
    top: topAreas(act),
    flat: isFlatProfile(act),
    specifics: specifics(s).map((e) => ({ id: e.id, text: e.value ?? e.quote, quote: e.quote, area: e.area, status: e.status })),
    rejections: act.filter((e) => e.indicatorId === "N3.RECHAZO").map((e) => ({ id: e.id, text: e.value ?? e.quote, status: e.status })),
    values: confirmedValues(s).map((v) => ({ id: v, label: valueLabel(v) })),
    valuesMentioned: mentionedValues(s).map((v) => ({ id: v, label: valueLabel(v) })),
    selfEfficacy: [...new Set(autoef.map((e) => e.area ?? "general"))].map((area) => ({
      area,
      belief: autoef.find((e) => (e.area ?? "general") === area && e.polarity === -1)?.quote ?? null,
      evidenceFor: autoef.filter((e) => (e.area ?? "general") === area && e.polarity === 1).map((e) => e.quote),
      evidenceAgainst: autoef.filter((e) => (e.area ?? "general") === area && e.polarity === -1).map((e) => e.quote),
    })),
    context: {
      apoyos: act.filter((e) => e.indicatorId === "N4.APOYO").map((e) => e.value ?? e.quote),
      barreras: act.filter((e) => e.indicatorId === "N4.BARRERA").map((e) => e.value ?? e.quote),
      influencias: act.filter((e) => e.indicatorId === "N4.INFLUENCIA" || e.indicatorId === "N0.CONF_EXT").map((e) => e.value ?? e.quote),
    },
    expectations: act.filter((e) => e.indicatorId === "N4.EXPECT").map((e) => e.quote),
    openQuestions: openQuestions(s),
    contradictions: s.openContradictions,
  };
}
export type ProfileSnapshot = ReturnType<typeof snapshot>;

function openQuestions(s: SessionState) {
  const q: string[] = [];
  for (const e of active(s)) if (e.indicatorId === "N4.EXPECT") q.push(`Averiguar con datos: "${e.quote}"`);
  if (isFlatProfile(active(s))) q.push("Probar actividades nuevas en la vida real para ver qué te engancha.");
  if (active(s).some((e) => e.indicatorId === "N4.INFLUENCIA" || e.indicatorId === "N0.CONF_EXT"))
    q.push("Separar lo que te gusta a vos de lo que esperan otros, sin apuro.");
  for (const e of active(s)) if (e.indicatorId === "N4.AUTOEF" && e.polarity === -1) q.push(`Revisar la creencia "${e.quote}" con alguna experiencia nueva.`);
  return [...new Set(q)].slice(0, 6);
}

/** Ítems para el panel "Lo que voy entendiendo": confirmados y en duda, con la cita que los sostiene. */
export function panelItems(s: SessionState) {
  return s.evidence
    .filter((e) => e.status !== "REJECTED" || e.changedBy === "user")
    .map((e) => ({
      id: e.id,
      label: panelLabel(e),
      quote: e.quote,
      status: e.status,
      kind: e.kind,
      level: levelOfIndicator(e.indicatorId),
    }));
}

export function panelLabel(e: Evidence) {
  const ind = indicator(e.indicatorId);
  if (!ind) return e.indicatorId;
  const against = e.polarity === -1;
  if (e.indicatorId === "N4.VALOR" && e.value) return `Te importa: ${valueLabel(e.value).toLowerCase()}`;
  if (e.indicatorId === "N0.ESTADO" && e.value) return `Punto de partida: ${e.value}`;
  if ((e.indicatorId === "N4.BARRERA" || e.indicatorId === "N4.APOYO") && e.value) return `${ind.label}: ${e.value}`;
  if (e.area && e.indicatorId.startsWith("N2.")) return `${against ? "Menos" : "Aparece"}: ${AREA_PLAIN_SHORT[e.area]}`;
  if (e.axis) return `${against ? "Menos" : "Más"}: ${AXIS_PLAIN[e.axis]}`;
  if (e.indicatorId.startsWith("N3.") && e.value) return `${ind.label}: ${e.value}`;
  return ind.label;
}

const AREA_PLAIN_SHORT: Record<Area, string> = {
  R: "hacer con las manos o el cuerpo",
  I: "entender cómo funcionan las cosas",
  A: "crear y expresar",
  S: "ayudar y acompañar a otros",
  E: "organizar y convencer a otros",
  C: "ordenar y registrar",
};
const AXIS_PLAIN = { PERSONAS: "tareas con personas", COSAS: "tareas con cosas o materiales", DATOS: "ejecutar con orden", IDEAS: "pensar e inventar" };
