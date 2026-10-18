import { indicator, levelOf } from "@/lib/rubric";
import { LLMUnavailable, type LLMProvider } from "@/lib/llm/provider";
import { ACTION_GUIDE, INTERVIEWER_SYSTEM } from "@/prompts/interviewer.v1";
import { check, type GuardMode } from "./guards";
import { evidenceOfLevel, panelLabel } from "./profile";
import type { Action, Evidence, SessionState } from "./types";

/**
 * Entrevistador (LLM 2): redacta el mensaje según la acción del planificador.
 * Guardas: si falla, 1 reintento con la razón; si vuelve a fallar, plantilla segura del indicador.
 */
export const modeFor = (a: Action): GuardMode => (a.type === "SUMMARIZE_LEVEL" ? "summary" : a.type === "SAFETY" ? "safety" : "interview");

const userTextOf = (s: SessionState) => s.messages.filter((m) => m.role === "USER").map((m) => m.content).join(" \n ");

export function summaryEvidence(s: SessionState, lvl: number): Evidence[] {
  const own = evidenceOfLevel(s, lvl).filter((e) => e.polarity === 1 || e.indicatorId.startsWith("N2."));
  // Nivel cerrado por tope de turnos sin evidencia propia: se resume lo que sí contó.
  const ev = own.length ? own : s.evidence.filter((e) => e.status === "PENDING" && e.polarity === 1);
  const n4 = lvl >= 1 ? s.evidence.filter((e) => e.indicatorId.startsWith("N4.") && e.status === "PENDING") : [];
  // Sin repetir: un ítem por etiqueta, priorizando episodios concretos.
  const seen = new Set<string>();
  return [...ev.sort((x, y) => Number(y.concrete) - Number(x.concrete)), ...n4]
    .filter((e) => {
      const k = panelLabel(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 8);
}

function buildPrompt(s: SessionState, a: Action) {
  const ind = a.indicatorId ? indicator(a.indicatorId) : undefined;
  const recent = s.messages.slice(-6).map((m) => `${m.role === "USER" ? "Persona" : "Vos"}: ${m.content}`).join("\n");
  const confirmed = s.evidence.filter((e) => e.status === "CONFIRMED").map((e) => `- ${panelLabel(e)} ("${e.quote}")`);
  const summary =
    a.type === "SUMMARIZE_LEVEL"
      ? `\nEVIDENCIAS PARA RESUMIR (nivel ${a.level} · ${levelOf(a.level).name}). Las HIPÓTESIS van como pregunta:\n${summaryEvidence(s, a.level)
          .map((e) => `- [${e.kind === "HYPOTHESIS" ? "HIPÓTESIS" : "DICHO"}] ${panelLabel(e)}: "${e.quote}"`)
          .join("\n")}`
      : "";
  return `ACCIÓN: ${a.type}
QUÉ HACER: ${ACTION_GUIDE[a.type] ?? ""}${a.notes ? `\nNOTA: ${a.notes}` : ""}
${ind ? `INDICADOR OBJETIVO: ${ind.id} · ${ind.label}: ${ind.plain}
Evidencia válida: ${ind.validEvidence.join("; ")}
Preguntas de ejemplo: ${ind.exampleQuestions.join(" | ")}${ind.tactGuidance ? `\nTacto: ${ind.tactGuidance}` : ""}
Prohibido inferir: ${ind.forbiddenInferences.join("; ")}` : ""}${summary}

PERFIL CONFIRMADO
${confirmed.length ? confirmed.join("\n") : "(nada todavía)"}

ÚLTIMOS MENSAJES
${recent || "(inicio de la charla)"}

Escribí solo el mensaje.`;
}

export async function write(provider: LLMProvider, s: SessionState, a: Action): Promise<{ text: string; source: "llm" | "retry" | "template" }> {
  const mode = modeFor(a);
  const said = userTextOf(s);
  if (provider.name === "mock") return { text: safeTemplate(s, a, mode, said), source: "template" };
  let prompt = buildPrompt(s, a);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const draft = (await provider.text({ system: INTERVIEWER_SYSTEM, prompt })).replace(/\*\*/g, "").trim();
      const g = check(draft, mode, said);
      if (g.ok) return { text: draft, source: attempt ? "retry" : "llm" };
      prompt += `\n\nTu borrador anterior no pasó las validaciones: ${g.reasons.join("; ")}. Reescribilo corrigiendo eso.`;
    } catch (err) {
      console.warn(JSON.stringify({ event: "interviewer.error", attempt, error: String(err).slice(0, 120) }));
      if (err instanceof LLMUnavailable) break;
    }
  }
  return { text: safeTemplate(s, a, mode, said), source: "template" };
}

/** Plantilla que también pasa por las guardas; si no, la primera pregunta de ejemplo del indicador. */
function safeTemplate(s: SessionState, a: Action, mode: GuardMode, said: string) {
  const t = template(s, a);
  if (check(t, mode, said).ok) return t;
  const ind = a.indicatorId ? indicator(a.indicatorId) : undefined;
  return ind?.exampleQuestions[0] ?? "Contame un poco más, ¿qué te gustaría agregar?";
}

