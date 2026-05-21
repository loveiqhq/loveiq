"use client";

import QuestionRow from "@features/admin/ui/answer-explorer/QuestionRow";

interface DistributionData {
  single: Array<{ q_id: string; option_text: string; count: number }>;
  multiple: Array<{ q_id: string; option_text: string; count: number }>;
  scale: Array<{ q_id: string; bucket: string; count: number }>;
  open_top: Array<{ q_id: string; answer_text: string; count: number }>;
}

interface ChapterAccordionProps {
  chapter: string;
  questions: Array<{ qId: string; question: string; type: string }>;
  distributionData: DistributionData;
  expandedQuestions: Set<string>;
  onToggle: (qId: string) => void;
  onToggleChapter: () => void;
}

function getDistributionForQuestion(
  qId: string,
  type: string,
  data: DistributionData
): Array<{ label: string; value: number }> {
  if (type === "single" || type === "country") {
    return (data.single ?? [])
      .filter((r) => r.q_id === qId)
      .map((r) => ({ label: r.option_text, value: r.count }));
  }
  if (type === "multiple") {
    return (data.multiple ?? [])
      .filter((r) => r.q_id === qId)
      .map((r) => ({ label: r.option_text, value: r.count }));
  }
  if (type === "scale") {
    return (data.scale ?? [])
      .filter((r) => r.q_id === qId)
      .map((r) => ({ label: r.bucket, value: r.count }));
  }
  if (type === "open") {
    return (data.open_top ?? [])
      .filter((r) => r.q_id === qId)
      .map((r) => ({ label: r.answer_text, value: r.count }));
  }
  return [];
}

export default function ChapterAccordion({
  chapter,
  questions,
  distributionData,
  expandedQuestions,
  onToggle,
  onToggleChapter,
}: ChapterAccordionProps) {
  const anyExpanded = questions.some((q) => expandedQuestions.has(q.qId));

  return (
    <div className="rounded-xl border border-white/10 bg-surface">
      <button
        onClick={onToggleChapter}
        className="flex w-full items-center justify-between rounded-t-xl bg-white/5 px-4 py-3 transition hover:bg-white/[0.08]"
      >
        <span className="font-serif text-base font-semibold text-text-primary">{chapter}</span>
        <svg
          className={`h-5 w-5 shrink-0 text-text-muted transition-transform ${anyExpanded ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className="divide-y divide-white/5">
        {questions.map((q) => {
          const distribution = getDistributionForQuestion(q.qId, q.type, distributionData);
          return (
            <QuestionRow
              key={q.qId}
              qId={q.qId}
              question={q.question}
              type={q.type}
              distribution={distribution}
              isExpanded={expandedQuestions.has(q.qId)}
              onToggle={() => onToggle(q.qId)}
            />
          );
        })}
      </div>
    </div>
  );
}
