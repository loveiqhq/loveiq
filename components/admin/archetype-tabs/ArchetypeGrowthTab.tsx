"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";
import BarChart from "@/components/admin/BarChart";

interface ArchetypeData {
  weeklyGrowth: Array<{ week: string; count: number }>;
  v5AgreementRate: number;
  total: number;
}

export default function ArchetypeGrowthTab({ slug, days }: { slug: string; days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ArchetypeData>(
    `/api/admin/archetypes/${slug}`,
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
        {error || "Failed to load data."}
      </div>
    );
  }

  const weeklyItems = data.weeklyGrowth.map((w) => ({ label: w.week.slice(5), value: w.count }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Users" value={data.total} />
        <StatCard label="V4↔V5 Agreement" value={`${data.v5AgreementRate}%`} />
        <StatCard label="Weeks Tracked" value={data.weeklyGrowth.length} />
      </div>

      {weeklyItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Weekly Growth</h3>
          <BarChart items={weeklyItems} direction="vertical" />
        </div>
      )}
    </div>
  );
}
