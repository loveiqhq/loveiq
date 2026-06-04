"use client";

import { useMemo } from "react";
import StatCard from "@features/admin/ui/StatCard";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import { useAdminQueryState } from "@features/admin/ui/hooks/useAdminQueryState";
import ExplorerFilterPanel from "@features/admin/ui/explorer/ExplorerFilterPanel";
import ExplorerBreakdown, {
  type BreakdownMetric,
} from "@features/admin/ui/explorer/ExplorerBreakdown";
import ExplorerCrossTab from "@features/admin/ui/explorer/ExplorerCrossTab";
import {
  DIMENSION_KEYS,
  isDimensionKey,
  type ArchetypeVersion,
  type BreakdownRow,
  type CrossTab,
  type DimensionKey,
  type ExplorerStats,
  type Facets,
  type PaidStatusFilter,
} from "@features/admin/server/explorer";

interface RowView {
  submissionId: number;
  email: string | null;
  archetype: string | null;
  ageGroup: string | null;
  gender: string | null;
  country: string | null;
  relationship: string | null;
  plan: string | null;
  paid: boolean;
  paidAmount: number;
  createdAt: string;
}

interface ExplorerResponse {
  range: { days: number; since: string | null };
  stats: ExplorerStats;
  facets: Facets;
  breakdown: BreakdownRow[];
  crossTab: CrossTab | null;
  rows: RowView[];
  total: number;
  page: number;
  limit: number;
  capped: boolean;
}

