import { genai, withRetry } from "@/lib/agent/run";

/**
 * Proveedor de LLM intercambiable. Con varias claves se encadenan: si uno falla se prueba el siguiente
 * (Gemini → Claude) y, si fallan todos, el motor sigue con reglas. Sin claves: "mock" determinista,
 * para que la demo se pueda recorrer entera (blueprint, sección 12).
 */
export type ProviderName = "gemini" | "claude" | "mock";
export type LLMProvider = {
  name: ProviderName;
  model: string;
  /** Devuelve JSON crudo (sin validar) según `jsonSchema`. */
  json(opts: { system: string; prompt: string; jsonSchema: Record<string, unknown> }): Promise<unknown>;
  text(opts: { system: string; prompt: string }): Promise<string>;
};

const geminiKey = () => (process.env.GEMINI_API_KEY ?? process.env.keyvercel)?.trim() || undefined;
const claudeKey = () => process.env.ANTHROPIC_API_KEY?.trim() || undefined;

/** Proveedores disponibles, en orden. LLM_PROVIDER fuerza uno ("gemini", "claude" o "mock"). */
export function providerChain(): ProviderName[] {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  if (forced === "mock") return [];
  const all: ProviderName[] = [];
  if (geminiKey()) all.push("gemini");
  if (claudeKey()) all.push("claude");
  if ((forced === "gemini" || forced === "claude") && all.includes(forced)) return [forced, ...all.filter((x) => x !== forced)];
  return all;
}

export function providerName(): ProviderName {
  return providerChain()[0] ?? "mock";
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

/** Claude (API de Anthropic) por HTTP, sin SDK extra. Modelo por defecto: el más rápido y barato. */
export function claude(): LLMProvider {
  const model = process.env.CLAUDE_MODEL ?? "claude-haiku-5-5";
  const call = async (system: string, prompt: string) => {
    const res = await timeout(
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": claudeKey() ?? "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 2048, system, messages: [{ role: "user", content: prompt }] }),
      }),
    );
    const data = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`Claude ${res.status}: ${data?.error?.message ?? "error"}`);
    return (data?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  };
  return {
    name: "claude",
    model,
    async json({ system, prompt, jsonSchema }) {
      const out = await call(
        `${system}\n\nRespondé SOLO con un objeto JSON válido (sin texto alrededor ni bloques de código) que cumpla este JSON Schema:\n${JSON.stringify(jsonSchema)}`,
        prompt,
      );
      const start = out.indexOf("{");
      const end = out.lastIndexOf("}");
      return JSON.parse(start >= 0 && end > start ? out.slice(start, end + 1) : out);
    },
    text: ({ system, prompt }) => call(system, prompt),
  };
}

/** Encadena proveedores: si el primero falla (clave, cuota, red), prueba el siguiente. */
function chain(list: LLMProvider[]): LLMProvider {
  if (list.length === 1) return list[0];
  let current = list[0];
  const run = async <T,>(fn: (p: LLMProvider) => Promise<T>) => {
    let last: unknown;
    for (const p of list) {
      try {
        const out = await fn(p);
        current = p;
        return out;
      } catch (err) {
        last = err;
        console.warn(JSON.stringify({ event: "llm.provider_failed", provider: p.name, error: String(err).slice(0, 120) }));
      }
    }
    throw last;
  };
  return {
    get name() {
      return current.name;
    },
    get model() {
      return current.model;
    },
    json: (o) => run((p) => p.json(o)),
    text: (o) => run((p) => p.text(o)),
  };
}

export const llm = (): LLMProvider => {
  const names = providerChain();
  if (!names.length) return mock();
  return chain(names.map((n) => (n === "gemini" ? gemini() : claude())));
};

/** Prueba cada proveedor configurado con un pedido mínimo y devuelve el error legible si falla. */
export async function checkProviders() {
  const names = providerChain();
  const results = await Promise.all(
    names.map(async (n) => {
      const p = n === "gemini" ? gemini() : claude();
      try {
        const t = await p.text({ system: "Respondé con una sola palabra.", prompt: "Decí hola." });
        return { provider: n, model: p.model, ok: Boolean(t), error: null as string | null };
      } catch (err) {
        return { provider: n, model: p.model, ok: false, error: explain(String(err)) };
      }
    }),
  );
  return { configured: names, results };
}

function explain(e: string) {
  if (/API key not valid|API_KEY_INVALID|invalid x-api-key|authentication_error|401|403/i.test(e)) return "La clave no es válida. Volvé a copiarla y pegala de nuevo.";
  if (/429|quota|RESOURCE_EXHAUSTED|rate/i.test(e)) return "Se llegó al límite de uso (cuota). Esperá un rato o usá otra clave/proveedor.";
  if (/credit|billing|balance/i.test(e)) return "La cuenta no tiene saldo o facturación activa.";
  if (/timeout|fetch failed|ENOTFOUND|ECONN/i.test(e)) return "No hay conexión con el servicio (red o firewall).";
  if (/404|not found|model/i.test(e)) return "El modelo configurado no existe para esta clave.";
  return e.slice(0, 200);
}
