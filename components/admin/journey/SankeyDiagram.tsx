"use client";

import { useMemo, useState } from "react";

interface SankeyNode {
  id: string;
  label: string;
  count: number;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyDiagramProps {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

const COLORS = [
  "rgba(99, 102, 241, 0.7)", // blue - acquisition
  "rgba(156, 125, 255, 0.7)", // purple - survey
  "rgba(156, 125, 255, 0.6)",
  "rgba(16, 185, 129, 0.7)", // green - report
  "rgba(16, 185, 129, 0.6)",
  "rgba(245, 158, 11, 0.7)", // amber - sharing
];

export default function SankeyDiagram({ nodes, links }: SankeyDiagramProps) {
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);

  const layout = useMemo(() => {
    if (nodes.length === 0) return { nodePositions: [], linkPaths: [], width: 0, height: 0 };

    const width = 800;
    const height = 300;
    const nodeWidth = 20;
    const padding = 40;
    const usableWidth = width - padding * 2;
    const usableHeight = height - padding * 2;
    const maxCount = Math.max(...nodes.map((n) => n.count), 1);

    // Position nodes left-to-right
    const step = nodes.length > 1 ? usableWidth / (nodes.length - 1) : 0;
    const nodePositions = nodes.map((node, i) => {
      const barHeight = Math.max(20, (node.count / maxCount) * usableHeight);
      return {
        ...node,
        x: padding + i * step,
        y: padding + (usableHeight - barHeight) / 2,
        width: nodeWidth,
        height: barHeight,
        color: COLORS[i % COLORS.length],
      };
    });

    // Build link paths as curved SVG
    const nodeMap = new Map(nodePositions.map((n) => [n.id, n]));
    const linkPaths = links.map((link, i) => {
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) return { path: "", value: 0, pct: "0", color: "transparent" };

      const linkHeight = Math.max(4, (link.value / maxCount) * usableHeight * 0.8);
      const x0 = source.x + source.width;
      const y0 = source.y + source.height / 2 - linkHeight / 2;
      const x1 = target.x;
      const y1 = target.y + target.height / 2 - linkHeight / 2;
      const cx = (x0 + x1) / 2;

      const path = `M${x0},${y0} C${cx},${y0} ${cx},${y1} ${x1},${y1} L${x1},${y1 + linkHeight} C${cx},${y1 + linkHeight} ${cx},${y0 + linkHeight} ${x0},${y0 + linkHeight} Z`;
      const sourceCount = source.count || 1;
      const pct = ((link.value / sourceCount) * 100).toFixed(0);

      return { path, value: link.value, pct, color: COLORS[(i + 1) % COLORS.length] };
    });

    return { nodePositions, linkPaths, width, height };
  }, [nodes, links]);

  if (nodes.length === 0) {
    return <p className="text-sm text-text-muted">No journey data available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full"
        style={{ minWidth: 600 }}
      >
        {/* Links */}
        {layout.linkPaths.map((link, i) => (
          <path
            key={i}
            d={link.path}
            fill={link.color}
            opacity={hoveredLink === null || hoveredLink === i ? 0.6 : 0.15}
            onMouseEnter={() => setHoveredLink(i)}
            onMouseLeave={() => setHoveredLink(null)}
            className="cursor-default transition-opacity"
          />
        ))}

        {/* Nodes */}
        {layout.nodePositions.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={4}
              fill={node.color}
            />
            <text
              x={node.x + node.width / 2}
              y={node.y - 8}
              textAnchor="middle"
              className="fill-current text-[10px] text-text-muted"
            >
              {node.label}
            </text>
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height + 14}
              textAnchor="middle"
              className="fill-current text-[11px] font-medium text-text-primary"
            >
              {node.count}
            </text>
          </g>
        ))}

        {/* Link labels on hover */}
        {hoveredLink !== null && layout.linkPaths[hoveredLink] && (
          <text
            x={layout.width / 2}
            y={layout.height - 5}
            textAnchor="middle"
            className="fill-current text-xs text-text-primary"
          >
            {layout.linkPaths[hoveredLink].value} users ({layout.linkPaths[hoveredLink].pct}%)
          </text>
        )}
      </svg>
    </div>
  );
}
