"use client";

import { useId, useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { trackSurveyGuidanceExpanded } from "@features/analytics/client";
import { questionGuide } from "./questions/QuestionHeading";

interface GuidancePanelProps {
  question: SurveyQuestion;
}

const Chevron: FC<{ open: boolean }> = ({ open }) => (
  <svg
    aria-hidden
    className={`h-[13px] w-[13px] shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const Row: FC<{
  label: string;
  text: string;
  questionId: string;
  section: "info" | "why";
  divider?: boolean;
}> = ({ label, text, questionId, section, divider }) => {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    trackSurveyGuidanceExpanded({ question_id: questionId, section, expanded: next });
  };

  return (
    <div className={divider ? "border-t border-[rgba(22,16,33,0.09)]" : undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className={`flex w-full items-center gap-[6.4px] rounded-sm ${divider ? "pt-[11.8px]" : "pt-[12.8px]"} text-left font-sans text-[13px] font-semibold leading-[19px] text-[#6b5b95] transition-colors hover:text-[#4f4270] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b5b95]/40`}
      >
        <Chevron open={open} />
        {label}
      </button>
      <p
        id={bodyId}
        hidden={!open}
        className="whitespace-pre-line pl-[19.4px] pt-2 font-sans text-[13.5px] leading-[20.25px] text-[#4a4458]"
      >
        {text}
      </p>
    </div>
  );
};

/**
 * "Info & guidance" and "Why we ask this", both closed until tapped (Figma
 * 11303:174). Info repeats the guide line under the title, as the frame does, and
 * adds the answer instruction when the question has a separate one.
 */
const GuidancePanel: FC<GuidancePanelProps> = ({ question }) => {
  const guide = questionGuide(question);
  const info =
    question.formatGuidance && question.formatGuidance !== guide
      ? `${guide}\n${question.formatGuidance}`
      : guide;
  const why = question.howAnswerIsUsed || question.comment || "";

  if (!info && !why) return null;

  return (
    <div className="flex flex-col gap-5">
      {info && <Row label="Info & guidance" text={info} questionId={question.qId} section="info" />}
      {why && (
        <Row label="Why we ask this" text={why} questionId={question.qId} section="why" divider />
      )}
    </div>
  );
};

export default GuidancePanel;
