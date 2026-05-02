"use client";

import { useMemo, useState } from "react";
import StatCard from "@/components/admin/StatCard";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";
import type {
  SegmentMigrationClusterRow,
  SegmentMigrationMatrixCell,
  SegmentMigrationPathRow,
  SegmentMigrationSnapshot,
} from "@/lib/admin/segment-migration";

const pathColumns: Column<SegmentMigrationPathRow>[] = [
  { key: "path", label: "Path" },
  { key: "movement", label: "Movement" },
  { key: "users", label: "Users", align: "right" },
  {
    key: "shareOfTracked",
    label: "Share",
    align: "right",
    format: (value) => `${value}%`,
  },
  { key: "avgPreviousScore", label: "Prev Score", align: "right" },
  { key: "avgCurrentScore", label: "Current Score", align: "right" },
  {
    key: "avgScoreDelta",
    label: "Delta",
    align: "right",
    format: (value) => {
      const numericValue = Number(value);
      return `${numericValue > 0 ? "+" : ""}${numericValue}`;
    },
  },
  { key: "primaryCurrentSegment", label: "Current Cluster" },
  { key: "primaryCurrentSource", label: "Top Source" },
];

const clusterColumns: Column<SegmentMigrationClusterRow>[] = [
  { key: "label", label: "Segment / Cohort Cluster" },
  { key: "currentUsers", label: "Current Users", align: "right" },
  { key: "previousUsers", label: "Previous Users", align: "right" },
  { key: "upgradedUsers", label: "Upgraded", align: "right" },
  { key: "downgradedUsers", label: "Downgraded", align: "right" },
  { key: "strongNow", label: "Strong Now", align: "right" },
  { key: "weakNow", label: "Weak Now", align: "right" },
  {
    key: "netStrengthDelta",
    label: "Net Delta",
    align: "right",
    format: (value) => {
      const numericValue = Number(value);
      return `${numericValue > 0 ? "+" : ""}${numericValue}`;
    },
  },
  { key: "topPath", label: "Top Path" },
];

function cellTone(cell: SegmentMigrationMatrixCell) {
  if (cell.users === 0) return "border-white/10 bg-black/10 text-text-muted";
  if (cell.movement === "upgrade") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (cell.movement === "downgrade") return "border-red-500/20 bg-red-500/5 text-red-300";
  return "border-white/10 bg-white/5 text-text-primary";
}

function recommendationTone(tone: SegmentMigrationSnapshot["recommendations"][number]["tone"]) {
  if (tone === "scale") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (tone === "risk") return "border-red-500/20 bg-red-500/5 text-red-300";
  return "border-amber-500/20 bg-amber-500/5 text-amber-200";
}

function movementTone(value: SegmentMigrationPathRow["movement"]) {
  if (value === "upgrade") return "bg-emerald-500/10 text-emerald-300";
  if (value === "downgrade") return "bg-red-500/10 text-red-300";
  return "bg-white/10 text-text-muted";
}

