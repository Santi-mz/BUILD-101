import { GRAPH_SOURCE, subgraph, type GraphNode, type NodeKind } from "@/lib/graph";
import { RIASEC_LABELS, type RiasecKey } from "@/lib/profile";

// Columnas del dibujo: el recorrido va de tus intereses a ocupaciones, y de ahí a qué estudiar y qué habilidades hacen falta.
const COLUMNS: { kind: NodeKind; title: string; max: number }[] = [
  { kind: "riasec", title: "Tus intereses", max: 3 },
  { kind: "occupation", title: "Ocupaciones que recorrió", max: 7 },
  { kind: "knowledge", title: "Qué estudiar", max: 6 },
  { kind: "skill", title: "Habilidades clave", max: 4 },
];
const W = 960;
const COL_X = [20, 250, 560, 790];
const COL_W = [150, 250, 190, 150];
const ROW_H = 46;
const TOP = 44;

const label = (n: GraphNode) => (n.kind === "riasec" ? RIASEC_LABELS[n.name as RiasecKey] : n.name);
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Dibuja el subgrafo de carreras que navegó el agente (nodos visitados y las aristas entre ellos). */
export default function CareerMap({ ids }: { ids: string[] }) {
  const { nodes, edges } = subgraph(ids);
  const placed = new Map<string, { x: number; y: number; w: number }>();
  const columns = COLUMNS.map((c, ci) => {
    const list = nodes.filter((n) => n.kind === c.kind).slice(0, c.max);
    list.forEach((n, i) => placed.set(n.id, { x: COL_X[ci], y: TOP + i * ROW_H, w: COL_W[ci] }));
    return { ...c, list };
  });
  const height = TOP + Math.max(...columns.map((c) => c.list.length), 1) * ROW_H + 10;
  // Solo las conexiones más fuertes, para que se lea: cada ocupación a su interés principal y a sus 2
  // áreas de estudio más importantes; cada habilidad a su ocupación más fuerte; 1 relación por ocupación.
  const visible = edges.filter((e) => placed.has(e.from) && placed.has(e.to));
  const strongest = (rel: string, key: "from" | "to", per: number) => {
    const groups = new Map<string, typeof visible>();
    for (const e of visible.filter((x) => x.rel === rel)) groups.set(e[key], [...(groups.get(e[key]) ?? []), e]);
    return [...groups.values()].flatMap((g) => g.sort((a, b) => b.w - a.w).slice(0, per));
  };
  const lines = [
    ...strongest("interest", "from", 1),
    ...strongest("knowledge", "from", 2),
    ...strongest("skill", "to", 1),
    ...strongest("related", "from", 1),
  ];
  if (!columns[1].list.length) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">Cómo llegó el agente a tus recomendaciones</h2>
      <p className="mt-1 text-sm text-muted">
        El agente navegó un grafo de 923 ocupaciones reales: partió de tus intereses, encontró ocupaciones con un perfil
        parecido y siguió sus conexiones hasta qué estudiar y qué habilidades hacen falta.
      </p>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${height}`} className="min-w-[640px]" role="img" aria-label="Recorrido del agente por el grafo de carreras">
          {columns.map((c, ci) => (
            <text key={c.kind} x={COL_X[ci]} y={18} className="fill-[var(--muted)] text-[13px]">
              {c.title}
            </text>
          ))}
          {lines.map((e, i) => {
            const a = placed.get(e.from)!;
            const b = placed.get(e.to)!;
            const [l, r] = a.x < b.x ? [a, b] : [b, a];
            const x1 = l.x + l.w;
            const y1 = l.y + 16;
            const x2 = r.x;
            const y2 = r.y + 16;
            const same = a.x === b.x;
            const d = same
              ? `M ${a.x + a.w} ${a.y + 16} C ${a.x + a.w + 40} ${a.y + 16}, ${b.x + b.w + 40} ${b.y + 16}, ${b.x + b.w} ${b.y + 16}`
              : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
            return <path key={i} d={d} fill="none" stroke="var(--accent)" strokeOpacity={e.rel === "related" ? 0.35 : 0.55} strokeWidth={1.5} strokeDasharray={e.rel === "related" ? "4 4" : undefined} />;
          })}
          {columns.flatMap((c) =>
            c.list.map((n) => {
              const p = placed.get(n.id)!;
              return (
                <g key={n.id}>
                  <title>{n.kind === "occupation" ? `${n.name} (${n.en})` : label(n)}</title>
                  <rect x={p.x} y={p.y} width={p.w} height={32} rx={10} fill={c.kind === "occupation" ? "var(--accent-soft)" : "var(--background)"} stroke="var(--border)" />
                  <text x={p.x + 10} y={p.y + 21} className="fill-[var(--foreground)] text-[13px]">
                    {clip(label(n), Math.floor(p.w / 7.2))}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      <p className="mt-3 text-xs text-muted">Fuente: {GRAPH_SOURCE}</p>
    </section>
  );
}
