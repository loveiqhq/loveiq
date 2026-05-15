"use client";

import { useState, useMemo, useCallback } from "react";
import { surveyQuestions } from "@/data/survey-data";
import { useAdminFetch } from "@features/admin/ui/hooks/useAdminFetch";
import AnswerFilterBar from "@features/admin/ui/answer-explorer/AnswerFilterBar";
import ChapterAccordion from "@features/admin/ui/answer-explorer/ChapterAccordion";

interface DistributionData {
  single: Array<{ q_id: string; option_text: string; count: number }>;
  multiple: Array<{ q_id: string; option_text: string; count: number }>;
  scale: Array<{ q_id: string; bucket: string; count: number }>;
  open_top: Array<{ q_id: string; answer_text: string; count: number }>;
}

export default function AnswerExplorer() {
  const [days, setDays] = useState(0);
  const [archetype, setArchetype] = useState("");
  const [utm, setUtm] = useState("");
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (days > 0) p.days = String(days);
    if (archetype) p.archetype = archetype;
    if (utm) p.utm = utm;
    return p;
  }, [days, archetype, utm]);

  const { data, loading, error } = useAdminFetch<DistributionData>(
    "/api/admin/answers/distribution",
    params
  );

  const chapters = useMemo(() => {
    const map = new Map<string, Array<{ qId: string; question: string; type: string }>>();
    for (const q of surveyQuestions) {
      if (!map.has(q.chapter)) map.set(q.chapter, []);
      map.get(q.chapter)!.push({
        qId: q.qId,
        question: q.question,
        type: q.answerType,
      });
    }
    return Array.from(map.entries()).map(([chapter, questions]) => ({ chapter, questions }));
  }, []);

  const handleToggle = useCallback((qId: string) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) {
        next.delete(qId);
      } else {
        next.add(qId);
      }
      return next;
    });
  }, []);

  const handleToggleChapter = useCallback((chapterQuestions: Array<{ qId: string }>) => {
    setExpandedQuestions((prev) => {
      const allExpanded = chapterQuestions.every((q) => prev.has(q.qId));
      const next = new Set(prev);
      for (const q of chapterQuestions) {
        if (allExpanded) {
          next.delete(q.qId);
        } else {
          next.add(q.qId);
        }
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      <AnswerFilterBar
        days={days}
        archetype={archetype}
        utm={utm}
        onDaysChange={setDays}
        onArchetypeChange={setArchetype}
        onUtmChange={setUtm}
      />

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-purple" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center text-sm text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-3">
          {chapters.map(({ chapter, questions }) => (
            <ChapterAccordion
              key={chapter}
              chapter={chapter}
              questions={questions}
              distributionData={data}
              expandedQuestions={expandedQuestions}
              onToggle={handleToggle}
              onToggleChapter={() => handleToggleChapter(questions)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
