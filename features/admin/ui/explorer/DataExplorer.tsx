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
import TrendChart from "@features/admin/ui/explorer/TrendChart";
import AnswerFilter from "@features/admin/ui/explorer/AnswerFilter";
import CompareView from "@features/admin/ui/explorer/CompareView";
import { decodeAnswers, encodeAnswers } from "@features/admin/ui/explorer/dimensions";
import type { ExplorerResponse } from "@features/admin/ui/explorer/types";
import {
  DIMENSION_KEYS,
  type ArchetypeVersion,
  type DimensionKey,
  type PaidStatusFilter,
} from "@features/admin/server/explorer";

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
  const groupBy = searchParams.get("groupBy") || "country";
  const groupBy2 = searchParams.get("groupBy2") || null;
  const metric: BreakdownMetric =
    (["count", "paid", "conversion", "revenue"] as const).find(
      (m) => m === searchParams.get("metric")
    ) ?? "count";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const compare = searchParams.get("cmp") === "1";

  const selections = useMemo(() => {
    const sel: Partial<Record<DimensionKey, string[]>> = {};
    const sp = new URLSearchParams(search);
    for (const dim of DIMENSION_KEYS) {
      if (dim === "paidStatus") continue; // managed by the paid toggle, not a multi-select
      const v = sp.get(dim);
      if (v) sel[dim] = v.split(",").filter(Boolean);
    }
    return sel;
  }, [search]);
  const answers = useMemo(() => decodeAnswers(searchParams.get("ans")), [searchParams]);

  // Server params for segment A = the whole URL minus client-only/B keys.
  const params = useMemo(() => {
    const sp = new URLSearchParams(search);
    sp.delete("metric");
    sp.delete("cmp");
    for (const k of [...sp.keys()]) if (k.startsWith("b_")) sp.delete(k);
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
    answers.length +
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
          <button
            type="button"
            onClick={() => setQueryState({ cmp: compare ? null : "1" })}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              compare
                ? "border-accent-purple/50 bg-accent-purple/10 text-text-primary"
                : "border-white/10 text-text-muted hover:text-text-primary"
            }`}
          >
            Compare A/B
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setQueryState({
                  paidStatus: null,
                  includeTest: null,
                  ans: null,
                  page: null,
                  ...Object.fromEntries(DIMENSION_KEYS.map((d) => [d, null])),
                  // also clear the compare (B) segment so Reset resets everything
                  b_paidStatus: null,
                  b_ans: null,
                  ...Object.fromEntries(DIMENSION_KEYS.map((d) => [`b_${d}`, null])),
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

      {/* Filters */}
      <ExplorerFilterPanel
        facets={facets}
        selections={selections}
        onChange={(dim, values) =>
          setQueryState({ [dim]: values.length > 0 ? values.join(",") : null, page: null })
        }
      />
      <AnswerFilter
        filters={answers}
        onChange={(next) => setQueryState({ ans: encodeAnswers(next), page: null })}
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

      {compare && <CompareView aStats={stats ?? null} aBreakdown={breakdown} groupBy={groupBy} />}

      {/* Breakdown */}
      <ExplorerBreakdown
        groupBy={groupBy}
        onGroupByChange={(token) => setQueryState({ groupBy: token })}
        metric={metric}
        onMetricChange={(m) => setQueryState({ metric: m === "count" ? null : m })}
        rows={breakdown}
        overallConversion={stats?.conversionPct ?? null}
      />

      {/* Trend */}
      <TrendChart points={data?.trend ?? []} granularity={data?.trendGranularity ?? "day"} />

      {/* Cross-tab */}
      <ExplorerCrossTab
        rowToken={groupBy}
        colToken={groupBy2}
        onColChange={(token) => setQueryState({ groupBy2: token })}
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
                <th className="px-2 py-2 font-medium">Device</th>
                <th className="px-2 py-2 font-medium">Viewed</th>
                <th className="px-2 py-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={9} className="px-2 py-8 text-center text-text-muted">
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
                    <td className="px-2 py-2 text-text-muted">{r.device ?? "—"}</td>
                    <td className="px-2 py-2 text-text-muted">{r.reportViewed ? "Yes" : "—"}</td>
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
