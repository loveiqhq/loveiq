"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import StatCard from "./StatCard";
import BarChart from "./BarChart";
import TimeRangeSelector from "./TimeRangeSelector";

interface StatsData {
  totalSubmissions: number;
  completionRate: number;
  dropOff: Array<{ qId: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
}

export default function AdminDashboard() {
  const [days, setDays] = useState(30);
  const params = useMemo(() => ({ days: String(days) }), [days]);
  const { data, loading, error } = useAdminFetch<StatsData>("/api/admin/stats", params);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
        {error || "Failed to load stats"}
      </div>
    );
  }

  const dropOffItems = data.dropOff.map((d) => ({ label: d.qId, value: d.count }));
  const dailyItems = data.daily.map((d) => ({ label: d.date.slice(5), value: d.count }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl font-bold text-text-primary">Overview</h2>
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total Submissions" value={data.totalSubmissions} />
        <StatCard label="Completion Rate" value={`${data.completionRate}%`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Submissions Over Time</h3>
          {dailyItems.length > 0 ? (
            <BarChart items={dailyItems} direction="vertical" maxHeight={180} />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No data yet</p>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">Top Drop-off Questions</h3>
          {dropOffItems.length > 0 ? (
            <BarChart items={dropOffItems} direction="horizontal" />
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No drop-off data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
