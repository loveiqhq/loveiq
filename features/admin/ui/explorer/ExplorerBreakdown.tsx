"use client";

import { useState } from "react";
import BarChart, { type BarSeries } from "@features/admin/ui/BarChart";
import type { BreakdownRow } from "@features/admin/server/explorer";
import {
  ANSWER_GROUP_OPTIONS,
  DIMENSION_GROUP_OPTIONS,
  SCALE_GROUP_OPTIONS,
  isMultiToken,
  isScaleToken,
  tokenLabel,
} from "@features/admin/ui/explorer/dimensions";
import type { ScaleSummary } from "@features/admin/server/explorer";

export type BreakdownMetric = "count" | "paid" | "conversion" | "revenue";

// Groups smaller than this are statistically noisy — dim them + footnote so a
// 3-person country isn't read as a real signal.
const SMALL_SAMPLE = 30;

// Survey gender options collapse server-side to these three buckets.
const GENDER_ORDER = ["Women", "Men", "Other"] as const;

function genderColor(key: string): string {
  if (key === "Women") return "bg-accent-purple";
  if (key === "Men") return "bg-accent-orange";
  return "bg-white/20";
}

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

/** "42.0% (120)" — distribution share with the raw count for context. */
function formatShare(sharePct: number, count: number): string {
  // Defensive against a stale/partial payload — never let a missing number crash render.
  return `${(sharePct ?? 0).toFixed(1)}% (${(count ?? 0).toLocaleString()})`;
}

interface Props {
  groupBy: string;
  onGroupByChange: (token: string) => void;
  metric: BreakdownMetric;
  onMetricChange: (metric: BreakdownMetric) => void;
  rows: BreakdownRow[];
  /** Overall conversion % across the filtered set, for the "vs avg" index. */
  overallConversion: number | null;
  /** Set when grouping by a 1-7 scale question — drives the histogram + average. */
  scaleSummary?: ScaleSummary | null;
}

export default function ExplorerBreakdown({
  groupBy,
  onGroupByChange,
  metric,
  onMetricChange,
  rows,
  overallConversion,
  scaleSummary,
}: Props) {
  // The strategy lead always wants the gender split, so default it ON. It's a
  // view preference (the data is already in every row), not a server filter.
  const [genderSplit, setGenderSplit] = useState(true);

  const isScale = isScaleToken(groupBy);
  const isMulti = isMultiToken(groupBy);
  // Scale group-bys exclude the "Unknown" (unanswered) bucket from the chart so
  // the 1→7 distribution reads cleanly; the table below still lists every row.
  const chartRows = isScale ? rows.filter((r) => r.label !== "Unknown") : rows;
  const hasSmall = rows.some((r) => r.count > 0 && r.count < SMALL_SAMPLE);

  // % distribution + gender split only make sense on the "Submissions" metric.
  const showShare = metric === "count";
  const useGenderSplit = showShare && genderSplit;

  // Build the gender series from whatever buckets actually appear, in a stable
  // order, and the per-gender totals (denominator for the within-gender %).
  const presentGenders = useGenderSplit
    ? GENDER_ORDER.filter((g) => chartRows.some((r) => (r.byGender?.[g]?.count ?? 0) > 0))
    : [];
  const genderTotals = new Map<string, number>();
  for (const g of presentGenders) {
    genderTotals.set(
      g,
      chartRows.reduce((sum, r) => sum + (r.byGender?.[g]?.count ?? 0), 0)
    );
  }
  const genderSeries: BarSeries[] = presentGenders.map((g) => ({
    key: g,
    label: g,
    color: genderColor(g),
  }));

  const chartItems = chartRows.map((r) => {
    if (useGenderSplit && genderSeries.length > 0) {
      const seriesData: Record<string, number> = {};
      for (const g of presentGenders) {
        const total = genderTotals.get(g) ?? 0;
        const c = r.byGender?.[g]?.count ?? 0;
        seriesData[g] = total > 0 ? Math.round((c / total) * 1000) / 10 : 0;
      }
      return {
        label: r.label,
        value: r.count,
        display: formatShare(r.sharePct, r.count),
        seriesData,
      };
    }
    if (showShare) {
      return { label: r.label, value: r.count, display: formatShare(r.sharePct, r.count) };
    }
    return { label: r.label, value: metricValue(r, metric) };
  });

  // Gender data can be sparse (the question is optional); warn rather than mislead.
  const knownGender = (genderTotals.get("Women") ?? 0) + (genderTotals.get("Men") ?? 0);
  const allGender = knownGender + (genderTotals.get("Other") ?? 0);
  const genderSparse =
    useGenderSplit && genderSeries.length > 0 && allGender > 0 && knownGender < 0.3 * allGender;

  const renderSeries = useGenderSplit && genderSeries.length > 0 ? genderSeries : undefined;

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
            <optgroup label="Scale questions (1–7)">
              {SCALE_GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div className="flex items-center gap-3">
          {showShare && (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={genderSplit}
                onChange={(e) => setGenderSplit(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent-purple"
              />
              Gender split
            </label>
          )}
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
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-muted">No data for these filters.</p>
      ) : (
        <>
          {isMulti && (
            <p className="mb-3 text-xs text-text-muted">
              Multiple-choice — people can pick several answers, so the counts add up to more than
              the number of submissions. The % is the share of people in this cohort who picked each
              option (not a share of 100%). Conversion % is read per option.
            </p>
          )}
          {isScale && scaleSummary && (
            <p className="mb-3 text-xs text-text-muted">
              Average{" "}
              <span className="font-semibold text-text-primary">{scaleSummary.avg.toFixed(1)}</span>{" "}
              / 7<span className="mx-1.5">·</span>
              {scaleSummary.n.toLocaleString()} answered
              <span className="mx-1.5">·</span>1 = low, 7 = high
              <span className="mx-1.5">·</span>flip the metric to see conversion / revenue per score
            </p>
          )}
          {useGenderSplit && (
            <p className="mb-3 text-xs text-text-muted">
              Each gender bar is the share <em>within that gender</em> (e.g. % of women who chose
              this answer), so the columns stay comparable even when one gender is larger.
            </p>
          )}
          {genderSparse && (
            <p className="mb-3 text-xs text-amber-300/80">
              Gender data is sparse here — {(genderTotals.get("Other") ?? 0).toLocaleString()} of{" "}
              {allGender.toLocaleString()} have no recorded gender, so the split is directional.
            </p>
          )}
          <BarChart
            items={chartItems}
            direction={renderSeries ? "horizontal" : isScale ? "vertical" : "horizontal"}
            series={renderSeries}
          />

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
                      <td className="px-2 py-2 text-right text-text-primary">
                        {showShare ? formatShare(r.sharePct, r.count) : r.count}
                      </td>
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
