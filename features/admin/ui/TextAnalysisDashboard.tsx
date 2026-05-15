"use client";

import { useState, useMemo } from "react";
import TimeRangeSelector from "@features/admin/ui/TimeRangeSelector";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import StatCard from "@features/admin/ui/StatCard";
import WordCloudDisplay from "@features/admin/ui/text-analysis/WordCloudDisplay";
import ResponseList from "@features/admin/ui/text-analysis/ResponseList";

interface QuestionSummary {
  questionId: string;
  questionText: string;
  responseCount: number;
  avgLength: number;
}

interface TextAnalysisData {
  questions: QuestionSummary[];
  keywords: Array<{ word: string; count: number }>;
  responses: Array<{ id: number; text: string; archetype: string }>;
  totalResponses: number;
  avgLength: number;
  responseCount: number;
}

export default function TextAnalysisDashboard() {
  const [days, setDays] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState("");

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (days > 0) p.days = String(days);
    if (selectedQuestion) p.questionId = selectedQuestion;
    return Object.keys(p).length > 0 ? p : undefined;
  }, [days, selectedQuestion]);

  const { data, loading, error } = useAdminFetch<TextAnalysisData>(
    "/api/admin/text-analysis",
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
        {error || "Failed to load text analysis data."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <TimeRangeSelector value={days} onChange={setDays} />
        <select
          value={selectedQuestion}
          onChange={(e) => setSelectedQuestion(e.target.value)}
          className="rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-text-primary"
        >
          <option value="">All open-text questions</option>
          {data.questions.map((q) => (
            <option key={q.questionId} value={q.questionId}>
              {q.questionText} ({q.responseCount})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Responses" value={data.totalResponses} />
        <StatCard label="Questions with Text" value={data.questions.length} />
        <StatCard label="Avg Response Length" value={`${data.avgLength} chars`} />
        <StatCard label="Filtered Responses" value={data.responseCount} />
      </div>

      {data.keywords.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium text-text-primary">Top Keywords</h3>
          <WordCloudDisplay keywords={data.keywords} />
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-surface p-5">
        <h3 className="mb-4 text-sm font-medium text-text-primary">Responses</h3>
        <ResponseList responses={data.responses} />
      </div>
    </div>
  );
}
