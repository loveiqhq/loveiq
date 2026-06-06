"use client";

import { useState } from "react";
import BarChart from "@features/admin/ui/BarChart";

interface SegmentRow {
  label: string;
  count: number;
  pct: number;
}

interface SegmentationData {
  archetype: SegmentRow[];
  country: SegmentRow[];
  gender: SegmentRow[];
  age: SegmentRow[];
}

interface SegmentationPanelProps {
  completion: SegmentationData;
  paid: SegmentationData;
}

type DimKey = keyof SegmentationData;

// Below this completion count a per-segment conversion rate is statistical noise —
// matches the SMALL_SAMPLE threshold used across the Data Explorer (ExplorerBreakdown).
const SMALL_SAMPLE = 30;

const DIMENSIONS: Array<{ key: DimKey; label: string; gap: boolean }> = [
  // `gap` = render the completion→paid conversion table. Country is the only
  // dimension that is top-10'd server-side, so the completion and paid top sets
  // can differ and a per-row conversion would mislead — show its bars only.
  { key: "archetype", label: "Primary Archetype", gap: true },
  { key: "country", label: "Country", gap: false },
  { key: "gender", label: "Gender", gap: true },
  { key: "age", label: "Age bucket", gap: true },
];

function toBarItems(rows: SegmentRow[]): Array<{ label: string; value: number }> {
  // (r.pct ?? 0) — defensive: a malformed row must never crash the whole admin.
  return rows.map((r) => ({ label: `${r.label} (${(r.pct ?? 0).toFixed(1)}%)`, value: r.count }));
}

function sumCount(rows: SegmentRow[]): number {
  return rows.reduce((s, r) => s + (r.count ?? 0), 0);
}

interface GapRow {
  label: string;
  completion: number;
  paid: number;
  conv: number | null; // paid / completion, null when completion is 0
  vsAvg: number | null; // conv / overall conversion
}

function buildGapRows(
  completionRows: SegmentRow[],
  paidRows: SegmentRow[]
): { rows: GapRow[]; overallConv: number } {
  const compMap = new Map(completionRows.map((r) => [r.label, r.count]));
  const paidMap = new Map(paidRows.map((r) => [r.label, r.count]));
  const completionTotal = sumCount(completionRows);
  const paidTotal = sumCount(paidRows);
  const overallConv = completionTotal > 0 ? paidTotal / completionTotal : 0;

  const labels = [...new Set([...compMap.keys(), ...paidMap.keys()])];
  const rows: GapRow[] = labels
    .map((label) => {
      const completion = compMap.get(label) ?? 0;
      const paid = paidMap.get(label) ?? 0;
      const conv = completion > 0 ? paid / completion : null;
      const vsAvg = conv != null && overallConv > 0 ? conv / overallConv : null;
      return { label, completion, paid, conv, vsAvg };
    })
    .sort((a, b) => b.completion - a.completion);

  return { rows, overallConv };
}

function vsAvgClass(vsAvg: number | null): string {
  if (vsAvg == null) return "text-text-muted";
  if (vsAvg >= 1.1) return "text-emerald-400";
  if (vsAvg <= 0.9) return "text-red-400";
  return "text-text-muted";
}

export default function SegmentationPanel({ completion, paid }: SegmentationPanelProps) {
  const [focus, setFocus] = useState<DimKey | "all">("all");

  // Defensive defaults — a missing side or sub-array must degrade to an empty
  // dimension, never a white-screen.
  const safe = (d: SegmentationData | undefined): SegmentationData => ({
    archetype: d?.archetype ?? [],
    country: d?.country ?? [],
    gender: d?.gender ?? [],
    age: d?.age ?? [],
  });
  const comp = safe(completion);
  const pay = safe(paid);

  const visibleDimensions =
    focus === "all" ? DIMENSIONS : DIMENSIONS.filter((d) => d.key === focus);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-text-muted">
          Side-by-side segmentation: who completes the survey vs. who pays. The conversion table
          highlights where a segment over- or under-converts against the average — high completion
          but low paid % means a value or pricing issue, not an acquisition issue.
        </p>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span className="uppercase tracking-wider">Dimension</span>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value as DimKey | "all")}
            className="rounded-lg border border-white/10 bg-page px-3 py-1.5 text-sm text-text-primary focus:border-accent-purple focus:outline-none"
          >
            <option value="all">All dimensions</option>
            {DIMENSIONS.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`grid grid-cols-1 gap-6 ${focus === "all" ? "lg:grid-cols-2" : ""}`}>
        {visibleDimensions.map((dim) => {
          const completionRows = comp[dim.key];
          const paidRows = pay[dim.key];
          const completionTotal = sumCount(completionRows);
          const paidTotal = sumCount(paidRows);
          const isEmpty = completionRows.length === 0 && paidRows.length === 0;

          const gap = dim.gap ? buildGapRows(completionRows, paidRows) : null;
          const hasSmall = gap?.rows.some((r) => r.completion > 0 && r.completion < SMALL_SAMPLE);

          return (
            <div key={dim.key} className="rounded-xl border border-white/10 bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-serif text-base font-semibold text-text-primary">
                  {dim.label}
                </h3>
                <p className="text-xs text-text-muted">
                  {completionTotal.toLocaleString("en-US")} completed ·{" "}
                  {paidTotal.toLocaleString("en-US")} paid
                </p>
              </div>

              {isEmpty ? (
                <p className="mt-4 text-sm text-text-muted">No data for this window.</p>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Completion
                      </p>
                      {completionRows.length === 0 ? (
                        <p className="text-sm text-text-muted">—</p>
                      ) : (
                        <BarChart items={toBarItems(completionRows)} />
                      )}
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Paid
                      </p>
                      {paidRows.length === 0 ? (
                        <p className="text-sm text-text-muted">—</p>
                      ) : (
                        <BarChart items={toBarItems(paidRows)} />
                      )}
                    </div>
                  </div>

                  {gap && gap.rows.length > 0 && (
                    <div className="mt-5">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                        Completion → Paid conversion
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-text-muted">
                            <tr className="border-b border-white/10">
                              <th className="py-1.5 pr-3 font-medium">Segment</th>
                              <th className="py-1.5 px-3 text-right font-medium">Completed</th>
                              <th className="py-1.5 px-3 text-right font-medium">Paid</th>
                              <th className="py-1.5 px-3 text-right font-medium">Conv.</th>
                              <th className="py-1.5 pl-3 text-right font-medium">vs avg</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gap.rows.map((r) => {
                              const small = r.completion > 0 && r.completion < SMALL_SAMPLE;
                              return (
                                <tr
                                  key={r.label}
                                  className={`border-b border-white/5 ${small ? "opacity-50" : ""}`}
                                >
                                  <td className="py-1.5 pr-3 text-text-primary">
                                    {r.label}
                                    {small && " *"}
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-text-muted">
                                    {r.completion.toLocaleString("en-US")}
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-text-muted">
                                    {r.paid.toLocaleString("en-US")}
                                  </td>
                                  <td className="py-1.5 px-3 text-right text-text-primary">
                                    {r.conv != null ? `${(r.conv * 100).toFixed(1)}%` : "—"}
                                  </td>
                                  <td className={`py-1.5 pl-3 text-right ${vsAvgClass(r.vsAvg)}`}>
                                    {r.vsAvg != null ? `${r.vsAvg.toFixed(2)}×` : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {hasSmall && (
                        <p className="mt-2 text-[11px] text-text-muted">
                          * fewer than {SMALL_SAMPLE} completions — treat conversion as directional.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
