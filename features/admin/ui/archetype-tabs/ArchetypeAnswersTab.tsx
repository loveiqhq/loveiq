"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import BarChart from "@features/admin/ui/BarChart";

interface ArchetypeData {
  secondaryArchetypes: Array<{ label: string; count: number }>;
}

export default function ArchetypeAnswersTab({ slug, days }: { slug: string; days: number }) {
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

  const items = data.secondaryArchetypes.map((a) => ({ label: a.label, value: a.count }));

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-4 text-sm font-medium text-text-primary">
        Most Common Secondary Archetypes
      </h3>
      {items.length > 0 ? (
        <BarChart items={items} direction="horizontal" />
      ) : (
        <p className="text-sm text-text-muted">No secondary archetype data available.</p>
      )}
    </div>
  );
}
