"use client";

import BarChart from "@features/admin/ui/BarChart";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  isDimensionKey,
  type BreakdownRow,
  type DimensionKey,
} from "@features/admin/server/explorer";

export type BreakdownMetric = "count" | "paid" | "conversion" | "revenue";

const METRICS: Array<{ key: BreakdownMetric; label: string }> = [
  { key: "count", label: "Submissions" },
  { key: "paid", label: "Paid" },
  { key: "conversion", label: "Conversion %" },
  { key: "revenue", label: "Revenue €" },
];

function metricValue(row: BreakdownRow, metric: BreakdownMetric): number {
  switch (metric) {
    case "count":
      return row.count;
    case "paid":
      return row.paid;
    case "conversion":
      return row.paidPct ?? 0;
    case "revenue":
      return row.revenue;
  }
}

interface Props {
  groupBy: DimensionKey;
  onGroupByChange: (dim: DimensionKey) => void;
  metric: BreakdownMetric;
  onMetricChange: (metric: BreakdownMetric) => void;
  rows: BreakdownRow[];
}

export default function ExplorerBreakdown({
  groupBy,
  onGroupByChange,
  metric,
  onMetricChange,
  rows,
}: Props) {
  const chartItems = rows.map((r) => ({ label: r.label, value: metricValue(r, metric) }));

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Break down by</span>
          <select
            value={groupBy}
            onChange={(e) => {
              if (isDimensionKey(e.target.value)) onGroupByChange(e.target.value);
            }}
            className="rounded-lg border border-white/10 bg-[#1a1025] px-3 py-1.5 text-sm text-text-primary outline-none"
          >
            {DIMENSION_KEYS.map((dim) => (
              <option key={dim} value={dim}>
                {DIMENSION_LABELS[dim]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onMetricChange(m.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                metric === m.key
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No data for these filters.</p>
      ) : (
        <>
          <BarChart items={chartItems} direction="horizontal" />

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-2 py-2 font-medium">{DIMENSION_LABELS[groupBy]}</th>
                  <th className="px-2 py-2 text-right font-medium">Submissions</th>
                  <th className="px-2 py-2 text-right font-medium">Paid</th>
                  <th className="px-2 py-2 text-right font-medium">Conv. %</th>
                  <th className="px-2 py-2 text-right font-medium">Revenue €</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-white/5">
                    <td className="px-2 py-2 text-text-primary">{r.label}</td>
                    <td className="px-2 py-2 text-right text-text-primary">{r.count}</td>
                    <td className="px-2 py-2 text-right text-text-muted">{r.paid}</td>
                    <td className="px-2 py-2 text-right text-text-muted">
                      {r.paidPct == null ? "—" : `${r.paidPct}%`}
                    </td>
                    <td className="px-2 py-2 text-right text-text-muted">
                      {r.revenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
