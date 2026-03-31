"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import HeatmapGrid from "@/components/admin/comparison-tabs/HeatmapGrid";

interface ScoringData {
  v4Distribution: Array<{ archetype: string; count: number }>;
  v5Distribution: Array<{ archetype: string; count: number }>;
  driftMatrix: Array<{ v4: string; v5: string; count: number }>;
}

export default function DriftTab({ days }: { days: number }) {
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

  const rows = data.v4Distribution.map((d) => d.archetype);
  const cols = data.v5Distribution.map((d) => d.archetype);

  return (
    <div className="rounded-xl border border-white/10 bg-surface p-5">
      <h3 className="mb-2 text-sm font-medium text-text-primary">V4 → V5 Migration Matrix</h3>
      <p className="mb-3 text-xs text-text-muted">
        Rows = V4 archetype, Columns = V5 archetype. Cells show how many users migrated.
      </p>
      <p className="mb-4 text-xs text-text-muted">
        This view is only for V4 versus V5 scoring migration. Cross-system taxonomy, event, config,
        answer-mapping, and experiment setup drift now lives in Health -&gt; Drift Detector.
      </p>
      <HeatmapGrid rows={rows} cols={cols} data={data.driftMatrix} />
    </div>
  );
}
