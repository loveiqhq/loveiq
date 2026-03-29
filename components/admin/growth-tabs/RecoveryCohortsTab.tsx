"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface RecoverySummary {
  totalPartialSaves: number;
  recoveredCount: number;
  recoveryRate: number;
  medianHoursToRecover: number | null;
  avgHoursToRecover: number | null;
}

interface ResumePoint {
  currentIndex: number;
  count: number;
}

interface RecoverySource {
  source: string;
  partialSaves: number;
  recovered: number;
  recoveryRate: number;
}

interface CohortRow {
  week: string;
  totalSubmissions: number;
  completionRate: number;
  scoredRate: number;
  resumedShare: number;
  resumedCompletionRate: number;
  avgDurationMin: number | null;
  qualityScore: number;
}

interface RecoveryData {
  summary: RecoverySummary;
  resumePoints: ResumePoint[];
  recoveryBySource: RecoverySource[];
  cohorts: CohortRow[];
  trust: {
    windowDays: number;
    sampleSize: number;
  };
}

const cohortColumns: Column<CohortRow>[] = [
  { key: "week", label: "First-Touch Week" },
  { key: "qualityScore", label: "Quality", align: "right" },
  {
    key: "completionRate",
    label: "Completion",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "scoredRate",
    label: "Scored",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "resumedShare",
    label: "Resumed Share",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "resumedCompletionRate",
    label: "Recovery Success",
    align: "right",
    format: (v) => `${v}%`,
  },
  {
    key: "totalSubmissions",
    label: "Subs",
    align: "right",
  },
];

export default function RecoveryCohortsTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<RecoveryData>(
    "/api/admin/growth/recovery",
    params
  );

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
        {error || "Failed to load recovery data."}
      </div>
    );
  }

  const resumeItems = data.resumePoints.slice(0, 10).map((point) => ({
    label: `Q${point.currentIndex}`,
    value: point.count,
  }));

  const sourceItems = data.recoveryBySource.slice(0, 8).map((source) => ({
    label: `${source.source} (${source.recovered}/${source.partialSaves})`,
    value: source.recoveryRate,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Partial Saves" value={data.summary.totalPartialSaves} />
        <StatCard label="Recovered" value={data.summary.recoveredCount} />
        <StatCard label="Recovery Rate" value={`${data.summary.recoveryRate}%`} />
        <StatCard
          label="Median Hours"
          value={
            data.summary.medianHoursToRecover != null
              ? `${data.summary.medianHoursToRecover}h`
              : "—"
          }
        />
        <StatCard
          label="Avg Hours"
          value={
            data.summary.avgHoursToRecover != null ? `${data.summary.avgHoursToRecover}h` : "—"
          }
        />
      </div>

      {data.trust.sampleSize < 20 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          Recovery and cohort quality are based on a small sample in the selected window.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Resume Points</h3>
          {resumeItems.length > 0 ? (
            <BarChart items={resumeItems} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No recovery data in this window.</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Recovery By Source</h3>
          {sourceItems.length > 0 ? (
            <BarChart items={sourceItems} direction="horizontal" />
          ) : (
            <p className="text-sm text-text-muted">No source recovery data in this window.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">
          Cohort Quality By First-Touch Week
        </h3>
        {data.cohorts.length === 0 ? (
          <p className="text-sm text-text-muted">No cohort data available in this window.</p>
        ) : (
          <KpiDataTable
            data={data.cohorts}
            columns={cohortColumns}
            defaultSortKey="week"
            defaultSortDir="asc"
          />
        )}
      </div>
    </div>
  );
}
