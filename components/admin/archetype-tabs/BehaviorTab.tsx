"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import StatCard from "@/components/admin/StatCard";

interface ArchetypeData {
  total: number;
  behavior: {
    avgDurationMin: number;
    total: number;
  };
  v5AgreementRate: number;
}

export default function BehaviorTab({ slug, days }: { slug: string; days: number }) {
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

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Total Users" value={data.total} />
      <StatCard label="Avg Duration" value={`${data.behavior.avgDurationMin}m`} />
      <StatCard label="V4↔V5 Agreement" value={`${data.v5AgreementRate}%`} />
    </div>
  );
}
