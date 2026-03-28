"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@/components/admin/hooks/useAdminFetch";
import BarChart from "@/components/admin/BarChart";

interface QuestionScore {
  questionId: number;
  frontendQid: string;
  questionText: string;
  compositeScore: number;
  skipRate: number;
  avgTimeSec: number;
}

interface ScorecardData {
  scorecard: QuestionScore[];
}

export default function TrendsTab({ days }: { days: number }) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ScorecardData>("/api/admin/scorecard", params);

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

  const scoreItems = data.scorecard.map((q) => ({
    label: q.frontendQid,
    value: q.compositeScore,
  }));

  const skipItems = data.scorecard
    .filter((q) => q.skipRate > 0)
    .sort((a, b) => b.skipRate - a.skipRate)
    .slice(0, 15)
    .map((q) => ({ label: q.frontendQid, value: q.skipRate }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Composite Score by Question</h3>
        <BarChart items={scoreItems} direction="vertical" />
      </div>

      {skipItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Skip Rates (%)</h3>
          <BarChart items={skipItems} direction="horizontal" />
        </div>
      )}
    </div>
  );
}
