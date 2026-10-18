import { genai } from "@/lib/agent/run";

/**
 * Proveedor de LLM intercambiable. Gemini (plan gratis) cuando hay clave; "mock" determinista sin credenciales
 * para que la demo se pueda recorrer entera (blueprint, sección 12).
 */
export type LLMProvider = {
  name: "gemini" | "mock";
  model: string;
  /** Devuelve JSON crudo (sin validar) según `jsonSchema`. */
  json(opts: { system: string; prompt: string; jsonSchema: Record<string, unknown> }): Promise<unknown>;
  text(opts: { system: string; prompt: string }): Promise<string>;
};

/** Ningún modelo respondió a tiempo: no tiene sentido reintentar en este turno, conviene ir directo al plan B. */
export class LLMUnavailable extends Error {
  constructor(cause: unknown) {
    super(`LLM no disponible: ${String(cause).slice(0, 160)}`);
  }
}

export function providerName(): "gemini" | "mock" {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  if (forced === "mock") return "mock";
  const hasKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.keyvercel);
  if (forced === "gemini" && hasKey) return "gemini";
  return hasKey ? "gemini" : "mock";
}

/**
 * Orden de modelos del motor. Primero el rápido: medido con el prompt del analizador, flash-lite responde en ~2 s
 * y gemini-flash-latest tarda ~40 s porque "piensa" antes de contestar, lo que no entra en un turno de chat.
 */
export const ENGINE_MODELS = [
  ...new Set([process.env.LLM_MODEL, "gemini-flash-lite-latest", "gemini-3.5-flash", "gemini-flash-latest"].filter(Boolean) as string[]),
];
/** Tiempo máximo por intento con un modelo, y por llamada completa (todos los modelos). */
const ATTEMPT_MS = 12_000;
const CALL_MS = 20_000;

// Modelos en pausa hasta cierto momento (cuota por minuto o del día, saturación o lentitud).
const pausedUntil = new Map<string, number>();

function pauseFor(err: unknown, timedOut: boolean): number {
  if (timedOut) return 2 * 60_000;
  const e = err as { status?: number; message?: string };
  if (e.status === 429) return /PerDay|per day/i.test(e.message ?? "") ? 30 * 60_000 : 60_000;
  if (e.status === 503) return 30_000;
  return 0;
}

/**
 * Prueba cada modelo una vez, con su propio límite de tiempo (y cancelando la llamada que se pasa), salteando los
 * que están en pausa. Si ninguno responde dentro de CALL_MS, tira LLMUnavailable.
 */
async function firstThatAnswers<T>(run: (model: string, signal: AbortSignal) => Promise<T>, onModel: (m: string) => void): Promise<T> {
  const deadline = Date.now() + CALL_MS;
  const now = Date.now();
  const ready = ENGINE_MODELS.filter((m) => (pausedUntil.get(m) ?? 0) <= now);
  // Todos en pausa (cuota o saturación): ir directo al plan B sin gastar llamadas que van a fallar.
  if (!ready.length) throw new LLMUnavailable("todos los modelos en pausa");
  let last: unknown = new Error("sin modelos");
  for (const model of ready) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(ATTEMPT_MS, left));
    try {
      onModel(model);
      return await run(model, ctrl.signal);
    } catch (err) {
      last = err;
      const pause = pauseFor(err, ctrl.signal.aborted);
      if (pause) pausedUntil.set(model, Date.now() + pause);
      console.warn(JSON.stringify({ event: "llm.model_failed", model, timedOut: ctrl.signal.aborted, error: String(err).slice(0, 120) }));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new LLMUnavailable(last);
}

export function gemini(): LLMProvider {
  const ai = genai();
  let used = ENGINE_MODELS[0];
  const onModel = (m: string) => {
    used = m;
  };
  return {
    name: "gemini",
    get model() {
      return used;
    },
    async json({ system, prompt, jsonSchema }) {
      const res = await firstThatAnswers(
        (model, abortSignal) =>
          ai.models.generateContent({
            model,
            contents: prompt,
            config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchema, temperature: 0.2, abortSignal },
          }),
        onModel,
      );
      return JSON.parse(res.text ?? "null");
    },
    async text({ system, prompt }) {
      const res = await firstThatAnswers(
        (model, abortSignal) => ai.models.generateContent({ model, contents: prompt, config: { systemInstruction: system, temperature: 0.6, abortSignal } }),
        onModel,
      );
      return (res.text ?? "").trim();
    },
  };
}

/** El mock no llama a nadie: el analizador y el entrevistador usan sus versiones por reglas. */
export function mock(): LLMProvider {
  return {
    name: "mock",
    model: "mock-reglas-v1",
    async json() {
      throw new Error("mock: usar el analizador por reglas");
    },
    async text() {
      throw new Error("mock: usar plantillas");
    },
  };
}

export const llm = (): LLMProvider => (providerName() === "gemini" ? gemini() : mock());
