"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import BarChart from "@features/admin/ui/BarChart";

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

export default function TrendsTab({ days, question }: { days: number; question?: string | null }) {
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

  const scoreRows = question
    ? data.scorecard.filter(
        (row) =>
          row.frontendQid.toLowerCase() === question.toLowerCase() ||
          row.questionText.toLowerCase().includes(question.toLowerCase())
      )
    : data.scorecard;

  const scoreItems = scoreRows.map((row) => ({
    label: row.frontendQid,
    value: row.compositeScore,
  }));

  const skipItems = scoreRows
    .filter((row) => row.skipRate > 0)
    .sort((a, b) => b.skipRate - a.skipRate)
    .slice(0, 15)
    .map((row) => ({ label: row.frontendQid, value: row.skipRate }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">
          Composite Score by Question
          {question ? ` · ${question}` : ""}
        </h3>
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