export default function SegmentMigrationTab() {
  const [days, setDays] = useState(30);
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<SegmentMigrationSnapshot>(
    "/api/admin/comparisons/segment-migration",
    params
  );

  const matrixLookup = useMemo(() => {
    const lookup = new Map<string, SegmentMigrationMatrixCell>();
    for (const cell of data?.matrix ?? []) {
      lookup.set(`${cell.fromKey}:${cell.toKey}`, cell);
    }
    return lookup;
  }, [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error || "Failed to load segment migration."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-serif text-xl font-semibold text-text-primary">
            Segment Migration Tracker
          </h3>
          <p className="mt-1 max-w-4xl text-sm text-text-muted">
            Track how identified users move between weak, emerging, activated, and strong cohorts
            across two back-to-back windows, with saved-segment overlays where possible.
          </p>
        </div>
        <div className="space-y-2">
          <TimeRangeSelector value={days} onChange={setDays} />
          <p className="text-right text-xs text-text-muted">
            Updated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tracked Users" value={data.summary.trackedUsers.toLocaleString()} />
        <StatCard label="New Users" value={data.summary.newUsers.toLocaleString()} />
        <StatCard label="Churned Users" value={data.summary.churnedUsers.toLocaleString()} />
        <StatCard label="Upgraded" value={data.summary.upgradedUsers.toLocaleString()} />
        <StatCard label="Downgraded" value={data.summary.downgradedUsers.toLocaleString()} />
        <StatCard label="Steady Strong" value={data.summary.steadyStrongUsers.toLocaleString()} />
        <StatCard label="Stuck Weak" value={data.summary.stuckWeakUsers.toLocaleString()} />
        <StatCard label="Top Upgrade" value={data.summary.topUpgradePath ?? "No data"} />
      </div>

      {data.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {data.recommendations.map((recommendation) => (
          <div
            key={recommendation.title}
            className={`rounded-xl border p-5 ${recommendationTone(recommendation.tone)}`}
          >
            <p className="text-xs uppercase tracking-wide opacity-80">{recommendation.tone}</p>
            <p className="mt-2 text-base font-semibold">{recommendation.title}</p>
            <p className="mt-2 text-sm opacity-90">{recommendation.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-text-primary">Migration Matrix</h4>
            <p className="mt-1 text-sm text-text-muted">
              Rows are previous-window cohort state and columns are current-window cohort state.
            </p>
          </div>
          <p className="text-xs text-text-muted">Share is calculated from tracked users only.</p>
        </div>

        <div className="mt-5 overflow-x-auto">
          <div
            className="grid min-w-[860px] gap-3"
            style={{ gridTemplateColumns: "180px repeat(4, minmax(0, 1fr))" }}
          >
            <div />
            {data.cohorts.map((cohort) => (
              <div key={cohort.key} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-semibold text-text-primary">{cohort.label}</p>
                <p className="mt-1 text-xs text-text-muted">{cohort.description}</p>
              </div>
            ))}

            {data.cohorts.map((fromCohort) => (
              <div key={fromCohort.key} className="contents">
                <div className="rounded-lg border border-white/10 bg-black/10 p-3">
                  <p className="text-sm font-semibold text-text-primary">{fromCohort.label}</p>
                  <p className="mt-1 text-xs text-text-muted">Previous window</p>
                </div>
                {data.cohorts.map((toCohort) => {
                  const cell = matrixLookup.get(`${fromCohort.key}:${toCohort.key}`);
                  return (
                    <div
                      key={`${fromCohort.key}-${toCohort.key}`}
                      className={`rounded-lg border p-3 ${
                        cell ? cellTone(cell) : "border-white/10 bg-black/10 text-text-muted"
                      }`}
                    >
                      <p className="text-lg font-semibold">{cell?.users.toLocaleString() ?? "0"}</p>
                      <p className="mt-1 text-xs opacity-80">
                        {cell ? `${cell.shareOfTracked}% of tracked` : "0% of tracked"}
                      </p>
                      <p className="mt-2 text-xs opacity-80">
                        Avg delta{" "}
                        {cell ? `${cell.avgScoreDelta > 0 ? "+" : ""}${cell.avgScoreDelta}` : "0"}
                      </p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {data.trust.notes.map((note) => (
          <div
            key={note}
            className="rounded-xl border border-white/10 bg-surface p-4 text-sm text-text-muted"
          >
            {note}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h4 className="mb-4 text-sm font-medium text-text-primary">Top Migration Paths</h4>
        <KpiDataTable
          data={data.paths}
          columns={pathColumns}
          defaultSortKey="users"
          defaultSortDir="desc"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {(["upgrade", "downgrade", "stable"] as const).map((movement) => (
            <span
              key={movement}
              className={`rounded-full px-2 py-1 text-xs uppercase tracking-wide ${movementTone(
                movement
              )}`}
            >
              {movement}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h4 className="mb-4 text-sm font-medium text-text-primary">Current Segment Hotspots</h4>
        <KpiDataTable
          data={data.clusters}
          columns={clusterColumns}
          defaultSortKey="netStrengthDelta"
          defaultSortDir="desc"
        />
      </div>
    </div>
  );
}
