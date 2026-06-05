"use client";

import type { CrossTab } from "@features/admin/server/explorer";
import {
  ANSWER_GROUP_OPTIONS,
  DIMENSION_GROUP_OPTIONS,
  tokenLabel,
} from "@features/admin/ui/explorer/dimensions";

interface Props {
  rowToken: string;
  colToken: string | null;
  onColChange: (token: string | null) => void;
  data: CrossTab | null;
}

function cellColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "transparent";
  const ratio = value / max;
  return `rgba(156, 125, 255, ${(0.1 + 0.6 * ratio).toFixed(3)})`; // accent-purple
}

export default function ExplorerCrossTab({ rowToken, colToken, onColChange, data }: Props) {
  const max = data
    ? Math.max(
        1,
        ...data.rowLabels.flatMap((r) => data.colLabels.map((c) => data.cells[r]?.[c] ?? 0))
      )
    : 1;

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-muted">Cross-tab:</span>
        <span className="max-w-[200px] truncate text-sm font-medium text-text-primary">
          {tokenLabel(rowToken)}
        </span>
        <span className="text-sm text-text-muted">×</span>
        <select
          value={colToken ?? ""}
          onChange={(e) => onColChange(e.target.value || null)}
          className="max-w-[220px] truncate rounded-lg border border-white/10 bg-[#1a1025] px-3 py-1.5 text-sm text-text-primary outline-none"
        >
          <option value="">None</option>
          <optgroup label="Dimensions">
            {DIMENSION_GROUP_OPTIONS.filter((o) => o.value !== rowToken).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Survey answers">
            {ANSWER_GROUP_OPTIONS.filter((o) => o.value !== rowToken).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {!colToken || !data ? (
        <p className="py-6 text-center text-sm text-text-muted">
          Pick a second dimension to see a matrix (e.g. archetype × country).
        </p>
      ) : data.grandTotal === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">No data for these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-surface px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-muted">
                  {tokenLabel(rowToken)}
                </th>
                {data.colLabels.map((c) => (
                  <th
                    key={c}
                    className="px-2 py-2 text-right text-xs font-medium text-text-muted"
                    title={c}
                  >
                    <span className="inline-block max-w-[90px] truncate align-bottom">{c}</span>
                  </th>
                ))}
                <th className="px-2 py-2 text-right text-xs font-semibold text-text-primary">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rowLabels.map((r) => (
                <tr key={r} className="border-t border-white/5">
                  <td className="sticky left-0 bg-surface px-2 py-2 text-text-primary" title={r}>
                    <span className="inline-block max-w-[140px] truncate align-bottom">{r}</span>
                  </td>
                  {data.colLabels.map((c) => {
                    const v = data.cells[r]?.[c] ?? 0;
                    return (
                      <td
                        key={c}
                        className="px-2 py-2 text-right tabular-nums text-text-primary"
                        style={{ backgroundColor: cellColor(v, max) }}
                      >
                        {v || ""}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-text-primary">
                    {data.rowTotals[r] ?? 0}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-white/10">
                <td className="sticky left-0 bg-surface px-2 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Total
                </td>
                {data.colLabels.map((c) => (
                  <td
                    key={c}
                    className="px-2 py-2 text-right font-semibold tabular-nums text-text-primary"
                  >
                    {data.colTotals[c] ?? 0}
                  </td>
                ))}
                <td className="px-2 py-2 text-right font-bold tabular-nums text-text-primary">
                  {data.grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
