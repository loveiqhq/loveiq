"use client";

import { useMemo, useRef, useState, type FC } from "react";
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

interface Tip {
  x: number;
  y: number;
  title: string;
  detail: string;
}

const JourneyFlowSankey: FC<{
  nodes: FlowNode[];
  links: FlowLink[];
  /** SVG viewBox height — compact multi-band layouts pass ~240. */
  height?: number;
  nodeWidth?: number;
  labelSize?: number;
  /** Show the legend + biggest-leak footer (off for stacked bands). */
  showLegend?: boolean;
  /** Draw the conversion % / −drop count on each link (off by default). */
  showLinkLabels?: boolean;
}> = ({
  nodes,
  links,
  height = 560,
  nodeWidth = 15,
  labelSize = 11.5,
  showLegend = true,
  showLinkLabels = false,
}) => {
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    if (nodes.length === 0 || links.length === 0) return null;
    // d3-sankey mutates its inputs — pass clones.
    try {
      const generator = sankey<FlowNode, FlowLink>()
        .nodeId((d) => d.id)
        .nodeWidth(nodeWidth)
        .nodePadding(Math.max(8, Math.round(height / 35)))
        .nodeAlign(sankeyLeft)
        .extent([
          [4, 8],
          [WIDTH - 4, height - 8],
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
  }, [nodes, links, height, nodeWidth]);

  // % base = the band's entry volume (largest spine/outcome stage — counts are
  // monotone within a band, so this is the first stage's count).
  const baseCount = useMemo(
    () =>
      nodes.reduce(
        (max, n) => (n.kind !== "source" && n.kind !== "drop" && n.count > max ? n.count : max),
        0
      ),
    [nodes]
  );
  const biggestLeak = useMemo(() => {
    const drops = nodes.filter((n) => n.kind === "drop" && !n.id.endsWith("refunded"));
    return drops.length ? drops.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  }, [nodes]);

  const moveTip = (e: React.MouseEvent, title: string, detail: string) => {
    const rect = outerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, title, detail });
  };

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
  const pct = (n: number) => (baseCount > 0 ? `${Math.round((n / baseCount) * 100)}%` : "");
  const ratio = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  const isDim = (id: string) => hover !== null && hover !== id;

  return (
    <div className="relative" ref={outerRef}>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="h-auto w-full min-w-[760px]"
          role="img"
          aria-label="User journey funnel flow diagram"
          onMouseLeave={() => setTip(null)}
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
              const isDrop = link.kind === "drop";
              // Drop links heat by severity (share of source volume).
              const severity = s.count > 0 ? link.value / s.count : 0;
              const baseOpacity = isDrop ? 0.3 + Math.min(0.45, severity * 0.6) : 0.75;
              const detail = isDrop
                ? `${link.value.toLocaleString()} lost · ${ratio(link.value, s.count)} of ${s.label}`
                : `${link.value.toLocaleString()} · ${ratio(link.value, s.count)} of ${s.label}`;
              return (
                <path
                  key={`link-${i}`}
                  d={linkPath(link) ?? undefined}
                  fill="none"
                  stroke={`url(#flow-grad-${i})`}
                  strokeWidth={Math.max(1, link.width ?? 1)}
                  strokeOpacity={dimmed ? 0.08 : baseOpacity}
                  strokeDasharray={isDrop ? "2 3" : undefined}
                  className="transition-opacity"
                  onMouseMove={(e) => moveTip(e, `${s.label} → ${t.label}`, detail)}
                  onMouseLeave={() => setTip(null)}
                >
                  <title>
                    {s.label} → {t.label}: {link.value.toLocaleString()}
                  </title>
                </path>
              );
            })}
          </g>

          {/* Per-link labels (conversion % / −drop), only on links thick enough */}
          {showLinkLabels && (
            <g>
              {sLinks.map((link, i) => {
                const s = link.source as SNode;
                const t = link.target as SNode;
                if ((link.width ?? 0) < 11) return null;
                if (isDim(s.id) && isDim(t.id)) return null;
                const mx = ((s.x1 ?? 0) + (t.x0 ?? 0)) / 2;
                const my = ((link.y0 ?? 0) + (link.y1 ?? 0)) / 2;
                const isDrop = link.kind === "drop";
                const text = isDrop
                  ? `−${link.value.toLocaleString()}`
                  : s.count > 0
                    ? `${Math.round((link.value / s.count) * 100)}%`
                    : "";
                if (!text) return null;
                return (
                  <text
                    key={`ll-${i}`}
                    x={mx}
                    y={my}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(labelSize, 10.5)}
                    fontWeight={600}
                    fill={isDrop ? "#fecaca" : "#c7d2fe"}
                    className="pointer-events-none select-none"
                    style={{ paintOrder: "stroke", stroke: "#0b0613", strokeWidth: 2.5 }}
                  >
                    {text}
                  </text>
                );
              })}
            </g>
          )}

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
              const detail =
                node.kind === "source" || baseCount === 0
                  ? node.count.toLocaleString()
                  : `${node.count.toLocaleString()} · ${pct(node.count)} of band entry`;
              return (
                <g
                  key={node.id}
                  opacity={dimmed ? 0.35 : 1}
                  onMouseEnter={() => setHover(node.id)}
                  onMouseLeave={() => {
                    setHover(null);
                    setTip(null);
                  }}
                  onMouseMove={(e) => moveTip(e, node.label, detail)}
                  className="cursor-default transition-opacity"
                >
                  <rect x={x0} y={y0} width={w} height={Math.max(1, h)} rx={2.5} fill={fill}>
                    <title>
                      {node.label}: {node.count.toLocaleString()}
                      {node.kind !== "source" && baseCount > 0
                        ? ` (${pct(node.count)} of band entry)`
                        : ""}
                    </title>
                  </rect>
                  <text
                    x={labelLeft ? x0 - 8 : x0 + w + 8}
                    y={y0 + Math.max(1, h) / 2}
                    textAnchor={labelLeft ? "end" : "start"}
                    dominantBaseline="middle"
                    className="select-none"
                    fontSize={labelSize}
                    fill={node.kind === "drop" ? "#fca5a5" : "#e2dafb"}
                  >
                    <tspan fontWeight={600}>{node.label}</tspan>
                    <tspan fill="#9b94b8" fontWeight={400}>
                      {"  "}
                      {node.count.toLocaleString()}
                      {node.kind !== "source" && baseCount > 0 ? ` · ${pct(node.count)}` : ""}
                    </tspan>
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Cursor-following tooltip */}
      {tip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg border border-white/15 bg-[#16101f] px-3 py-2 text-xs shadow-xl"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          <p className="font-semibold text-text-primary">{tip.title}</p>
          <p className="text-text-muted">{tip.detail}</p>
        </div>
      )}

      {/* Legend + biggest leak */}
      {showLegend && (
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
      )}
    </div>
  );
};

export default JourneyFlowSankey;
