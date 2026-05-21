"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";
import BarChart from "@features/admin/ui/BarChart";

interface ActivityData {
  totalActions: number;
  activeAdmins: number;
  unreviewedCount: number;
  actionDistribution: Array<{ action: string; count: number }>;
  dailyActions: Array<{ date: string; count: number }>;
}

export default function ActivityOverviewTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ActivityData>("/api/admin/activity", params);

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
        {error || "Failed to load activity data."}
      </div>
    );
  }

  const dailyItems = data.dailyActions.map((d) => ({ label: d.date.slice(5), value: d.count }));
  const actionItems = data.actionDistribution.map((a) => ({ label: a.action, value: a.count }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Actions" value={data.totalActions} />
        <StatCard label="Active Admins" value={data.activeAdmins} />
        <StatCard label="Unreviewed Submissions" value={data.unreviewedCount} />
      </div>

      {dailyItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Daily Admin Actions</h3>
          <BarChart items={dailyItems} direction="vertical" />
        </div>
      )}

      {actionItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Action Type Distribution</h3>
          <BarChart items={actionItems} direction="horizontal" />
        </div>
      )}
    </div>
  );
}
