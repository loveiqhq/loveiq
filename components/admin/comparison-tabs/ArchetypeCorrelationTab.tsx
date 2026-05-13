"use client";

import { useState, useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import TimeRangeSelector from "@/components/admin/TimeRangeSelector";
import StatCard from "@/components/admin/StatCard";
import HeatmapGrid from "@/components/admin/comparison-tabs/HeatmapGrid";

const ARCHETYPES = [
  "Spark Seeker",
  "Sensual Connector",
  "Radiant Performer",
  "Explorer of Edges",
  "Curious Apprentice",
  "Quiet Withdrawer",
  "Romantic Idealist",
  "Authority Conductor",
  "Fluid Adventurer",
  "Mindful Balancer",
  "Healing Journeyer",
  "Intimate Technician",
  "Nurturing Caregiver",
  "Erotic Intellectual",
] as const;

interface CorrelationEntry {
  v4: string;
  v5: string;
  count: number;
}

export default function ArchetypeCorrelationTab() {
  const [days, setDays] = useState(0);
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<CorrelationEntry[]>(
    "/api/admin/comparisons/correlation",
    params
  );

  const stats = useMemo(() => {
    if (!data || data.length === 0) return null;

    let totalScored = 0;
    let agreementCount = 0;
    const mappingCounts = new Map<string, number>();

    for (const entry of data) {
      totalScored += entry.count;
      if (entry.v4 === entry.v5) agreementCount += entry.count;
      const key = `${entry.v4} -> ${entry.v5}`;
      mappingCounts.set(key, (mappingCounts.get(key) ?? 0) + entry.count);
    }

    let mostCommonMapping = "--";
    let mostCommonCount = 0;
    for (const [mapping, count] of mappingCounts) {
      if (count > mostCommonCount) {
        mostCommonMapping = mapping;
        mostCommonCount = count;
      }
    }

    const agreementRate = totalScored > 0 ? Math.round((agreementCount / totalScored) * 100) : 0;

    return { totalScored, mostCommonMapping, mostCommonCount, agreementRate };
  }, [data]);

  // Determine which archetypes appear in the data for rows/cols
  const { rows, cols } = useMemo(() => {
    if (!data || data.length === 0) {
      return { rows: [...ARCHETYPES], cols: [...ARCHETYPES] };
    }
    const v4Set = new Set<string>();
    const v5Set = new Set<string>();
    for (const entry of data) {
      v4Set.add(entry.v4);
      v5Set.add(entry.v5);
    }
    // Use archetype order from ARCHETYPES, only include those that appear
    const orderedRows = ARCHETYPES.filter((a) => v4Set.has(a));
    const orderedCols = ARCHETYPES.filter((a) => v5Set.has(a));
    return {
      rows: orderedRows.length > 0 ? orderedRows : [...ARCHETYPES],
      cols: orderedCols.length > 0 ? orderedCols : [...ARCHETYPES],
    };
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
      {/* Time range */}
      <div className="flex items-center justify-between">
        <TimeRangeSelector value={days} onChange={setDays} />
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Total Scored" value={stats.totalScored} />
          <StatCard
            label="Most Common Mapping"
            value={stats.mostCommonCount}
            sub={stats.mostCommonMapping}
          />
          <StatCard label="Agreement Rate" value={`${stats.agreementRate}%`} sub="V4 == V5 match" />
        </div>
      )}

      {/* Heatmap */}
      {data && data.length > 0 ? (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold text-text-primary">
              V4 vs V5 Archetype Correlation
            </h4>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>V4 (rows)</span>
              <span className="text-white/30">/</span>
              <span>V5 (columns)</span>
            </div>
          </div>
          <HeatmapGrid rows={[...rows]} cols={[...cols]} data={data} />
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-text-muted">
          No scoring data available for the selected time range.
        </div>
      )}
    </div>
  );
}
