"use client";

import BarChart from "@features/admin/ui/BarChart";
import type { BreakdownRow } from "@features/admin/server/explorer";
import {
  ANSWER_GROUP_OPTIONS,
  DIMENSION_GROUP_OPTIONS,
  tokenLabel,
} from "@features/admin/ui/explorer/dimensions";

export type BreakdownMetric = "count" | "paid" | "conversion" | "revenue";

// Groups smaller than this are statistically noisy — dim them + footnote so a
// 3-person country isn't read as a real signal.
const SMALL_SAMPLE = 30;

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
  groupBy: string;
  onGroupByChange: (token: string) => void;
  metric: BreakdownMetric;
  onMetricChange: (metric: BreakdownMetric) => void;
  rows: BreakdownRow[];
  /** Overall conversion % across the filtered set, for the "vs avg" index. */
  overallConversion: number | null;
}

export default function ExplorerBreakdown({
  groupBy,
  onGroupByChange,
  metric,
  onMetricChange,
  rows,
  overallConversion,
}: Props) {
  const chartItems = rows.map((r) => ({ label: r.label, value: metricValue(r, metric) }));
  const hasSmall = rows.some((r) => r.count > 0 && r.count < SMALL_SAMPLE);

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Break down by</span>
          <select
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value)}
            className="max-w-[220px] truncate rounded-lg border border-white/10 bg-[#1a1025] px-3 py-1.5 text-sm text-text-primary outline-none"
          >
            <optgroup label="Dimensions">
              {DIMENSION_GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Survey answers">
              {ANSWER_GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
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
                  <th className="px-2 py-2 font-medium">{tokenLabel(groupBy)}</th>
                  <th className="px-2 py-2 text-right font-medium">Submissions</th>
                  <th className="px-2 py-2 text-right font-medium">Paid</th>
                  <th className="px-2 py-2 text-right font-medium">Conv. %</th>
                  <th className="px-2 py-2 text-right font-medium">vs avg</th>
                  <th className="px-2 py-2 text-right font-medium">Revenue €</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const small = r.count > 0 && r.count < SMALL_SAMPLE;
                  const index =
                    overallConversion && overallConversion > 0 && r.paidPct != null
                      ? r.paidPct / overallConversion
                      : null;
                  return (
                    <tr
                      key={r.label}
                      className={`border-b border-white/5 ${small ? "opacity-50" : ""}`}
                    >
                      <td className="px-2 py-2 text-text-primary">
                        {r.label}
                        {small && <span title={`n < ${SMALL_SAMPLE}`}> *</span>}
                      </td>
                      <td className="px-2 py-2 text-right text-text-primary">{r.count}</td>
                      <td className="px-2 py-2 text-right text-text-muted">{r.paid}</td>
                      <td className="px-2 py-2 text-right text-text-muted">
                        {r.paidPct == null ? "—" : `${r.paidPct}%`}
                      </td>
                      <td
                        className={`px-2 py-2 text-right ${
                          index == null
                            ? "text-text-muted"
                            : index >= 1.1
                              ? "text-emerald-400"
                              : index <= 0.9
                                ? "text-red-400"
                                : "text-text-muted"
                        }`}
                      >
                        {index == null ? "—" : `${index.toFixed(1)}×`}
                      </td>
                      <td className="px-2 py-2 text-right text-text-muted">
                        {r.revenue.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasSmall && (
            <p className="mt-2 text-xs text-text-muted">
              * fewer than {SMALL_SAMPLE} submissions — treat as directional. “vs avg” = this
              group’s conversion ÷ the overall conversion for the current filters.
            </p>
          )}
        </>
      )}
    </div>
  );
}
