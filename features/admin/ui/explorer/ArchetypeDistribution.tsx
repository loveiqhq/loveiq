"use client";

import { useState } from "react";
import type { ArchetypeStat } from "@features/admin/server/explorer";

type SortKey = "avgMatch" | "primaryCount" | "primaryPaidPct";

const COLUMNS: Array<{ key: SortKey; label: string; help: string }> = [
  { key: "avgMatch", label: "Avg match %", help: "Mean match across everyone in the cohort" },
  { key: "primaryCount", label: "Primary", help: "How many people have this as their #1" },
  { key: "primaryPaidPct", label: "Paid %", help: "Conversion among those primaries" },
];

function sortVal(s: ArchetypeStat, key: SortKey): number {
  if (key === "avgMatch") return s.avgMatch;
  if (key === "primaryCount") return s.primaryCount;
  return s.primaryPaidPct ?? -1;
}

interface Props {
  data: ArchetypeStat[];
  /** Tighter layout for the side-by-side Compare view. */
  compact?: boolean;
}

/**
 * Full archetype profile across the filtered cohort: every archetype's average
 * match % (not just each person's #1), how many have it as primary, and the
 * paid rate among those primaries. Click a column header to re-sort.
 */
export default function ArchetypeDistribution({ data, compact = false }: Props) {
  const [sort, setSort] = useState<SortKey>("avgMatch");

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Archetype match profile</h2>
        <p className="py-6 text-center text-sm text-text-muted">
          No scored submissions for these filters.
        </p>
      </div>
    );
  }

  const sorted = [...data].sort(
    (a, b) => sortVal(b, sort) - sortVal(a, sort) || a.archetype.localeCompare(b.archetype)
  );
  const maxAvg = Math.max(...data.map((d) => d.avgMatch), 1);

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-text-primary">Archetype match profile</h2>
        <span className="text-xs text-text-muted">all archetypes · {data.length}</span>
      </div>
      <p className="mb-3 text-xs text-text-muted">
        Every archetype across the filtered group — not just each person’s top match. Click a column
        to sort.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-text-muted">
              <th className="px-2 py-2 font-medium">Archetype</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-2 py-2 text-right font-medium">
                  <button
                    type="button"
                    title={c.help}
                    onClick={() => setSort(c.key)}
                    className={`inline-flex items-center gap-1 transition hover:text-text-primary ${
                      sort === c.key ? "text-text-primary" : ""
                    }`}
                  >
                    {c.label}
                    {sort === c.key && <span aria-hidden>▾</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const barPct = (s.avgMatch / maxAvg) * 100;
              return (
                <tr key={s.archetype} className="border-b border-white/5">
                  <td className={`px-2 ${compact ? "py-1.5" : "py-2"} text-text-primary`}>
                    {s.archetype}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="hidden h-1.5 w-20 rounded-full bg-white/5 sm:block">
                        <div
                          className="h-1.5 rounded-full bg-accent-purple"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-text-primary">
                        {s.avgMatch.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-text-muted">
                    {s.primaryCount.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-text-muted">
                    {s.primaryPaidPct == null ? "—" : `${s.primaryPaidPct}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
