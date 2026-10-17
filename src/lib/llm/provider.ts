import { genai, withRetry } from "@/lib/agent/run";

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

export function providerName(): "gemini" | "mock" {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  if (forced === "mock") return "mock";
  const hasKey = Boolean(process.env.GEMINI_API_KEY ?? process.env.keyvercel);
  if (forced === "gemini" && hasKey) return "gemini";
  return hasKey ? "gemini" : "mock";
}

const LLM_TIMEOUT_MS = 25_000;
function timeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout del LLM")), LLM_TIMEOUT_MS))]);
}

export function gemini(): LLMProvider {
  const ai = genai();
  let used = process.env.LLM_MODEL ?? "gemini-flash-latest";
  return {
    name: "gemini",
    get model() {
      return used;
    },
    async json({ system, prompt, jsonSchema }) {
      const res = await timeout(
        withRetry((model) => {
          used = model;
          return ai.models.generateContent({
            model,
            contents: prompt,
            config: { systemInstruction: system, responseMimeType: "application/json", responseJsonSchema: jsonSchema, temperature: 0.2 },
          });
        }),
      );
      return JSON.parse(res.text ?? "null");
    },
    async text({ system, prompt }) {
      const res = await timeout(
        withRetry((model) => {
          used = model;
          return ai.models.generateContent({ model, contents: prompt, config: { systemInstruction: system, temperature: 0.6 } });
        }),
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
