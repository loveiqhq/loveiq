"use client";

import BarChart from "@/components/admin/BarChart";

interface QuestionRowProps {
  qId: string;
  question: string;
  type: string;
  distribution: Array<{ label: string; value: number }>;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function QuestionRow({
  qId,
  question,
  type,
  distribution,
  isExpanded,
  onToggle,
}: QuestionRowProps) {
  const totalResponses = distribution.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="transition hover:bg-white/[0.02]">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="shrink-0 rounded bg-white/5 px-2 py-0.5 text-xs font-mono text-text-muted">
          {qId}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-text-primary">{question}</span>
        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-xs text-text-muted">
          {totalResponses}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
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

      {isExpanded && (
        <div className="px-4 pb-4">
          {distribution.length === 0 ? (
            <p className="py-2 text-center text-xs text-text-muted">No data available</p>
          ) : (
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
              <p className="mb-3 text-xs text-text-muted">
                {type === "scale"
                  ? "Scale buckets"
                  : type === "open"
                    ? "Top answers"
                    : type === "multiple"
                      ? "Multiple choice options"
                      : "Options"}
              </p>
              <BarChart items={distribution} direction="horizontal" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
