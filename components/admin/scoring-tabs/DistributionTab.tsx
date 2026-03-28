"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import BarChart from "@/components/admin/BarChart";

interface ScoringData {
  v4Distribution: Array<{ archetype: string; count: number }>;
  v5Distribution: Array<{ archetype: string; count: number }>;
}

export default function DistributionTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ScoringData>(
    "/api/admin/scoring/comparison",
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

  const v4Items = data.v4Distribution.map((d) => ({ label: d.archetype, value: d.count }));
  const v5Items = data.v5Distribution.map((d) => ({ label: d.archetype, value: d.count }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">V4 Archetype Distribution</h3>
        <BarChart items={v4Items} direction="horizontal" />
      </div>
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">V5 Archetype Distribution</h3>
        <BarChart items={v5Items} direction="horizontal" />
      </div>
    </div>
  );
}
