import { useRef, useEffect, useState, useCallback } from "react";
import { useWikiStore } from "../../stores/wiki";
import { WikiPage, WikiEntityType } from "../../types";

const ENTITY_COLORS: Record<WikiEntityType, string> = {
  person: "#3b82f6",
  project: "#22c55e",
  decision: "#f97316",
  meeting: "#a855f7",
  concept: "#14b8a6",
  general: "#6b7280",
};

interface Node {
  id: string;
  title: string;
  entityType: WikiEntityType;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Edge {
  from: string;
  to: string;
}

function buildGraph(pages: WikiPage[]): { nodes: Node[]; edges: Edge[] } {
  const titleToId = new Map(pages.map((p) => [p.title.toLowerCase(), p.id]));

  const nodes: Node[] = pages.map((p) => ({
    id: p.id,
    title: p.title,
    entityType: p.entityType,
    x: Math.random() * 700 + 50,
    y: Math.random() * 500 + 50,
    vx: 0,
    vy: 0,
  }));

  const edgeSet = new Set<string>();
  const edges: Edge[] = [];
  for (const page of pages) {
    const refs = page.content.match(/\[\[([^\]]+)\]\]/g) ?? [];
    for (const ref of refs) {
      const target = ref.slice(2, -2);
      const targetId = titleToId.get(target.toLowerCase());
      if (targetId && targetId !== page.id) {
        const key = [page.id, targetId].sort().join("--");
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ from: page.id, to: targetId });
        }
      }
    }
  }
  return { nodes, edges };
}

function runSimulation(nodes: Node[], edges: Edge[], iterations = 200) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const W = 800, H = 560;
  const REPULSION = 4000;
  const SPRING_LENGTH = 120;
  const SPRING_K = 0.05;
  const DAMPING = 0.85;
  const CENTER_K = 0.01;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy || 1;
        const dist = Math.sqrt(dist2);
        const f = REPULSION / dist2;
        a.vx += f * dx / dist; a.vy += f * dy / dist;
        b.vx -= f * dx / dist; b.vy -= f * dy / dist;
      }
    }

    // Spring attraction
    for (const edge of edges) {
      const a = nodeMap.get(edge.from), b = nodeMap.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (dist - SPRING_LENGTH) * SPRING_K;
      a.vx += f * dx / dist; a.vy += f * dy / dist;
      b.vx -= f * dx / dist; b.vy -= f * dy / dist;
    }

    // Center gravity + damping + position update
    const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    for (const n of nodes) {
      n.vx += (W / 2 - cx) * CENTER_K;
      n.vy += (H / 2 - cy) * CENTER_K;
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x = Math.max(30, Math.min(W - 30, n.x + n.vx));
      n.y = Math.max(30, Math.min(H - 30, n.y + n.vy));
    }
  }
  return nodes;
}

interface WikiGraphProps {
  onSelect?: () => void;
}

export function WikiGraph({ onSelect }: WikiGraphProps = {}) {
  const { pages, setActive } = useWikiStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (pages.length === 0) return;
    const { nodes: n, edges: e } = buildGraph(pages);
    const simulated = runSimulation(n, e);
    setNodes([...simulated]);
    setEdges(e);
  }, [pages]);

  const handleClick = useCallback((id: string) => {
    setActive(id);
    onSelect?.();
  }, [setActive, onSelect]);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  if (pages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
        <p className="text-sm">No wiki pages yet — ingest some notes first.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
      <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 800 560" className="w-full h-full">
        {/* Edges */}
        {edges.map((e, i) => {
          const a = nodeMap.get(e.from), b = nodeMap.get(e.to);
          if (!a || !b) return null;
          return (
            <line
              key={i}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#d1d5db" strokeWidth="1.5" opacity="0.6"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const color = ENTITY_COLORS[node.entityType];
          const isHovered = hovered === node.id;
          const r = isHovered ? 9 : 7;
          return (
            <g
              key={node.id}
              className="cursor-pointer"
              onClick={() => handleClick(node.id)}
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle cx={node.x} cy={node.y} r={r + 4} fill="transparent" />
              <circle
                cx={node.x} cy={node.y} r={r}
                fill={color}
                opacity={isHovered ? 1 : 0.8}
                stroke="white" strokeWidth="1.5"
              />
              <text
                x={node.x} y={node.y + r + 12}
                textAnchor="middle"
                fontSize="10"
                fill={isHovered ? "#111827" : "#6b7280"}
                fontWeight={isHovered ? "600" : "400"}
                className="pointer-events-none select-none"
              >
                {node.title.length > 18 ? node.title.slice(0, 16) + "…" : node.title}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 bg-white dark:bg-gray-800/90 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
        {(Object.entries(ENTITY_COLORS) as [WikiEntityType, string][]).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-500 dark:text-gray-300">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}
