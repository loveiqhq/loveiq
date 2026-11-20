"use client";

import { useState } from "react";
import miraConfig from "@features/mira/content/mira-config.json";

type Question = (typeof miraConfig.intakeQuestions)[number];

const chip =
  "min-h-[40px] rounded-full border border-ap-mist px-4 text-[13px] text-[#561dbd] hover:border-ap-purple";

/**
 * The answers to the intake question Mira just asked (her reply's [[ASK:id]] marker), as buttons
 * under it, from Sanjin's coach config: pick one, pick any (then Send answer), a 1 to 7 scale, or a
 * time slot. An open question has none. Every question can be skipped, and typing works too:
 * a tap only sends the answer's words as the person's message.
 */
export function IntakeAnswers({
  questionId,
  onAnswer,
  onSkip,
}: {
  questionId: string;
  onAnswer: (text: string) => void;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const q: Question | undefined = miraConfig.intakeQuestions.find((x) => x.id === questionId);
  if (!q) return null;
  const skip = (
    <button type="button" onClick={onSkip} className={`${chip} text-ap-muted`}>
      Skip this one
    </button>
  );

  if (q.answerType === "likert") {
    return (
      <div role="group" aria-label="Your answer, 1 to 7" className="flex flex-col gap-1 pl-1">
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} of 7`}
              onClick={() => onAnswer(`${n} of 7`)}
              className="min-h-[44px] min-w-[44px] rounded-full border border-ap-mist text-[14px] text-[#561dbd] hover:border-ap-purple"
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex max-w-[360px] justify-between text-[12px] text-ap-muted">
          <span>{q.options[0]}</span>
          <span>{q.options[1]}</span>
        </div>
        <div>{skip}</div>
      </div>
    );
  }

  if (q.answerType === "multi") {
    const toggle = (o: string) =>
      setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]));
    return (
      <div role="group" aria-label="Your answer: pick any" className="flex flex-wrap gap-2 pl-1">
        {q.options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={picked.includes(o)}
            onClick={() => toggle(o)}
            className={`${chip} ${picked.includes(o) ? "border-ap-purple bg-ap-lilac font-semibold" : ""}`}
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={() => onAnswer(q.options.filter((o) => picked.includes(o)).join(", "))}
          className="min-h-[40px] rounded-full bg-black px-4 text-[13px] font-bold text-white disabled:opacity-40"
        >
          Send answer
        </button>
        {skip}
      </div>
    );
  }

  return (
    <div role="group" aria-label="Your answer" className="flex flex-wrap gap-2 pl-1">
      {q.options.map((o) => (
        <button key={o} type="button" onClick={() => onAnswer(o)} className={chip}>
          {o}
        </button>
      ))}
      {skip}
    </div>
  );
}
