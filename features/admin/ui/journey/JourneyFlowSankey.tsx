"use client";

import { useMemo, useState, type FC } from "react";
import {
  sankey,
  sankeyLinkHorizontal,
  sankeyLeft,
  type SankeyNodeMinimal,
  type SankeyLinkMinimal,
} from "d3-sankey";

export interface FlowNode {
  id: string;
  label: string;
  count: number;
  kind: string; // source | stage | outcome | drop
}
export interface FlowLink {
  source: string;
  target: string;
  value: number;
  kind: string; // source | flow | drop | outcome
}

type SNode = SankeyNodeMinimal<FlowNode, FlowLink> & FlowNode;
type SLink = SankeyLinkMinimal<FlowNode, FlowLink> & FlowLink;

const WIDTH = 1120;
const HEIGHT = 560;

// Kind → fill colour. Sources get a rotating warm/cool palette; the spine is
// indigo, the win is green, leaks are muted red.
const KIND_FILL: Record<string, string> = {
  stage: "#6366f1",
  outcome: "#10b981",
  drop: "#ef4444",
};
const SOURCE_PALETTE = [
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#f97316",
  "#6366f1",
  "#94a3b8",
];

function nodeFill(node: SNode, sourceIndex: Map<string, number>): string {
  if (node.kind === "source") {
    return SOURCE_PALETTE[(sourceIndex.get(node.id) ?? 0) % SOURCE_PALETTE.length]!;
  }
  return KIND_FILL[node.kind] ?? "#6366f1";
}

const JourneyFlowSankey: FC<{ nodes: FlowNode[]; links: FlowLink[] }> = ({ nodes, links }) => {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) return null;
    // d3-sankey mutates its inputs — pass clones.
    try {
      const generator = sankey<FlowNode, FlowLink>()
        .nodeId((d) => d.id)
        .nodeWidth(15)
        .nodePadding(16)
        .nodeAlign(sankeyLeft)
        .extent([
          [4, 8],
          [WIDTH - 4, HEIGHT - 8],
        ]);
      const graph = generator({
        nodes: nodes.map((n) => ({ ...n })),
        links: links.map((l) => ({ ...l })),
      });
      const sourceIndex = new Map<string, number>();
      let si = 0;
      for (const n of graph.nodes as SNode[]) {
        if (n.kind === "source") sourceIndex.set(n.id, si++);
      }
      return { graph, sourceIndex };
    } catch {
      return null;
    }
  }, [nodes, links]);

  const submittedCount = useMemo(
    () => nodes.find((n) => n.id === "submitted")?.count ?? 0,
    [nodes]
  );
  const biggestLeak = useMemo(() => {
    // Refunds are a terminal outcome, not an acquisition leak — exclude them.
    const drops = nodes.filter((n) => n.kind === "drop" && n.id !== "refunded");
    return drops.length ? drops.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  }, [nodes]);

  if (!layout) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-text-muted">
        No journeys in this segment yet.
      </div>
    );
  }

  const { graph, sourceIndex } = layout;
  const sNodes = graph.nodes as SNode[];
  const sLinks = graph.links as SLink[];
  const linkPath = sankeyLinkHorizontal<FlowNode, FlowLink>();
  const pct = (n: number) =>
    submittedCount > 0 ? `${Math.round((n / submittedCount) * 100)}%` : "";

  const isDim = (id: string) => hover !== null && hover !== id;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full min-w-[760px]"
        role="img"
        aria-label="User journey funnel flow diagram"
      >
        <defs>
          {sLinks.map((link, i) => {
            const s = link.source as SNode;
            const t = link.target as SNode;
            return (
              <linearGradient
                key={`grad-${i}`}
                id={`flow-grad-${i}`}
                gradientUnits="userSpaceOnUse"
                x1={s.x1}
                x2={t.x0}
              >
                <stop offset="0%" stopColor={nodeFill(s, sourceIndex)} stopOpacity={0.55} />
                <stop
                  offset="100%"
                  stopColor={nodeFill(t, sourceIndex)}
                  stopOpacity={t.kind === "drop" ? 0.5 : 0.55}
                />
              </linearGradient>
            );
          })}
        </defs>

        {/* Links */}
        <g>
          {sLinks.map((link, i) => {
            const s = link.source as SNode;
            const t = link.target as SNode;
            const dimmed = isDim(s.id) && isDim(t.id);
            return (
              <path
                key={`link-${i}`}
                d={linkPath(link) ?? undefined}
                fill="none"
                stroke={`url(#flow-grad-${i})`}
                strokeWidth={Math.max(1, link.width ?? 1)}
                strokeOpacity={dimmed ? 0.08 : link.kind === "drop" ? 0.4 : 0.75}
                strokeDasharray={link.kind === "drop" ? "2 3" : undefined}
                className="transition-opacity"
              >
                <title>
                  {s.label} → {t.label}: {link.value.toLocaleString()}
                </title>
              </path>
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {sNodes.map((node) => {
            const x0 = node.x0 ?? 0;
            const y0 = node.y0 ?? 0;
            const h = (node.y1 ?? 0) - y0;
            const w = (node.x1 ?? 0) - x0;
            const fill = nodeFill(node, sourceIndex);
            const labelLeft = x0 < WIDTH / 2;
            const dimmed = isDim(node.id);
            return (
              <g
                key={node.id}
                opacity={dimmed ? 0.35 : 1}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                className="cursor-default transition-opacity"
              >
                <rect x={x0} y={y0} width={w} height={Math.max(1, h)} rx={2.5} fill={fill}>
                  <title>
                    {node.label}: {node.count.toLocaleString()}
                    {node.kind !== "source" && submittedCount > 0
                      ? ` (${pct(node.count)} of completed)`
                      : ""}
                  </title>
                </rect>
                <text
                  x={labelLeft ? x0 - 8 : x0 + w + 8}
                  y={y0 + Math.max(1, h) / 2}
                  textAnchor={labelLeft ? "end" : "start"}
                  dominantBaseline="middle"
                  className="select-none"
                  fontSize={11.5}
                  fill={node.kind === "drop" ? "#fca5a5" : "#e2dafb"}
                >
                  <tspan fontWeight={600}>{node.label}</tspan>
                  <tspan fill="#9b94b8" fontWeight={400}>
                    {"  "}
                    {node.count.toLocaleString()}
                    {node.kind !== "source" && submittedCount > 0 ? ` · ${pct(node.count)}` : ""}
                  </tspan>
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend + biggest leak */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SOURCE_PALETTE[0] }} />
          Source
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_FILL.stage }} />
          Funnel stage
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_FILL.outcome }} />
          Retained
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_FILL.drop }} />
          Drop-off
        </span>
        {biggestLeak && biggestLeak.count > 0 && (
          <span className="ml-auto rounded-full bg-red-500/15 px-3 py-1 font-medium text-red-300">
            Biggest leak: {biggestLeak.label} ({biggestLeak.count.toLocaleString()})
          </span>
        )}
      </div>
    </div>
  );
};

export default JourneyFlowSankey;
