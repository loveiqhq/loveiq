interface Answer {
  q_id: string;
  question_text?: string;
  answer_type?: string;
  answer_value: string | string[] | number | null;
}

interface AnswerDisplayProps {
  answer: Answer;
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
          <div className="h-2 w-32 rounded-full bg-white/5">
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

  return (
    <div className="border-b border-white/5 py-3">
      <p className="text-xs text-text-muted">
        {answer.q_id}
        {answer.question_text ? ` — ${answer.question_text}` : ""}
      </p>
      <div className="mt-1">{renderValue()}</div>
    </div>
  );
}