// ---------------------------------------------------------------------------------------------
// Plantillas seguras (fallback y modo mock). Cumplen las guardas: una pregunta, sin carreras.
// ---------------------------------------------------------------------------------------------
const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

export function lastUserWords(s: SessionState) {
  const last = [...s.messages].reverse().find((m) => m.role === "USER")?.content ?? "";
  const first = last.split(/(?<=[.!?])\s/)[0].replace(/[¿?]/g, "").trim();
  const words = first.split(/\s+/);
  return words.length > 12 ? `${words.slice(0, 12).join(" ")}…` : first;
}

export function template(s: SessionState, a: Action): string {
  const ind = a.indicatorId ? indicator(a.indicatorId) : undefined;
  const q = ind ? pick(ind.exampleQuestions, s.userTurns) : "¿Qué te gustaría contarme ahora?";
  const echo = lastUserWords(s);
  const prevAssistant = [...s.messages].reverse().find((m) => m.role === "ASSISTANT");
  const ack = pick(["Entiendo.", "Te sigo.", "Gracias por contarlo.", "Ok, anotado.", "Bien, sigamos."], s.userTurns);
  switch (a.type) {
    case "GREETING":
      return `¡Hola! Soy una IA para explorar juntos qué te gusta y qué te importa. No es un test y no hace falta que tengas nada claro. ${q}`;
    case "ASK_DEEPEN":
      if (prevAssistant?.action?.type === "ASK_DEEPEN")
        return "Bajémoslo a algo puntual: ¿qué fue lo último que hiciste así? Contame qué parte te gustó más.";
      return `${echo && echo.split(/\s+/).length >= 3 ? `Dijiste "${echo}". ` : ""}Para no quedarme con una idea general, ¿te acordás de una vez puntual en la que pasó eso? Contame qué hacías, con quién y qué parte disfrutaste más.`;
    case "CHANGE_ANGLE":
      return `Está bien, no hace falta tenerlo claro. Probemos por otro lado. ${q}`;
    case "WAIT_CONFIRMATION":
      return "Quiero asegurarme de no haberte entendido mal. Lo que resumí recién, ¿te representa o hay algo que cambiarías?";
    case "SUMMARIZE_LEVEL":
      return summaryTemplate(s, a.level);
    case "ADVANCE_LEVEL":
      return `Gracias, eso me ayuda. Ahora vamos a ${STAGE_INTRO[a.level] ?? "otra parte"}. ${q}`;
    case "GO_BACK":
      return `Esto cambia algo que habíamos dicho antes, y está perfecto cambiar de idea. ${a.notes ? `${a.notes.replace(/[¿?]/g, "")}. ` : ""}Hoy, ¿cómo lo ves?`;
    case "FLAT_PROFILE_STRATEGY":
      return "Todavía no se destaca nada en particular, y eso no es un problema. Probemos distinto: pensá en alguien que admires, de tu entorno o no. ¿Qué hace esa persona que te llama la atención?";
    case "EXAMINE_BELIEF":
      return pick(
        [
          "Entiendo que se sienta así de grande. ¿Conocés a alguien que haya cambiado de rumbo después de empezar algo, y qué le pasó?",
          "Tiene sentido que pese elegir. Si eligieras algo y después no te convenciera, ¿qué podrías hacer en ese momento?",
        ],
        s.beliefExamsTotal,
      );
    case "OFFER_CLOSE":
      return "Ya charlamos bastante y tengo bastante para devolverte. Podemos cerrar acá y ver lo que entendí, o seguir un rato más. ¿Qué preferís?";
    case "ASK_NEW":
    default:
      return `${ack} ${q}`.trim();
  }
}

const STAGE_INTRO: Record<number, string> = {
  1: "mirar en general qué tipo de cosas disfrutás",
  2: "ver qué tipo de actividades te enganchan más",
  3: "bajar a cosas bien concretas",
  4: "pensar en lo que te importa",
};

export function summaryTemplate(s: SessionState, lvl: number) {
  const ev = summaryEvidence(s, lvl);
  // Si no hay nada dicho explícitamente, se resumen las hipótesis en vez de un "todavía poco" vacío.
  const declared = ev.filter((e) => e.kind === "DECLARED");
  const parts = (declared.length ? declared : ev).slice(0, 3).map((e) => `${panelLabel(e).toLowerCase()} (cuando dijiste "${shortQuote(e.quote)}")`);
  const head = `Hasta acá entendí esto: ${parts.length ? parts.join("; ") : "todavía poco, y está bien"}.`;
  let text = `${head} ¿Te representa o cambiarías algo?`;
  while (text.split(/\s+/).length > 115 && parts.length > 1) {
    parts.pop();
    text = `Hasta acá entendí esto: ${parts.join("; ")}. ¿Te representa o cambiarías algo?`;
  }
  return text;
}

const shortQuote = (q: string) => {
  const w = q.replace(/[¿?"]/g, "").split(/\s+/);
  return w.length > 10 ? `${w.slice(0, 10).join(" ")}…` : w.join(" ");
};
