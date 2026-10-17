import { RIASEC_KEYS, RIASEC_LABELS, type RiasecKey } from "@/lib/profile";
import graphData from "@/data/career-graph.json";

/**
 * Grafo de carreras (O*NET 31.0, CC BY 4.0): ocupaciones, tipos RIASEC, habilidades y áreas de
 * conocimiento. El agente lo navega con herramientas MCP para fundamentar sus recomendaciones.
 */
export type NodeKind = "riasec" | "occupation" | "skill" | "knowledge";
export type Relation = "interest" | "skill" | "knowledge" | "related";
export type GraphNode = {
  id: string;
  kind: NodeKind;
  name: string;
  en: string;
  description?: string;
  riasec?: Record<string, number>;
  zone?: number | null;
};
export type GraphEdge = { from: string; to: string; rel: Relation; w: number };
export type CareerGraph = { source: string; nodes: GraphNode[]; edges: GraphEdge[] };

const graph = graphData as CareerGraph;
const byId = new Map(graph.nodes.map((n) => [n.id, n]));
const adjacency = new Map<string, GraphEdge[]>();
for (const e of graph.edges) {
  for (const [a, b] of [
    [e.from, e.to],
    [e.to, e.from],
  ]) {
    const list = adjacency.get(a) ?? [];
    list.push({ ...e, from: a, to: b });
    adjacency.set(a, list);
  }
}

export const GRAPH_SOURCE = graph.source;
export const ZONE_LABELS: Record<number, string> = {
  1: "poca preparación",
  2: "algo de preparación (secundaria o curso corto)",
  3: "preparación media (técnico, tecnicatura o experiencia)",
  4: "preparación considerable (carrera universitaria)",
  5: "preparación extensa (posgrado)",
};

export const getNode = (id: string) => byId.get(id);

/** Resumen compacto de un nodo para el agente. */
export function describe(n: GraphNode) {
  return {
    id: n.id,
    kind: n.kind,
    name: n.name,
    ...(n.kind === "occupation"
      ? { en: n.en, description: n.description?.slice(0, 220), preparation: n.zone ? ZONE_LABELS[n.zone] : undefined }
      : {}),
    ...(n.kind === "riasec" ? { label: RIASEC_LABELS[n.name as RiasecKey] } : {}),
  };
}

/** Ocupaciones más afines a un perfil RIASEC (similitud coseno con el vector de cada ocupación). */
export function matchProfile(profile: Record<string, number>, limit = 8, maxZone?: number) {
  const p = RIASEC_KEYS.map((k) => profile[k] ?? 0);
  const pn = Math.hypot(...p) || 1;
  return graph.nodes
    .filter((n) => n.kind === "occupation" && (!maxZone || (n.zone ?? 5) <= maxZone))
    .map((n) => {
      const o = RIASEC_KEYS.map((k) => n.riasec![k] ?? 0);
      const sim = o.reduce((a, v, i) => a + v * p[i], 0) / (pn * (Math.hypot(...o) || 1));
      return { ...describe(n), match: Math.round(sim * 100) };
    })
    .sort((a, b) => b.match - a.match)
    .slice(0, limit);
}

/** Vecinos de un nodo, opcionalmente filtrados por relación, ordenados por peso. */
export function neighbors(id: string, rel?: Relation, limit = 10) {
  return (adjacency.get(id) ?? [])
    .filter((e) => !rel || e.rel === rel)
    .sort((a, b) => b.w - a.w)
    .slice(0, limit)
    .map((e) => ({ rel: e.rel, weight: e.w, node: describe(byId.get(e.to)!) }));
}

/** Búsqueda de nodos por nombre (español o inglés). */
export function search(text: string, kind?: NodeKind, limit = 10) {
  const q = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  return graph.nodes
    .filter((n) => (!kind || n.kind === kind) && (norm(n.name).includes(q) || norm(n.en).includes(q)))
    .slice(0, limit)
    .map(describe);
}

/** Aristas entre un conjunto de nodos (para dibujar el recorrido del agente). */
export function subgraph(ids: string[]) {
  const set = new Set(ids);
  const nodes = ids.map((id) => byId.get(id)).filter((n): n is GraphNode => Boolean(n));
  const edges = graph.edges.filter((e) => set.has(e.from) && set.has(e.to));
  return { nodes, edges };
}
