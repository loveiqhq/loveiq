"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import KpiDataTable, { type Column } from "@/components/admin/kpi-tabs/KpiDataTable";

interface CohortAnalysisTabProps {
  days: number;
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

type GroupBy = (typeof GROUP_BY_OPTIONS)[number]["value"];

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

export default function CohortAnalysisTab({ days }: CohortAnalysisTabProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("week");

  const params = useMemo(() => {
    const p: Record<string, string> = { groupBy };
    if (days > 0) p.days = String(days);
    return p;
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
            {data?.summary.strongestCompletionLabel ?? "No data"}
          </p>
          {data?.summary.strongestCompletionRate != null && (
            <p className="mt-1 text-xs text-text-muted">
              {data.summary.strongestCompletionRate}% completion
            </p>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Weakest Completion
          </p>
          <p className="mt-2 text-sm font-semibold text-text-primary">
            {data?.summary.weakestCompletionLabel ?? "No data"}
          </p>
          {data?.summary.weakestCompletionRate != null && (
            <p className="mt-1 text-xs text-text-muted">
              {data.summary.weakestCompletionRate}% completion
            </p>
          )}
        </div>
      </div>

      {data?.trust.warning && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-100/90">
          {data.trust.warning}
        </div>
      )}

      {/* Group-by selector */}
      <div className="rounded-xl border border-white/10 bg-surface p-4">
        <label className="mb-2 block text-xs font-medium text-text-muted">Group By</label>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setGroupBy(opt.value)}
              aria-pressed={groupBy === opt.value}
              className={`rounded-md px-4 py-1.5 text-xs font-medium transition ${
                groupBy === opt.value
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cohort table */}
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
            {/* Color legend */}
            <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
              <span>
                Completion rate: <span className={completionRateColor(80)}>&#9679; &ge;70%</span>{" "}
                <span className={completionRateColor(50)}>&#9679; 40-69%</span>{" "}
                <span className={completionRateColor(20)}>&#9679; &lt;40%</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
