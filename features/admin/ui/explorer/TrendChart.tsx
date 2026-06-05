"use client";

export interface TrendPoint {
  bucket: string;
  count: number;
  paid: number;
}

interface Props {
  points: TrendPoint[];
  granularity: "day" | "week";
}

const W = 720;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 22, left: 28 };

function pathFor(points: TrendPoint[], pick: (p: TrendPoint) => number, max: number): string {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = points.length;
  return points
    .map((p, i) => {
      const x = PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
      const y = PAD.top + innerH - (max <= 0 ? 0 : (pick(p) / max) * innerH);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function TrendChart({ points, granularity }: Props) {
  if (points.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Trend over time</h2>
        <p className="py-6 text-center text-sm text-text-muted">No data for these filters.</p>
      </div>
    );
  }

  const max = Math.max(1, ...points.map((p) => p.count));
  const first = points[0]!.bucket;
  const last = points[points.length - 1]!.bucket;
  const totalCount = points.reduce((a, p) => a + p.count, 0);
  const totalPaid = points.reduce((a, p) => a + p.paid, 0);

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">
          Trend over time <span className="text-text-muted">({granularity})</span>
        </h2>
        <div className="flex gap-4 text-xs text-text-muted">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent-purple align-middle" />
            Submissions {totalCount.toLocaleString()}
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent-orange align-middle" />
            Paid {totalPaid.toLocaleString()}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trend over time">
        <line
          x1={PAD.left}
          y1={H - PAD.bottom}
          x2={W - PAD.right}
          y2={H - PAD.bottom}
          stroke="rgba(255,255,255,0.1)"
        />
        <text x={PAD.left} y={H - 6} className="fill-text-muted" fontSize="10">
          {first}
        </text>
        <text
          x={W - PAD.right}
          y={H - 6}
          textAnchor="end"
          className="fill-text-muted"
          fontSize="10"
        >
          {last}
        </text>
        <text
          x={PAD.left - 4}
          y={PAD.top + 4}
          textAnchor="end"
          className="fill-text-muted"
          fontSize="10"
        >
          {max}
        </text>
        <path
          d={pathFor(points, (p) => p.count, max)}
          fill="none"
          stroke="#9c7dff"
          strokeWidth="2"
        />
        <path
          d={pathFor(points, (p) => p.paid, max)}
          fill="none"
          stroke="#f26d4f"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}
