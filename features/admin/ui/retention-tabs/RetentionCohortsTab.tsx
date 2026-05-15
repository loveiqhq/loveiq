"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface Cohort {
  week: string;
  total: number;
  viewed: number;
  viewRate: number;
}

interface RetentionData {
  cohorts: Cohort[];
}

export default function RetentionCohortsTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<RetentionData>("/api/admin/retention", params);

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
        {error || "Failed to load data."}
      </div>
    );
  }

  if (data.cohorts.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-surface p-8 text-center text-sm text-text-muted">
        No cohort data available yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="px-3 py-2.5 text-left font-medium text-text-muted">Completion Week</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">Completed</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">Viewed Report</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">View Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.cohorts.map((c) => (
            <tr key={c.week} className="border-b border-white/5 transition hover:bg-white/5">
              <td className="whitespace-nowrap px-3 py-2 text-text-primary">{c.week}</td>
              <td className="px-3 py-2 text-right text-text-primary">{c.total}</td>
              <td className="px-3 py-2 text-right text-text-primary">{c.viewed}</td>
              <td className="px-3 py-2 text-right">
                <span
                  className={`font-medium ${
                    c.viewRate >= 60
                      ? "text-emerald-400"
                      : c.viewRate >= 30
                        ? "text-yellow-400"
                        : "text-red-400"
                  }`}
                >
                  {c.viewRate}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
