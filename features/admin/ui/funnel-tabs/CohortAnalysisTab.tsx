"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@features/admin/ui/kpi-tabs/KpiDataTable";
import type { CohortGroupBy } from "@features/admin/server/drilldowns";

interface CohortAnalysisTabProps {
  days: number;
  groupBy: CohortGroupBy;
  onGroupByChange: (value: CohortGroupBy) => void;
}

interface CohortRow {
  label: string;
  total_users: number;
  survey_started: number;
  survey_completed: number;
  scored: number;
  invite_sent: number;
}

interface CohortResponse {
  rows: CohortRow[];
  summary: {
    strongestCompletionLabel: string | null;
    strongestCompletionRate: number | null;
    weakestCompletionLabel: string | null;
    weakestCompletionRate: number | null;
  };
  trust: {
    sampleSize: number;
    warning: string | null;
  };
}

const GROUP_BY_OPTIONS = [
  { value: "week", label: "Week" },
  { value: "utm", label: "UTM Source" },
  { value: "archetype", label: "Archetype" },
] as const;

function completionRateColor(rate: number): string {
  if (rate >= 70) return "text-emerald-400";
  if (rate >= 40) return "text-yellow-300";
  return "text-red-400";
}

const columns: Column<CohortRow & { completion_rate: number }>[] = [
  { key: "label", label: "Label", sortable: true },
  { key: "total_users", label: "Total Users", align: "right", sortable: true },
  { key: "survey_started", label: "Survey Started", align: "right", sortable: true },
  { key: "survey_completed", label: "Survey Completed", align: "right", sortable: true },
  { key: "scored", label: "Scored", align: "right", sortable: true },
  { key: "invite_sent", label: "Invite Sent", align: "right", sortable: true },
  {
    key: "completion_rate",
    label: "Completion %",
    align: "right",
    sortable: true,
    format: (value) => `${value}%`,
  },
];

export default function CohortAnalysisTab({
  days,
  groupBy,
  onGroupByChange,
}: CohortAnalysisTabProps) {
  const params = useMemo(() => {
    const nextParams: Record<string, string> = { groupBy };
    if (days > 0) nextParams.days = String(days);
    return nextParams;
  }, [days, groupBy]);

  const { data, loading, error } = useAdminFetch<CohortResponse>(
    "/api/admin/funnels/cohorts",
    params
  );

  const rows = useMemo(() => {
    if (!data?.rows || !Array.isArray(data.rows)) return [];
    return data.rows.map((row) => ({
      ...row,
      completion_rate:
        row.total_users > 0 ? Math.round((row.survey_completed / row.total_users) * 100) : 0,
    }));
  }, [data]);
  const summary = useMemo(
    () => ({
      strongestCompletionLabel: data?.summary?.strongestCompletionLabel ?? null,
      strongestCompletionRate: data?.summary?.strongestCompletionRate ?? null,
      weakestCompletionLabel: data?.summary?.weakestCompletionLabel ?? null,
      weakestCompletionRate: data?.summary?.weakestCompletionRate ?? null,
    }),
    [data]
  );
  const trust = useMemo(
    () => ({
      sampleSize: data?.trust?.sampleSize ?? 0,
      warning: data?.trust?.warning ?? null,
    }),
    [data]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Strongest Completion
          </p>
          <p className="mt-2 text-sm font-semibold text-text-primary">
            {summary.strongestCompletionLabel ?? "No data"}
          </p>
          {summary.strongestCompletionRate != null && (
            <p className="mt-1 text-xs text-text-muted">
              {summary.strongestCompletionRate}% completion
            </p>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Weakest Completion
          </p>
          <p className="mt-2 text-sm font-semibold text-text-primary">
            {summary.weakestCompletionLabel ?? "No data"}
          </p>
          {summary.weakestCompletionRate != null && (
            <p className="mt-1 text-xs text-text-muted">
              {summary.weakestCompletionRate}% completion
            </p>
          )}
        </div>
      </div>

      {trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {trust.warning}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-4">
        <label className="mb-2 block text-xs font-medium text-text-muted">Group By</label>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {GROUP_BY_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onGroupByChange(option.value)}
              aria-pressed={groupBy === option.value}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${
                groupBy === option.value
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface p-6">
        <h3 className="mb-4 font-serif text-lg font-bold text-text-primary">Cohort Analysis</h3>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-muted">No cohort data available.</div>
        ) : (
          <>
            <KpiDataTable
              data={rows}
              columns={columns}
              defaultSortKey="label"
              defaultSortDir="asc"
            />
            <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
              <span>
                Completion rate: <span className={completionRateColor(80)}>● ≥70%</span>{" "}
                <span className={completionRateColor(50)}>● 40-69%</span>{" "}
                <span className={completionRateColor(20)}>● &lt;40%</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
