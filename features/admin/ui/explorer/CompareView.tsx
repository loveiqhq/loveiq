"use client";

import { useMemo } from "react";
import StatCard from "@features/admin/ui/StatCard";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { useAdminQueryState } from "@features/admin/ui/hooks/useAdminQueryState";
import ExplorerFilterPanel from "@features/admin/ui/explorer/ExplorerFilterPanel";
import AnswerFilter from "@features/admin/ui/explorer/AnswerFilter";
import ArchetypeMatchFilter from "@features/admin/ui/explorer/ArchetypeMatchFilter";
import {
  decodeAnswers,
  decodeArchMatch,
  encodeAnswers,
  encodeArchMatch,
  tokenLabel,
} from "@features/admin/ui/explorer/dimensions";
import type { ExplorerResponse } from "@features/admin/ui/explorer/types";
import {
  DIMENSION_KEYS,
  type ArchetypeStat,
  type BreakdownRow,
  type DimensionKey,
  type ExplorerStats,
} from "@features/admin/server/explorer";

interface Props {
  aStats: ExplorerStats | null;
  aBreakdown: BreakdownRow[];
  aDistribution: ArchetypeStat[];
  groupBy: string;
}

const PAID_OPTS = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "free", label: "Free" },
] as const;

function StatRow({ stats }: { stats: ExplorerStats | null }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <StatCard label="Submissions" value={(stats?.total ?? 0).toLocaleString()} />
      <StatCard label="Paid" value={(stats?.paid ?? 0).toLocaleString()} />
      <StatCard
        label="Conversion"
        value={stats?.conversionPct == null ? "—" : `${stats.conversionPct}%`}
      />
      <StatCard label="Revenue" value={`€${(stats?.revenue ?? 0).toLocaleString()}`} />
    </div>
  );
}

