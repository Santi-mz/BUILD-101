import { describe, expect, test } from "vitest";
import { indicatorIds, rubric, rubricSchema } from "@/lib/rubric";
import raw from "@/knowledge/rubric.v1.json";
import { areaScores, axes, displayInfo, isFlatProfile, percentages, weight } from "@/lib/engine/profile";
import { next } from "@/lib/engine/planner";
import { precheck } from "@/lib/engine/safety";
import { check } from "@/lib/engine/guards";
import { maskPII } from "@/lib/engine/pii";
import { newSession } from "@/lib/engine/turn";
import type { Evidence, SessionState } from "@/lib/engine/types";

let n = 0;
const ev = (p: Partial<Evidence>): Evidence => ({
  id: `e${n++}`,
  messageId: "m",
  indicatorId: "N2.A",
  area: "A",
  polarity: 1,
  kind: "DECLARED",
  concrete: true,
  status: "PENDING",
  quote: "q",
  rationale: "r",
  createdAt: "",
  ...p,
});
const session = (p: Partial<SessionState> = {}): SessionState => ({ ...newSession({ ageRange: "A18_21", guardianConsent: false, model: "mock" }), ...p });

describe("rúbrica", () => {
  test("es válida, tiene los niveles 0 a 4 y los ids son únicos", () => {
    expect(() => rubricSchema.parse(raw)).not.toThrow();
    const ids = rubric.levels.flatMap((l) => l.indicators.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(rubric.levels.map((l) => l.level)).toEqual([0, 1, 2, 3, 4]);
    for (const id of ["N0.ESTADO", "N0.CREENCIAS", "N1.PERSONAS", "N1.IDEAS", "N2.R", "N2.C", "N3.FLOW", "N3.RECHAZO", "N4.VALOR", "N4.INFLUENCIA"]) expect(indicatorIds()).toContain(id);
  });
  test("las preguntas de ejemplo cumplen las guardas (una pregunta como máximo)", () => {
    for (const l of rubric.levels) for (const i of l.indicators) for (const q of i.exampleQuestions) expect(check(q, "interview").reasons, q).toEqual([]);
  });
  test("cada indicador empieza con el número de su nivel", () => {
    for (const l of rubric.levels) for (const i of l.indicators) expect(i.id.startsWith(`N${l.level}.`)).toBe(true);
  });
});

describe("perfil: pesos y porcentajes (sección 9)", () => {
  test("pesos: confirmada 3, concreta 2, dicha 1, hipótesis 0, rechazada 0", () => {
    expect(weight(ev({ status: "CONFIRMED" }))).toBe(3);
    expect(weight(ev({ concrete: true }))).toBe(2);
    expect(weight(ev({ concrete: false }))).toBe(1);
    expect(weight(ev({ kind: "HYPOTHESIS" }))).toBe(0);
    expect(weight(ev({ status: "REJECTED" }))).toBe(0);
  });
  test("la evidencia en contra resta la mitad y el puntaje no baja de 0", () => {
    const s = areaScores([ev({ area: "A", concrete: true }), ev({ area: "A", polarity: -1, concrete: true }), ev({ area: "S", polarity: -1 })]);
    expect(s.A).toBe(1);
    expect(s.S).toBe(0);
  });
  test("las N3 con área también suman", () => {
    expect(areaScores([ev({ indicatorId: "N3.ACTIVIDAD", area: "R" })]).R).toBe(2);
  });
  test("porcentajes suman 100 y son reproducibles", () => {
    const list = [ev({ area: "A" }), ev({ area: "I" }), ev({ area: "S", concrete: false }), ev({ area: "R" })];
    const a = percentages(areaScores(list));
    const b = percentages(areaScores(list));
    expect(Object.values(a).reduce((x, y) => x + y, 0)).toBe(100);
    expect(a).toEqual(b);
  });
  test("solo se muestran con 6 evidencias de peso ≥2 en 3 áreas; confianza por cantidad", () => {
    const five = ["A", "A", "I", "S", "S"].map((area) => ev({ area: area as Evidence["area"] }));
    expect(displayInfo(five).show).toBe(false);
    const six = [...five, ev({ area: "I" })];
    expect(displayInfo(six).show).toBe(true);
    expect(displayInfo(six).confidence).toBe("baja");
    const ten = [...six, ...["A", "S", "I", "R"].map((area) => ev({ area: area as Evidence["area"] }))];
    expect(displayInfo(ten).confidence).toBe("media");
    const twoAreas = Array.from({ length: 8 }, (_, i) => ev({ area: i % 2 ? "A" : "S" }));
    expect(displayInfo(twoAreas).show).toBe(false);
  });
  test("ejes: personas/(personas+cosas)", () => {
    const a = axes([ev({ indicatorId: "N1.PERSONAS", area: undefined, axis: "PERSONAS" }), ev({ indicatorId: "N1.COSAS", area: undefined, axis: "COSAS", concrete: false })]);
    expect(a.personasVsCosas).toBe(67);
    expect(a.ideasVsDatos).toBeNull();
  });
  test("perfil plano", () => {
    expect(isFlatProfile([ev({ area: "A" }), ev({ area: "S" }), ev({ area: "I" }), ev({ area: "R" })])).toBe(true);
    expect(isFlatProfile([ev({ area: "A", status: "CONFIRMED" }), ev({ area: "A" }), ev({ area: "S", concrete: false })])).toBe(false);
  });
});

describe("planificador (sección 8)", () => {
  test("saludo, seguridad y cierre forzado", () => {
    expect(next(session()).type).toBe("GREETING");
    expect(next(session({ userTurns: 3, status: "SAFETY_STOP" })).type).toBe("SAFETY");
    expect(next(session({ userTurns: 40 })).type).toBe("CLOSE");
  });
  test("espera confirmación si hay un resumen pendiente", () => {
    expect(next(session({ userTurns: 2, pendingConfirmation: { level: 0, tries: 0 } })).type).toBe("WAIT_CONFIRMATION");
  });
  test("resume el nivel al cumplir el criterio de salida", () => {
    const s = session({ userTurns: 1, evidence: [ev({ indicatorId: "N0.ESTADO", area: undefined, value: "sin opciones", concrete: false })] });
    expect(next(s)).toMatchObject({ type: "SUMMARIZE_LEVEL", level: 0 });
  });
  test("avanza cuando el nivel está confirmado", () => {
    const s = session({ userTurns: 2, evidence: [ev({ indicatorId: "N0.ESTADO", area: undefined, status: "CONFIRMED" })] });
    s.levels[0].status = "CONFIRMED";
    expect(next(s)).toMatchObject({ type: "ADVANCE_LEVEL", level: 1 });
  });
  test("respuesta breve: profundiza; dos evasivas seguidas: cambia de ángulo", () => {
    // Breve pero con un interés ("me gusta la música"): pide un ejemplo concreto.
    const said = { id: "u1", role: "USER" as const, content: "me gusta la música", createdAt: "" };
    const s = session({ userTurns: 2, currentLevel: 1, lastIndicator: "N1.PERSONAS", qualityHistory: ["BRIEF"], messages: [said], evidence: [ev({ messageId: "u1", concrete: false })] });
    expect(next(s).type).toBe("ASK_DEEPEN");
    // Breve y sin ningún interés ("está todo abierto" en el nivel 1, captura de producción): no hay "eso" que profundizar.
    const open = session({ userTurns: 2, currentLevel: 1, lastIndicator: "N1.PERSONAS", qualityHistory: ["BRIEF"], messages: [{ ...said, content: "Está todo abierto." }] });
    expect(next(open).type).not.toBe("ASK_DEEPEN");
    const t = session({ userTurns: 3, currentLevel: 1, lastIndicator: "N1.PERSONAS", qualityHistory: ["EVASIVE", "EVASIVE"] });
    expect(next(t).type).toBe("CHANGE_ANGLE");
    expect(next(t).indicatorId).not.toBe("N1.PERSONAS");
    const u = session({ userTurns: 3, currentLevel: 1, lastIndicator: "N1.PERSONAS", sameIndicatorTries: 2, qualityHistory: ["BRIEF"] });
    expect(next(u).type).toBe("CHANGE_ANGLE");
  });
  test("respuesta breve sobre el estado de decisión (N0): no pide «una vez puntual»", () => {
    const s = session({ userTurns: 1, lastIndicator: "N0.ESTADO", qualityHistory: ["BRIEF"] });
    expect(next(s).type).toBe("CHANGE_ANGLE");
    expect(next(s).indicatorId).not.toBe("N0.ESTADO");
    const t = session({ userTurns: 2, currentLevel: 1, lastIndicator: "N4.VALOR", qualityHistory: ["BRIEF"], evidence: [ev({ indicatorId: "N4.VALOR", area: undefined, value: "autonomia", concrete: false })] });
    expect(next(t).type).not.toBe("ASK_DEEPEN");
  });
  test("perfil plano en nivel 2 confirmado → estrategia de perfil plano una vez", () => {
    const evidence = ["A", "S", "I", "R"].flatMap((a) => [ev({ area: a as Evidence["area"], indicatorId: `N2.${a}` }), ev({ area: a as Evidence["area"], indicatorId: `N2.${a}` })]);
    const s = session({ userTurns: 8, currentLevel: 2, evidence });
    s.levels[2].status = "CONFIRMED";
    expect(next(s).type).toBe("FLAT_PROFILE_STRATEGY");
    expect(next({ ...s, flatStrategyTried: true }).type).toBe("ADVANCE_LEVEL");
  });
  test("creencias rígidas → examinar (máximo 2 seguidas)", () => {
    const s = session({ userTurns: 2, currentLevel: 1, evidence: [ev({ indicatorId: "N0.CREENCIAS", area: undefined })], qualityHistory: ["RICH"] });
    expect(next(s).type).toBe("EXAMINE_BELIEF");
    expect(next({ ...s, beliefExamsInRow: 2, beliefExamsTotal: 2 }).type).not.toBe("EXAMINE_BELIEF");
  });
  test("vuelve a un nivel confirmado ante una contradicción", () => {
    const s = session({ userTurns: 9, currentLevel: 3, openContradictions: [{ indicatorId: "N2.C", description: "x" }] });
    s.levels[2].status = "CONFIRMED";
    expect(next(s)).toMatchObject({ type: "GO_BACK", level: 2 });
    expect(next({ ...s, wentBack: ["N2.C"] }).type).not.toBe("GO_BACK");
  });
  test("ofrece cerrar a los 30 turnos", () => {
    const s = session({ userTurns: 30, currentLevel: 1, lastN4Turn: 30, qualityHistory: ["RICH"] });
    expect(next(s).type).toBe("OFFER_CLOSE");
  });
});

describe("seguridad", () => {
  test.each([
    "no quiero vivir más",
    "a veces pienso en matarme",
    "me corto los brazos cuando estoy mal",
    "quiero desaparecer",
    "ya no aguanto más",
    "estoy pensando en suicidarme",
  ])("detecta riesgo: %s", (t) => expect(precheck(t).flag).toBe(true));
  test.each([
    "me muero de risa con mis amigos",
    "me corto el pelo yo mismo",
    "juego para matar el tiempo",
    "me mata de risa ese video",
    "me gusta arreglar bicis",
    "me muero de ganas de viajar",
  ])("no marca falsos positivos comunes: %s", (t) => expect(precheck(t).flag).toBe(false));
});

describe("guardas de salida", () => {
  test("una sola pregunta", () => {
    expect(check("¿Qué hacés? ¿Y qué te gusta?", "interview").ok).toBe(false);
    expect(check("Contame una vez que armaste algo. ¿Cómo fue?", "interview").ok).toBe(true);
  });
  test("sin carreras, instituciones ni diagnósticos", () => {
    expect(check("Podrías estudiar ingeniería, ¿te tienta?", "interview").ok).toBe(false);
    expect(check("En la Udelar hay opciones, ¿las viste?", "interview").ok).toBe(false);
    expect(check("Eso suena a ansiedad, ¿lo notás?", "interview").ok).toBe(false);
    expect(check("Sos creativo, ¿no?", "interview").ok).toBe(false);
  });
  test("puede reflejar palabras que usó la persona (presión familiar)", () => {
    expect(check("¿Qué te pasa a vos cuando pensás en medicina?", "interview", "mis viejos dicen medicina").ok).toBe(true);
  });
  test("límite de palabras", () => {
    expect(check(`${"palabra ".repeat(75)}?`, "interview").ok).toBe(false);
    expect(check(`${"palabra ".repeat(100)}?`, "summary").ok).toBe(true);
  });
});

describe("datos personales", () => {
  test("enmascara email, teléfono, documento, nombre, liceo y dirección", () => {
    const out = maskPII("Me llamo Juan Pérez, mi mail es juan@x.com, cel 099 123 456, CI 4.123.456-7, voy al Liceo Bauzá y vivo en Calle Rivera 1234");
    expect(out).not.toMatch(/Juan|juan@|099|4\.123|Bauzá|Rivera 1234/);
    expect(out).toContain("[nombre]");
    expect(out).toContain("[email]");
    expect(out).toContain("[teléfono]");
    expect(out).toContain("[documento]");
    expect(out).toContain("[centro educativo]");
  });
  test("no rompe texto común", () => {
    const t = "Me gusta la escuela de música y caminar a casa 10 minutos";
    expect(maskPII(t)).toBe(t);
  });
});
