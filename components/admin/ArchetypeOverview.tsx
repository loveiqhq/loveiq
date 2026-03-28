"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";

interface ArchetypeSummary {
  slug: string;
  name: string;
  v4Count: number;
  v5Count: number;
  pctOfTotal: number;
  weeklyTrend: number[];
}

interface OverviewData {
  archetypes: ArchetypeSummary[];
  totalScored: number;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const width = 60;
  const height = 20;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * height}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-accent-purple"
      />
    </svg>
  );
}

export default function ArchetypeOverview() {
  const { data, loading, error } = useAdminFetch<OverviewData>("/api/admin/archetypes");

  const sorted = useMemo(
    () => (data?.archetypes ?? []).slice().sort((a, b) => b.v4Count - a.v4Count),
    [data]
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
        {error || "Failed to load archetype data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-text-muted">
        {data.totalScored} scored submissions across 14 archetypes
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((arch) => (
          <a
            key={arch.slug}
            href={`/admin/archetypes/${arch.slug}`}
            className="group rounded-xl border border-white/10 bg-surface p-5 transition hover:border-accent-purple/40 hover:bg-white/5"
          >
            <h3 className="font-serif text-base font-semibold text-text-primary group-hover:text-accent-purple">
              {arch.name}
            </h3>
            <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
              <span>V4: {arch.v4Count}</span>
              <span>V5: {arch.v5Count}</span>
              <span>{arch.pctOfTotal}%</span>
            </div>
            <div className="mt-2">
              <Sparkline data={arch.weeklyTrend} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
