import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { searchPubmed } from "@/lib/pubmed";
import { GRAPH_SOURCE, matchProfile, neighbors, search } from "@/lib/graph";
import { findOpportunities, mergeOpportunities, Opportunity, OPPORTUNITY_KINDS, OPPORTUNITY_SCOPES } from "@/lib/opportunities";
import { MIN_QUESTIONS, profileUpdateSchema, topThree, type ProfileData } from "@/lib/profile";

// trail: nodos del grafo que el agente visitó en este turno (la ruta del chat los guarda en el perfil).
type Ctx = { userId?: string; supabase?: SupabaseClient; trail?: string[] };

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

  // --- Oportunidades reales y abiertas: becas, pasantías, empleos y cursos (Uruguay o exterior) ---
  server.registerTool(
    "search_opportunities",
    {
      description:
        "Busca oportunidades REALES y abiertas para la persona: becas, pasantías, empleos y cursos, en Uruguay (nacional) o en el exterior (internacional). Devuelve título, institución, URL verificada, fecha de cierre si figura y por qué le sirve. Usala en el cierre (al menos una vez nacional y una internacional) y cuando la persona pida oportunidades.",
      inputSchema: {
        profile: z.string().describe("Resumen breve de la persona: edad o etapa, intereses, código RIASEC, condiciones"),
        keywords: z.array(z.string()).min(1).describe("Áreas o temas, ej: ['biología', 'salud']"),
        kinds: z.array(z.enum(OPPORTUNITY_KINDS)).min(1),
        scope: z.enum(OPPORTUNITY_SCOPES),
      },
    },
    async ({ profile, keywords, kinds, scope }) => {
      const news = ctx.supabase
        ? ((await ctx.supabase.from("news").select("title,url,category").in("category", ["pasantias", "empleo", "becas"]).order("published_at", { ascending: false }).limit(25)).data ?? [])
        : [];
      const found = await findOpportunities({ profile, keywords, kinds, scope, news });
      return text(found.length ? found : "No encontré convocatorias abiertas con esos criterios. Probá con otras palabras clave o el otro alcance.");
    },
  );

  // --- Grafo de carreras (O*NET): el agente lo navega para fundamentar las recomendaciones ---
  const visit = (...ids: (string | undefined)[]) => ids.forEach((id) => id && ctx.trail?.push(id));
  const riasecShape = z.object({ R: z.number(), I: z.number(), A: z.number(), S: z.number(), E: z.number(), C: z.number() });

  server.registerTool(
    "graph_match_profile",
    {
      description:
        `Punto de entrada al grafo de carreras (923 ocupaciones reales de ${GRAPH_SOURCE.split(",")[0]}). Devuelve las ocupaciones cuyo perfil RIASEC más se parece al del usuario, con % de afinidad y preparación requerida. Pasá los puntajes RIASEC actuales (0 a 1).`,
      inputSchema: {
        riasec: riasecShape,
        max_preparation: z.number().int().min(1).max(5).optional().describe("Nivel máximo de preparación: 3 = técnico, 4 = universitaria, 5 = posgrado"),
        limit: z.number().int().min(3).max(12).optional(),
      },
    },
    async ({ riasec, max_preparation, limit }) => {
      const res = matchProfile(riasec, limit ?? 8, max_preparation);
      const top = Object.entries(riasec).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => `riasec:${k}`);
      visit(...top, ...res.slice(0, 5).map((r) => r.id));
      return text(res);
    },
  );

  server.registerTool(
    "graph_explore",
    {
      description:
        "Navega el grafo de carreras desde un nodo. Relaciones: related (ocupaciones relacionadas), knowledge (áreas de conocimiento = qué estudiar), skill (habilidades clave), interest (tipos RIASEC). Usalo para ir de una ocupación a sus vecinas y a lo que hay que estudiar.",
      inputSchema: {
        node_id: z.string().describe("Id del nodo, ej: occ:15-1252.00, know:2.C.3.a, riasec:S"),
        relation: z.enum(["related", "knowledge", "skill", "interest"]).optional(),
        limit: z.number().int().min(1).max(15).optional(),
      },
    },
    async ({ node_id, relation, limit }) => {
      const res = neighbors(node_id, relation, limit ?? 8);
      visit(node_id, ...res.slice(0, 5).map((r) => r.node.id));
      return text(res.length ? res : "Nodo sin vecinos o id inexistente. Usá graph_search o graph_match_profile para obtener ids válidos.");
    },
  );

  server.registerTool(
    "graph_search",
    {
      description: "Busca nodos del grafo de carreras por nombre (español o inglés): ocupaciones, habilidades o áreas de conocimiento.",
      inputSchema: { text: z.string(), kind: z.enum(["occupation", "skill", "knowledge", "riasec"]).optional() },
    },
    async ({ text: q, kind }) => text(search(q, kind)),
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
        opportunities: z
          .array(Opportunity)
          .optional()
          .describe("Oportunidades reales devueltas por search_opportunities (becas, pasantías, empleos, cursos), copiadas tal cual"),
      },
    },
    async ({ recommendations, opportunities }) => {
      const prev = await load();
      // Reglas duras (el prompt las pide, pero el modelo a veces se adelanta).
      const answers = prev?.question_count ?? 0;
      if (answers < MIN_QUESTIONS)
        return text(`Todavía no podés cerrar: van ${answers} respuestas y el mínimo es ${MIN_QUESTIONS}. Seguí entrevistando con offer_choices.`);
      const evidence = (prev?.data as ProfileData | undefined)?.evidence ?? [];
      if (evidence.length < 2)
        return text(`Antes de cerrar guardá al menos 2 papers de PubMed en evidence con update_profile (hay ${evidence.length}). Usá los PMID que ya encontraste con search_pubmed.`);
      const { error } = await supabase
        .from("profiles")
        .update({
          data: {
            ...(prev?.data ?? {}),
            recommendations,
            opportunities: mergeOpportunities((prev?.data as ProfileData | undefined)?.opportunities, opportunities ?? []),
          },
          status: "final",
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      return text(error ? `Error: ${error.message}` : "Perfil finalizado.");
    },
  );

  return server;
}
