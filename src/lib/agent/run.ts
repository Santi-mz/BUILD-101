import { ApiError, GoogleGenAI, type Content, type FunctionDeclaration, type Part } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRumboMcp } from "@/lib/mcp/server";
import { SYSTEM_PROMPT } from "./prompt";

// Modelos con plan gratis de la Gemini API (Google AI Studio), en orden de preferencia.
// Si uno está saturado (503) o al límite (429), se prueba el siguiente.
// LLM_MODEL (opcional, de Santi) permite forzar un modelo primero.
export const MODELS = [...new Set([process.env.LLM_MODEL, "gemini-flash-latest", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-flash-lite-latest"].filter(Boolean) as string[])];

// Modelos que agotaron su cuota diaria gratis: se saltean por un rato para no perder tiempo reintentando.
const exhaustedUntil = new Map<string, number>();
const isDailyQuota = (err: unknown) => err instanceof ApiError && err.status === 429 && /PerDay|per day|quota/i.test(err.message);
const MAX_STEPS = 12;

// En Vercel la clave quedó cargada como "keyvercel"; se acepta ese nombre hasta renombrarla a GEMINI_API_KEY.
export const genai = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.keyvercel });

/** Corre `fn` con cada modelo de MODELS (dos intentos por modelo) hasta que uno responda. */
export async function withRetry<T>(fn: (model: string) => Promise<T>): Promise<T> {
  let last: unknown;
  const now = Date.now();
  const available = MODELS.filter((m) => (exhaustedUntil.get(m) ?? 0) < now);
  for (const model of available.length ? available : MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn(model);
      } catch (err) {
        last = err;
        if (isDailyQuota(err)) {
          exhaustedUntil.set(model, Date.now() + 30 * 60_000);
          break; // cuota del día agotada: pasar directo al siguiente modelo
        }
        if (!(err instanceof ApiError && (err.status === 503 || err.status === 429))) throw err;
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
  }
  throw last;
}

export type InsightKind = "inferencia" | "descarte" | "camino" | "evidencia";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "choices"; question: string; options: string[] }
  | { type: "insight"; kind: InsightKind; title: string; body: string }
  | { type: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  search_pubmed: "Buscando evidencia en PubMed",
  update_profile: "Actualizando tu perfil",
  get_profile: "Leyendo tu perfil",
  finalize_profile: "Armando tus recomendaciones",
  search_news: "Buscando noticias",
  web_search: "Buscando opciones reales en la web",
  graph_match_profile: "Recorriendo el grafo de carreras",
  graph_explore: "Navegando ocupaciones relacionadas",
  graph_search: "Buscando en el grafo de carreras",
};

// Herramientas locales (no MCP).
export const LOCAL_TOOLS: FunctionDeclaration[] = [
  {
    name: "share_insight",
    description:
      "Muestra al usuario una tarjeta con lo que acabás de entender o descubrir: una inferencia sobre su perfil, una hipótesis que descartás, un camino concreto (ocupaciones del grafo con % de afinidad) o un hallazgo científico en lenguaje simple. Usalo en cada turno, antes de offer_choices.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["inferencia", "descarte", "camino", "evidencia"] },
        title: { type: "string", description: "Titular corto, 3 a 8 palabras (ej: 'Lo tuyo es entender cómo funcionan las cosas')" },
        body: { type: "string", description: "1 o 2 frases conectadas con lo que dijo la persona" },
      },
      required: ["kind", "title", "body"],
    },
  },
  {
    name: "offer_choices",
    description:
      "Muestra al usuario tu pregunta con 3 o 4 respuestas rápidas en botones. Llamalo al final de cada turno de entrevista; después terminá el turno sin escribir más.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "web_search",
    description:
      "Busca en Google información actual y real (carreras, cursos, pasantías, llamados, becas en Uruguay). Devuelve un resumen con las URLs de las fuentes.",
    parametersJsonSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Búsqueda en español, ej: 'pasantías ingeniería Uruguay 2026'" } },
      required: ["query"],
    },
  },
];

/** Búsqueda web con grounding de Google en una llamada aparte (no se mezcla con las funciones). */
export async function webSearch(ai: GoogleGenAI, query: string) {
  try {
    return await groundedWebSearch(ai, query);
  } catch {
    return {
      summary: "",
      sources: [],
      note: "La búsqueda en Google no está disponible ahora (cuota gratis agotada). Usá search_opportunities (lee fuentes oficiales) y search_news para traer opciones reales con link.",
    };
  }
}

