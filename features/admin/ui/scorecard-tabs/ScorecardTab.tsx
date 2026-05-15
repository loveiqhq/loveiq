"use client";

import { useMemo } from "react";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";

interface QuestionScore {
  questionId: number;
  frontendQid: string;
  questionText: string;
  totalAnswers: number;
  skipRate: number;
  avgTimeSec: number;
  avgRevisions: number;
  compositeScore: number;
  status: "green" | "yellow" | "red";
}

interface ScorecardData {
  scorecard: QuestionScore[];
}

const statusIcon: Record<string, string> = {
  green: "text-emerald-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
};

export default function ScorecardTab({
  days,
  question,
}: {
  days: number;
  question?: string | null;
}) {
  const params = useMemo(() => (days > 0 ? { days: String(days) } : undefined), [days]);
  const { data, loading, error } = useAdminFetch<ScorecardData>("/api/admin/scorecard", params);
  const focusedRows = useMemo(() => {
    const rows = data?.scorecard ?? [];
    if (!question) return rows;
    const needle = question.toLowerCase();
    return rows.filter(
      (row) =>
        row.frontendQid.toLowerCase() === needle || row.questionText.toLowerCase().includes(needle)
    );
  }, [data, question]);

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
        {error || "Failed to load scorecard data."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="px-3 py-2.5 text-left font-medium text-text-muted">Status</th>
            <th className="px-3 py-2.5 text-left font-medium text-text-muted">Question</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">Score</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">Skip %</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">Avg Time</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">Avg Revisions</th>
            <th className="px-3 py-2.5 text-right font-medium text-text-muted">Answers</th>
          </tr>
        </thead>
        <tbody>
          {focusedRows.map((questionRow) => (
            <tr
              key={questionRow.questionId}
              className={`border-b border-white/5 transition hover:bg-white/5 ${
                question &&
                (questionRow.frontendQid.toLowerCase() === question.toLowerCase() ||
                  questionRow.questionText.toLowerCase().includes(question.toLowerCase()))
                  ? "bg-accent-purple/5"
                  : ""
              }`}
            >
              <td className="px-3 py-2">
                <span className={`text-lg ${statusIcon[questionRow.status]}`}>●</span>
              </td>
              <td
                className="max-w-xs truncate px-3 py-2 text-text-primary"
                title={questionRow.questionText}
              >
                <span className="mr-2 text-text-muted">{questionRow.frontendQid}</span>
                {questionRow.questionText}
              </td>
              <td className={`px-3 py-2 text-right font-medium ${statusIcon[questionRow.status]}`}>
                {questionRow.compositeScore}
              </td>
              <td className="px-3 py-2 text-right text-text-primary">{questionRow.skipRate}%</td>
              <td className="px-3 py-2 text-right text-text-primary">{questionRow.avgTimeSec}s</td>
              <td className="px-3 py-2 text-right text-text-primary">{questionRow.avgRevisions}</td>
              <td className="px-3 py-2 text-right text-text-muted">{questionRow.totalAnswers}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {question && focusedRows.length === 0 && (
        <div className="border-t border-white/10 px-4 py-3 text-sm text-text-muted">
          No scorecard rows matched the focused question.
        </div>
      )}
    </div>
  );
}
