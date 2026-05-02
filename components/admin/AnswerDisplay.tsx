interface Answer {
  q_id: string;
  question_text?: string;
  answer_type?: string;
  answer_value: string | string[] | number | null;
  time_spent_seconds?: number | null;
  revision_count?: number | null;
  was_skipped?: boolean;
}

interface AnswerDisplayProps {
  answer: Answer;
}

function formatTimeSpent(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

export default function AnswerDisplay({ answer }: AnswerDisplayProps) {
  const renderValue = () => {
    const val = answer.answer_value;

    if (val === null || val === undefined) {
      return <span className="text-text-muted italic">No answer</span>;
    }

    // Scale answer — show as a bar
    if (answer.answer_type === "scale" && typeof val === "number") {
      const pct = (val / 7) * 100;
      return (
        <div className="flex items-center gap-3">
          <div
            className="h-2 w-32 rounded-full bg-white/5"
            role="img"
            aria-label={`Scale value: ${val} out of 7`}
          >
            <div className="h-2 rounded-full bg-accent-purple/70" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm text-text-primary">{val}/7</span>
        </div>
      );
    }

    // Multiple choice
    if (Array.isArray(val)) {
      return (
        <div className="flex flex-wrap gap-1">
          {val.map((v, i) => (
            <span key={i} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-text-primary">
              {String(v)}
            </span>
          ))}
        </div>
      );
    }

    // Text / single choice
    return <span className="text-sm text-text-primary">{String(val)}</span>;
  };

  const hasMetadata =
    (answer.time_spent_seconds != null && answer.time_spent_seconds > 0) ||
    (answer.revision_count != null && answer.revision_count > 0) ||
    answer.was_skipped;

  return (
    <div className="border-b border-white/5 py-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-text-muted">
          {answer.q_id}
          {answer.question_text ? ` — ${answer.question_text}` : ""}
        </p>
        {hasMetadata && (
          <div className="flex shrink-0 items-center gap-2">
            {answer.was_skipped && (
              <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">
                Skipped
              </span>
            )}
            {answer.revision_count != null && answer.revision_count > 0 && (
              <span className="rounded-full bg-accent-purple/10 px-2 py-0.5 text-[10px] font-medium text-accent-purple">
                {answer.revision_count} revision{answer.revision_count > 1 ? "s" : ""}
              </span>
            )}
            {answer.time_spent_seconds != null && answer.time_spent_seconds > 0 && (
              <span className="text-[10px] text-text-muted">
                {formatTimeSpent(answer.time_spent_seconds)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-1">{renderValue()}</div>
    </div>
  );
}