async function groundedWebSearch(ai: GoogleGenAI, query: string) {
  const res = await withRetry((model) => ai.models.generateContent({
    model,
    contents: `Buscá y resumí en viñetas opciones concretas y vigentes para: ${query}. Incluí nombre de la institución y la URL de cada una.`,
    config: { tools: [{ googleSearch: {} }] },
  }));
  const sources = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => c.web)
    .filter((w) => w?.uri)
    .map((w) => ({ title: w!.title, url: w!.uri }));
  return { summary: res.text ?? "", sources };
}

/** Conecta un cliente MCP en memoria al servidor MCP de Rumbo (mismo protocolo que el endpoint /api/mcp). */
export async function connectMcp(userId: string, supabase: SupabaseClient, trail?: string[]) {
  const server = createRumboMcp({ userId, supabase, trail });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "rumbo-agent", version: "0.1.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  const { tools } = await client.listTools();
  const declarations: FunctionDeclaration[] = tools.map((t) => {
    const { $schema: _schema, ...schema } = t.inputSchema as Record<string, unknown>;
    void _schema;
    return { name: t.name, description: t.description ?? "", parametersJsonSchema: schema };
  });
  return { client, declarations, close: () => client.close() };
}

/**
 * Corre el loop del agente sobre `history` (se modifica en el lugar, solo se agregan mensajes).
 * Emite eventos para la UI a medida que el modelo responde y usa herramientas.
 */
export async function runAgent(opts: {
  history: Content[];
  userId: string;
  supabase: SupabaseClient;
  emit: (e: AgentEvent) => void;
  /** Se llena con los nodos del grafo de carreras que el agente visitó. */
  trail?: string[];
}) {
  const { history, emit } = opts;
  const ai = genai();
  const mcp = await connectMcp(opts.userId, opts.supabase, opts.trail);

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await withRetry((model) => ai.models.generateContent({
        model,
        contents: history,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: [...mcp.declarations, ...LOCAL_TOOLS] }],
        },
      }));

      const content = res.candidates?.[0]?.content;
      if (!content?.parts?.length) {
        emit({ type: "error", message: "No pude responder eso. Probemos de otra forma." });
        return;
      }
      // Se guarda tal cual (incluye las firmas de pensamiento que Gemini exige en el turno siguiente).
      history.push({ role: "model", parts: content.parts });

      const text = content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
      if (text.trim()) emit({ type: "text", delta: text });

      const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
      if (calls.length === 0) return;

      let endTurn = false;
      const responses: Part[] = await Promise.all(
        calls.map(async (call): Promise<Part> => {
          const name = call.name ?? "";
          const args = (call.args ?? {}) as Record<string, unknown>;
          const reply = (response: Record<string, unknown>): Part => ({ functionResponse: { id: call.id, name, response } });

          if (name === "share_insight") {
            emit({ type: "insight", kind: (args.kind as InsightKind) ?? "inferencia", title: String(args.title ?? ""), body: String(args.body ?? "") });
            return reply({ result: "Mostrado." });
          }
          if (name === "offer_choices") {
            emit({ type: "choices", question: String(args.question ?? ""), options: (args.options as string[]) ?? [] });
            endTurn = true;
            return reply({ result: "Opciones mostradas. Esperá la respuesta del usuario." });
          }
          emit({ type: "tool", name, label: TOOL_LABELS[name] ?? name });
          try {
            if (name === "web_search") return reply(await webSearch(ai, String(args.query ?? "")));
            const res = await mcp.client.callTool({ name, arguments: args });
            const out = (res.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("\n");
            return reply(res.isError ? { error: out } : { result: out });
          } catch (err) {
            return reply({ error: String(err) });
          }
        }),
      );
      // Todas las respuestas de funciones en un solo turno de usuario.
      history.push({ role: "user", parts: responses });
      if (endTurn) return;
    }
  } catch (err) {
    console.error(err);
    emit({
      type: "error",
      message:
        err instanceof ApiError && (err.status === 429 || err.status === 503)
          ? "La IA está saturada en este momento. Esperá un minuto y probá de nuevo."
          : "Algo falló, probá de nuevo.",
    });
  } finally {
    await mcp.close();
  }
}
