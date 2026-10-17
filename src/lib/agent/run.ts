import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createRumboMcp } from "@/lib/mcp/server";
import { SYSTEM_PROMPT } from "./prompt";

export const MODEL = "claude-opus-5-5";

// En Vercel la clave quedó cargada como "key"; se acepta ese nombre hasta renombrarla a ANTHROPIC_API_KEY.
export const anthropicClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? process.env.key });
const MAX_STEPS = 12;

type Msg = Anthropic.Beta.BetaMessageParam;

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; label: string }
  | { type: "choices"; question: string; options: string[] }
  | { type: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  search_pubmed: "Buscando evidencia en PubMed",
  update_profile: "Actualizando tu perfil",
  get_profile: "Leyendo tu perfil",
  finalize_profile: "Armando tus recomendaciones",
  search_news: "Buscando noticias",
  web_search: "Buscando opciones reales en la web",
};

// Herramienta local (no MCP): la UI la dibuja como botones de respuesta rápida.
const OFFER_CHOICES: Anthropic.Beta.BetaTool = {
  name: "offer_choices",
  description:
    "Muestra al usuario tu pregunta con 3 o 4 respuestas rápidas en botones. Llamalo al final de cada turno de entrevista; después terminá el turno sin escribir más.",
  input_schema: {
    type: "object",
    properties: {
      question: { type: "string" },
      options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
    },
    required: ["question", "options"],
    additionalProperties: false,
  },
  strict: true,
};

/** Conecta un cliente MCP en memoria al servidor MCP de Rumbo (mismo protocolo que el endpoint /api/mcp). */
async function connectMcp(userId: string, supabase: SupabaseClient) {
  const server = createRumboMcp({ userId, supabase });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "rumbo-agent", version: "0.1.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  const { tools } = await client.listTools();
  const anthropicTools: Anthropic.Beta.BetaTool[] = tools.map((t) => {
    const { $schema: _ignored, ...schema } = t.inputSchema as Record<string, unknown>;
    return {
      name: t.name,
      description: t.description ?? "",
      input_schema: schema as Anthropic.Beta.BetaTool.InputSchema,
    };
  });
  return { client, tools: anthropicTools, close: () => client.close() };
}

/**
 * Corre el loop del agente sobre `history` (se modifica en el lugar, solo se agregan mensajes).
 * Emite eventos para la UI a medida que el modelo escribe y usa herramientas.
 */
export async function runAgent(opts: {
  history: Msg[];
  userId: string;
  supabase: SupabaseClient;
  emit: (e: AgentEvent) => void;
}) {
  const { history, emit } = opts;
  const anthropic = anthropicClient();
  const mcp = await connectMcp(opts.userId, opts.supabase);

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const stream = anthropic.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: SYSTEM_PROMPT,
        tools: [
          ...mcp.tools,
          OFFER_CHOICES,
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 4,
            user_location: { type: "approximate", country: "UY", city: "Montevideo" },
          },
        ],
        messages: history,
      });

      stream.on("text", (delta) => emit({ type: "text", delta }));
      stream.on("contentBlock", (block) => {
        if (block.type === "server_tool_use") emit({ type: "tool", name: block.name, label: TOOL_LABELS[block.name] ?? block.name });
      });

      const message = await stream.finalMessage();
      history.push({ role: "assistant", content: message.content });

      if (message.stop_reason === "refusal") {
        emit({ type: "error", message: "No puedo seguir con eso. Probemos por otro lado." });
        return;
      }
      if (message.stop_reason === "pause_turn") continue;

      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) return;
      if (message.stop_reason === "max_tokens") {
        emit({ type: "error", message: "La respuesta se cortó, probá de nuevo." });
        return;
      }

      let endTurn = false;
      const results = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          if (tu.name === "offer_choices") {
            const input = tu.input as { question: string; options: string[] };
            emit({ type: "choices", question: input.question, options: input.options });
            endTurn = true;
            return { type: "tool_result", tool_use_id: tu.id, content: "Opciones mostradas. Esperá la respuesta del usuario." };
          }
          emit({ type: "tool", name: tu.name, label: TOOL_LABELS[tu.name] ?? tu.name });
          try {
            const res = await mcp.client.callTool({ name: tu.name, arguments: tu.input as Record<string, unknown> });
            const content = (res.content as { type: string; text?: string }[])
              .map((c) => c.text ?? "")
              .join("\n");
            return { type: "tool_result", tool_use_id: tu.id, content, is_error: Boolean(res.isError) };
          } catch (err) {
            return { type: "tool_result", tool_use_id: tu.id, content: String(err), is_error: true };
          }
        }),
      );
      // Todos los resultados en un solo mensaje de usuario.
      history.push({ role: "user", content: results });
      if (endTurn) return;
    }
  } catch (err) {
    console.error(err);
    emit({
      type: "error",
      message: err instanceof Anthropic.APIError ? `Error de la API (${err.status})` : "Algo falló, probá de nuevo.",
    });
  } finally {
    await mcp.close();
  }
}