function MiniBreakdown({ rows }: { rows: BreakdownRow[] }) {
  if (rows.length === 0)
    return <p className="py-4 text-center text-xs text-text-muted">No data.</p>;
  return (
    <table className="mt-2 w-full text-left text-xs">
      <thead>
        <tr className="border-b border-white/10 text-text-muted">
          <th className="px-1 py-1 font-medium">Group</th>
          <th className="px-1 py-1 text-right font-medium">Subs</th>
          <th className="px-1 py-1 text-right font-medium">Paid</th>
          <th className="px-1 py-1 text-right font-medium">Conv.</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 10).map((r) => (
          <tr key={r.label} className="border-b border-white/5">
            <td className="px-1 py-1 text-text-primary">{r.label}</td>
            <td className="px-1 py-1 text-right text-text-primary">{r.count}</td>
            <td className="px-1 py-1 text-right text-text-muted">{r.paid}</td>
            <td className="px-1 py-1 text-right text-text-muted">
              {r.paidPct == null ? "—" : `${r.paidPct}%`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Top archetypes by average match % — compact, for the side-by-side compare. */
function MiniDistribution({ data }: { data: ArchetypeStat[] }) {
  if (data.length === 0) return null;
  const top = [...data].sort((a, b) => b.avgMatch - a.avgMatch).slice(0, 6);
  return (
    <table className="mt-3 w-full text-left text-xs">
      <thead>
        <tr className="border-b border-white/10 text-text-muted">
          <th className="px-1 py-1 font-medium">Archetype (avg match)</th>
          <th className="px-1 py-1 text-right font-medium">Avg %</th>
          <th className="px-1 py-1 text-right font-medium">Primary</th>
        </tr>
      </thead>
      <tbody>
        {top.map((s) => (
          <tr key={s.archetype} className="border-b border-white/5">
            <td className="px-1 py-1 text-text-primary">{s.archetype}</td>
            <td className="px-1 py-1 text-right tabular-nums text-text-muted">
              {s.avgMatch.toFixed(1)}%
            </td>
            <td className="px-1 py-1 text-right tabular-nums text-text-muted">{s.primaryCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CompareView({ aStats, aBreakdown, aDistribution, groupBy }: Props) {
  const { searchParams, setQueryState } = useAdminQueryState();
  const search = searchParams.toString();

  const paidStatusB = searchParams.get("b_paidStatus") || "all";
  const selectionsB = useMemo(() => {
    const sel: Partial<Record<DimensionKey, string[]>> = {};
    const sp = new URLSearchParams(search);
    for (const dim of DIMENSION_KEYS) {
      if (dim === "paidStatus") continue; // managed by the B paid toggle
      const v = sp.get(`b_${dim}`);
      if (v) sel[dim] = v.split(",").filter(Boolean);
    }
    return sel;
  }, [search]);
  const answersB = useMemo(() => decodeAnswers(searchParams.get("b_ans")), [searchParams]);
  const archMatchB = useMemo(
    () => decodeArchMatch(searchParams.get("b_archMatch")),
    [searchParams]
  );

  // B params = shared (days/status/includeTest/archetypeVersion/groupBy/groupBy2)
  // + B's own filters (mapped from b_ keys to the route's param names).
  const paramsB = useMemo(() => {
    const sp = new URLSearchParams(search);
    const out: Record<string, string> = {};
    for (const k of ["days", "status", "includeTest", "archetypeVersion", "groupBy", "groupBy2"]) {
      const v = sp.get(k);
      if (v) out[k] = v;
    }
    if (!out.groupBy) out.groupBy = "country";
    if (paidStatusB !== "all") out.paidStatus = paidStatusB;
    for (const dim of DIMENSION_KEYS) {
      const v = sp.get(`b_${dim}`);
      if (v) out[dim] = v;
    }
    const bans = sp.get("b_ans");
    if (bans) out.ans = bans;
    const bArch = sp.get("b_archMatch");
    if (bArch) out.archMatch = bArch;
    return out;
  }, [search, paidStatusB]);

  const { data: bData, loading } = useAdminFetch<ExplorerResponse>("/api/admin/explorer", paramsB);

  return (
    <div className="rounded-xl border border-accent-purple/30 bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">
        Compare — A vs B (grouped by {tokenLabel(groupBy)})
      </h2>

      {/* B filter editor */}
      <div className="mb-4 space-y-3 rounded-lg border border-white/10 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Segment B
          </span>
          <div className="flex gap-1 rounded-lg bg-white/5 p-1">
            {PAID_OPTS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setQueryState({ b_paidStatus: o.key === "all" ? null : o.key })}
                className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                  paidStatusB === o.key
                    ? "bg-white/10 text-text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {loading && <span className="text-xs text-text-muted">loading…</span>}
        </div>
        <ExplorerFilterPanel
          facets={bData?.facets ?? {}}
          selections={selectionsB}
          onChange={(dim, values) =>
            setQueryState({ [`b_${dim}`]: values.length > 0 ? values.join(",") : null })
          }
        />
        <AnswerFilter
          filters={answersB}
          onChange={(next) => setQueryState({ b_ans: encodeAnswers(next) })}
        />
        <ArchetypeMatchFilter
          value={archMatchB}
          options={(bData?.archetypeDistribution ?? []).map((d) => d.archetype)}
          onChange={(next) => setQueryState({ b_archMatch: encodeArchMatch(next) })}
        />
      </div>

      {/* A vs B */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-white/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-purple">
            Segment A
          </p>
          <StatRow stats={aStats} />
          <MiniBreakdown rows={aBreakdown} />
          <MiniDistribution data={aDistribution} />
        </div>
        <div className="rounded-lg border border-white/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-orange">
            Segment B
          </p>
          <StatRow stats={bData?.stats ?? null} />
          <MiniBreakdown rows={bData?.breakdown ?? []} />
          <MiniDistribution data={bData?.archetypeDistribution ?? []} />
        </div>
      </div>
    </div>
  );
}
