"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";

interface ReportsData {
  totalReports: number;
  totalSessions: number;
  viewRate: number;
  avgSessionDurationSec: number;
  dailyOpens: Array<{ date: string; count: number }>;
}

export default function OverviewTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ReportsData>(
    "/api/admin/reports/engagement",
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
        {error || "Failed to load report data."}
      </div>
    );
  }

  const durationMin = Math.round(data.avgSessionDurationSec / 60);
  const chartItems = data.dailyOpens.map((d) => ({ label: d.date.slice(5), value: d.count }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reports Generated" value={data.totalReports} />
        <StatCard label="View Rate" value={`${data.viewRate}%`} />
        <StatCard label="Total Sessions" value={data.totalSessions} />
        <StatCard label="Avg Session Duration" value={`${durationMin}m`} />
      </div>

      {chartItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Daily Report Opens</h3>
          <BarChart items={chartItems} direction="vertical" />
        </div>
      )}
    </div>
  );
}
