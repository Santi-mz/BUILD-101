import { mock, type LLMProvider } from "@/lib/llm/provider";
import { greet, newSession, runTurn } from "@/lib/engine/turn";
import { rubricV1 } from "@/lib/rubric";
import type { SessionState } from "@/lib/engine/types";

export const provider = mock();

export async function start(ageRange: SessionState["ageRange"] = "A18_21", p: LLMProvider = provider) {
  const s = newSession({ ageRange, guardianConsent: false, model: p.model });
  await greet(p, s);
  return s;
}

/**
 * Sesión con la rúbrica v1 (planificador por niveles). La usan las pruebas que cubren el comportamiento v1
 * (escenarios E1–E7 del Documento 2 y regresiones de producción previas a la spec de la demo).
 */
export async function startV1(ageRange: SessionState["ageRange"] = "A18_21", p: LLMProvider = provider) {
  const s = newSession({ ageRange, guardianConsent: false, model: p.model });
  s.rubricVersion = rubricV1.version;
  await greet(p, s);
  return s;
}

/** Corre una conversación y devuelve el estado y las respuestas del agente. */
export async function talk(s: SessionState, lines: string[]) {
  const replies: { text: string; action: string }[] = [];
  for (const l of lines) {
    const out = await runTurn(provider, s, l);
    replies.push({ text: out.reply, action: out.action.type });
  }
  return replies;
}

// ---------------------------------------------------------------------------------------------
// Simulador de personajes (spec demo-um-udelar, tarea 2). Funciona con el motor actual y con el v2:
// los campos nuevos (questionsAsked, lastOptions, provisional…) se leen sin depender de los tipos.
// ---------------------------------------------------------------------------------------------

/** Lee un campo que puede no existir todavía en SessionState (lo agregan las tareas 4 a 7). */
export function field<T>(obj: unknown, key: string): T | undefined {
  return obj && typeof obj === "object" ? ((obj as Record<string, unknown>)[key] as T | undefined) : undefined;
}

/** Mensajes del asistente con "?" (definición de "pregunta de la IA" de la spec). */
export const countQuestions = (s: SessionState) => s.messages.filter((m) => m.role === "ASSISTANT" && m.content.includes("?")).length;

/** PRNG con semilla fija (mulberry32), para que las conversaciones al azar sean reproducibles. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lo que responde un personaje en un turno: texto libre, una opción (botón) o pedir el perfil. */
export type Reply = { message: string; optionId?: string; close?: boolean };
export type Persona = (s: SessionState, turn: number) => Reply;

const options = (s: SessionState) => field<{ id: string; label: string }[] | null>(s, "lastOptions") ?? [];
const lastAction = (s: SessionState) => s.messages.filter((m) => m.role === "ASSISTANT").at(-1)?.action?.type;
const isSummary = (s: SessionState) => ["SUMMARIZE_LEVEL", "MINI_SUMMARY", "WAIT_CONFIRMATION"].includes(lastAction(s) ?? "");
const cycle = (list: string[], i: number) => list[i % list.length];

const RICH = [
  "Me encanta programar jueguitos, el año pasado hice uno de naves con un amigo y me quedé noches enteras",
  "Ayudo a mis compañeros con matemática antes de las pruebas y me gusta mucho explicar",
  "Me importa seguir aprendiendo y que lo que haga sirva para algo",
  "Una vez desarmé una radio vieja para entender cómo funcionaba por dentro",
  "No me gusta estar todo el día haciendo trámites ni cosas repetitivas",
  "Necesito que sea gratis porque en casa no da para pagar",
];
const VAGUE = ["no sé", "depende", "capaz", "ni idea", "qué se yo", "no me interesa", "puede ser", "paso"];

export const PERSONAS: Record<string, Persona> = {
  /** Contesta con información rica y concreta, y confirma los resúmenes. */
  rico: (s, i) => (isSummary(s) ? { message: "sí, tal cual" } : { message: cycle(RICH, i) }),
  /** Nunca da información. */
  vago: (_s, i) => ({ message: cycle(VAGUE, i) }),
  /** Da información media y rechaza todos los resúmenes. */
  rechaza: (s, i) => (isSummary(s) ? { message: "No, no es así" } : { message: cycle(["me gusta dibujar", "a veces ayudo a mi hermano", "me gusta el fútbol"], i) }),
  /** Ignora la pregunta y habla de otra cosa (con algo de información). */
  ignora: (_s, i) => ({ message: cycle(["ayer fui al cine con mis amigos", "mi perro se llama Toto", "me gusta el asado", "hace frío hoy"], i) }),
  /** Alterna información, "no sé" y botones. */
  mixto: (s, i) => {
    const o = options(s);
    if (i % 3 === 2 && o.length) return { message: o[0].label, optionId: o[0].id };
    return i % 3 === 1 ? { message: cycle(VAGUE, i) } : { message: cycle(RICH, i) };
  },
  /** Solo toca botones (la primera opción con información); sin botones, "no sé". */
  "solo-botones": (s) => {
    const o = options(s).filter((x) => !["none", "skip"].includes(x.id));
    return o.length ? { message: o[0].label, optionId: o[0].id } : isSummary(s) ? { message: "sí" } : { message: "no sé" };
  },
  /** Pide el perfil en la segunda respuesta. */
  "pide-perfil-temprano": (_s, i) => (i === 1 ? { message: "quiero ver mi perfil", close: true } : { message: "me gusta dibujar" }),
};

/** Proveedor "gemini" que siempre falla (cuota agotada, red caída). Cuenta las llamadas. */
export function failing(): LLMProvider & { calls: number } {
  const p = {
    name: "gemini" as const,
    model: "failing",
    calls: 0,
    async json(): Promise<unknown> {
      p.calls++;
      throw new Error("failing: LLM caído");
    },
    async text(): Promise<string> {
      p.calls++;
      throw new Error("failing: LLM caído");
    },
  };
  return p;
}

/** Proveedor que tarda `ms` en responder (por defecto 30 s) y después falla. */
export function slow(ms = 30_000): LLMProvider & { calls: number } {
  const p = {
    name: "gemini" as const,
    model: "slow",
    calls: 0,
    async json(): Promise<unknown> {
      p.calls++;
      await new Promise((r) => setTimeout(r, ms));
      throw new Error("slow: timeout");
    },
    async text(): Promise<string> {
      p.calls++;
      await new Promise((r) => setTimeout(r, ms));
      throw new Error("slow: timeout");
    },
  };
  return p;
}

/** Un turno con la respuesta del personaje. `optionId` se pasa aunque el motor todavía no lo use. */
export async function reply(p: LLMProvider, s: SessionState, r: Reply) {
  const opts = { forceClose: r.close, optionId: r.optionId } as Parameters<typeof runTurn>[3];
  return runTurn(p, s, r.message, opts);
}

/** Corre un personaje hasta que la sesión cierre o se llegue a `maxTurns` respuestas. */
export async function simulate(persona: Persona, opts: { p?: LLMProvider; maxTurns?: number } = {}) {
  const p = opts.p ?? provider;
  const s = await start("A18_21", p);
  for (let i = 0; i < (opts.maxTurns ?? 45) && s.status === "ACTIVE"; i++) await reply(p, s, persona(s, i));
  return s;
}
