import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { searchPubmed } from "@/lib/pubmed";
import { profileUpdateSchema, topThree, type ProfileData } from "@/lib/profile";

type Ctx = { userId?: string; supabase?: SupabaseClient };

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value) }],
});

/**
 * Servidor MCP de Rumbo. Las herramientas de evidencia (PubMed) y noticias son públicas;
 * las de perfil solo se registran cuando hay un usuario logueado.
 */
export function createRumboMcp(ctx: Ctx = {}) {
  const server = new McpServer({ name: "rumbo", version: "0.1.0" });

  server.registerTool(
    "search_pubmed",
    {
      description:
        "Busca papers de psicología vocacional en PubMed (en inglés). Usalo para respaldar con evidencia cada inferencia sobre intereses, personalidad o ajuste persona-carrera. Devuelve PMID, título, revista, año y abstract.",
      inputSchema: {
        query: z.string().describe("Consulta en inglés, ej: 'RIASEC interests career satisfaction adolescents'"),
        max_results: z.number().int().min(1).max(8).optional(),
      },
    },
    async ({ query, max_results }) => text(await searchPubmed(query, max_results ?? 4)),
  );

  server.registerTool(
    "search_news",
    {
      description:
        "Busca en la base de noticias reales de Rumbo (empleo, pasantías, becas, estudios en Uruguay) por palabras clave.",
      inputSchema: { keywords: z.array(z.string()).min(1) },
    },
    async ({ keywords }) => {
      if (!ctx.supabase) return text([]);
      const or = keywords.map((k) => `title.ilike.%${k.replace(/[,%()]/g, "")}%`).join(",");
      const { data } = await ctx.supabase
        .from("news")
        .select("title,url,source,summary,category,published_at")
        .or(or)
        .order("published_at", { ascending: false })
        .limit(8);
      return text(data ?? []);
    },
  );

  if (!ctx.userId || !ctx.supabase) return server;
  const { userId, supabase } = ctx;

  const load = async () =>
    (await supabase.from("profiles").select("data,status,question_count").eq("user_id", userId).maybeSingle())
      .data;

  server.registerTool(
    "get_profile",
    { description: "Devuelve el perfil vocacional actual del usuario y cuántas preguntas lleva.", inputSchema: {} },
    async () => text((await load()) ?? { data: null, status: "in_progress", question_count: 0 }),
  );

  server.registerTool(
    "update_profile",
    {
      description:
        "Guarda tu estimación ACTUAL y COMPLETA del perfil después de cada respuesta del usuario. Mandá siempre las seis dimensiones RIASEC con score y confidence; la confianza solo sube con evidencia de lo que dijo el usuario.",
      inputSchema: profileUpdateSchema.shape,
    },
    async (input) => {
      const prev = await load();
      const prevData = (prev?.data ?? {}) as ProfileData;
      const data: ProfileData = {
        ...prevData,
        ...input,
        history: [...(prevData.history ?? []), topThree(input)].slice(-6),
      };
      const { error } = await supabase.from("profiles").upsert({
        user_id: userId,
        data,
        status: prev?.status ?? "in_progress",
        question_count: prev?.question_count ?? 0,
        updated_at: new Date().toISOString(),
      });
      return text(error ? `Error: ${error.message}` : "Perfil guardado.");
    },
  );

  server.registerTool(
    "finalize_profile",
    {
      description:
        "Cierra la entrevista: guarda recomendaciones concretas (carreras, cursos, pasantías, empleos, becas) con el porqué de cada una. Llamalo solo cuando el sistema te indique que el perfil está listo o el usuario pida resultados.",
      inputSchema: {
        recommendations: z
          .array(
            z.object({
              type: z.enum(["carrera", "curso", "pasantia", "empleo", "beca"]),
              title: z.string(),
              why: z.string(),
              url: z.string().optional(),
            }),
          )
          .min(3)
          .max(10),
      },
    },
    async ({ recommendations }) => {
      const prev = await load();
      const { error } = await supabase
        .from("profiles")
        .update({
          data: { ...(prev?.data ?? {}), recommendations },
          status: "final",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      return text(error ? `Error: ${error.message}` : "Perfil finalizado.");
    },
  );

  return server;
}