function parseList(value: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export default function DataExplorer() {
  const { searchParams, setQueryState } = useAdminQueryState();
  const search = searchParams.toString();

  const days = parseInt(searchParams.get("days") || "0", 10) || 0;
  const includeTest = searchParams.get("includeTest") === "1";
  const archetypeVersion: ArchetypeVersion =
    searchParams.get("archetypeVersion") === "v4" ? "v4" : "v5";
  const paidStatus: PaidStatusFilter =
    searchParams.get("paidStatus") === "paid"
      ? "paid"
      : searchParams.get("paidStatus") === "free"
        ? "free"
        : "all";
  const groupByRaw = searchParams.get("groupBy");
  const groupBy: DimensionKey = isDimensionKey(groupByRaw) ? groupByRaw : "country";
  const groupBy2Raw = searchParams.get("groupBy2");
  const groupBy2: DimensionKey | null =
    isDimensionKey(groupBy2Raw) && groupBy2Raw !== groupBy ? groupBy2Raw : null;
  const metric: BreakdownMetric =
    (["count", "paid", "conversion", "revenue"] as const).find(
      (m) => m === searchParams.get("metric")
    ) ?? "count";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const selections = useMemo(() => {
    const sel: Partial<Record<DimensionKey, string[]>> = {};
    const sp = new URLSearchParams(search);
    for (const dim of DIMENSION_KEYS) {
      const v = parseList(sp.get(dim));
      if (v.length > 0) sel[dim] = v;
    }
    return sel;
  }, [search]);

  // Server params = the whole URL minus the client-only "metric" key.
  const params = useMemo(() => {
    const sp = new URLSearchParams(search);
    sp.delete("metric");
    if (!sp.get("groupBy")) sp.set("groupBy", "country");
    return Object.fromEntries(sp.entries());
  }, [search]);

  const { data, loading, error } = useAdminFetch<ExplorerResponse>("/api/admin/explorer", params);

  const stats = data?.stats;
  const facets = data?.facets ?? {};
  const breakdown = data?.breakdown ?? [];
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 25;
  const pages = Math.max(1, Math.ceil(total / limit));

  const csvHref = useMemo(() => {
    const sp = new URLSearchParams(params);
    sp.set("format", "csv");
    return `/api/admin/explorer?${sp.toString()}`;
  }, [params]);

  const activeFilterCount =
    Object.values(selections).reduce((acc, v) => acc + (v?.length ?? 0), 0) +
    (paidStatus !== "all" ? 1 : 0) +
    (includeTest ? 1 : 0);

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-surface p-3">
        <TimeRangeSelector
          value={days}
          onChange={(d) => setQueryState({ days: d || null, page: null })}
        />

        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {(["v5", "v4"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setQueryState({ archetypeVersion: v === "v5" ? null : v, page: null })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium uppercase transition ${
                archetypeVersion === v
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {(
            [
              { key: "all", label: "All" },
              { key: "paid", label: "Paid" },
              { key: "free", label: "Free" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() =>
                setQueryState({ paidStatus: opt.key === "all" ? null : opt.key, page: null })
              }
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                paidStatus === opt.key
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={includeTest}
            onChange={(e) =>
              setQueryState({ includeTest: e.target.checked ? "1" : null, page: null })
            }
            className="h-3.5 w-3.5 accent-accent-purple"
          />
          Include test / $0 unlocks
        </label>

        <div className="ml-auto flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setQueryState({
                  paidStatus: null,
                  includeTest: null,
                  page: null,
                  ...Object.fromEntries(DIMENSION_KEYS.map((d) => [d, null])),
                })
              }
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-text-muted hover:text-text-primary"
            >
              Reset filters ({activeFilterCount})
            </button>
          )}
          <a
            href={csvHref}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/5"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Filter panel */}
      <ExplorerFilterPanel
        facets={facets}
        selections={selections}
        onChange={(dim, values) =>
          setQueryState({ [dim]: values.length > 0 ? values.join(",") : null, page: null })
        }
      />

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {data?.capped && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
          Showing the most recent 20,000 submissions — narrow the date range for the full history.
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Submissions" value={(stats?.total ?? 0).toLocaleString()} />
        <StatCard label="Paid" value={(stats?.paid ?? 0).toLocaleString()} />
        <StatCard
          label="Conversion"
          value={stats?.conversionPct == null ? "—" : `${stats.conversionPct}%`}
          sub="paid / submissions"
        />
        <StatCard label="Revenue" value={`€${(stats?.revenue ?? 0).toLocaleString()}`} />
        <StatCard
          label="Avg duration"
          value={stats?.avgDurationMin == null ? "—" : `${stats.avgDurationMin}m`}
        />
        <StatCard label="Free" value={(stats?.free ?? 0).toLocaleString()} />
      </div>

      {/* Breakdown */}
      <ExplorerBreakdown
        groupBy={groupBy}
        onGroupByChange={(d) => setQueryState({ groupBy: d })}
        metric={metric}
        onMetricChange={(m) => setQueryState({ metric: m === "count" ? null : m })}
        rows={breakdown}
      />

      {/* Cross-tab */}
      <ExplorerCrossTab
        rowDim={groupBy}
        colDim={groupBy2}
        onColDimChange={(d) => setQueryState({ groupBy2: d })}
        data={data?.crossTab ?? null}
      />

      {/* Filtered submissions */}
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            Matching submissions{loading ? " …" : ""}
          </h2>
          <span className="text-xs text-text-muted">
            {total.toLocaleString()} result{total === 1 ? "" : "s"}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-text-muted">
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Email</th>
                <th className="px-2 py-2 font-medium">Archetype</th>
                <th className="px-2 py-2 font-medium">Age</th>
                <th className="px-2 py-2 font-medium">Gender</th>
                <th className="px-2 py-2 font-medium">Country</th>
                <th className="px-2 py-2 font-medium">Plan</th>
                <th className="px-2 py-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="px-2 py-8 text-center text-text-muted">
                    No submissions match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.submissionId} className="border-b border-white/5">
                    <td className="px-2 py-2">
                      <a
                        href={`/admin/submissions/${r.submissionId}`}
                        className="text-accent-purple hover:underline"
                      >
                        {r.submissionId}
                      </a>
                    </td>
                    <td className="px-2 py-2 text-text-muted">{r.email ?? "—"}</td>
                    <td className="px-2 py-2 text-text-primary">{r.archetype ?? "—"}</td>
                    <td className="px-2 py-2 text-text-muted">{r.ageGroup ?? "—"}</td>
                    <td className="px-2 py-2 text-text-muted">{r.gender ?? "—"}</td>
                    <td className="px-2 py-2 text-text-muted">{r.country ?? "—"}</td>
                    <td className="px-2 py-2 text-text-muted">{r.plan ?? "Free"}</td>
                    <td className="px-2 py-2 text-right">
                      {r.paid ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          €{r.paidAmount.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setQueryState({ page: page - 1 > 1 ? page - 1 : null })}
              className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setQueryState({ page: page + 1 })}
              className="rounded-lg border border-white/10 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
