"use client";

import { useId, useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import { trackSurveyGuidanceExpanded } from "@features/analytics/client";

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

const Row: FC<{ label: string; text: string; questionId: string }> = ({
  label,
  text,
  questionId,
}) => {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    trackSurveyGuidanceExpanded({ question_id: questionId, section: "why", expanded: next });
  };

  return (
    // The hairline is 1px of the frame's 12.8px top padding (Figma 11303:214).
    <div className="border-t border-[rgba(22,16,33,0.09)]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
        className="flex w-full items-center gap-[6.4px] rounded-sm pt-[11.8px] text-left font-sans text-[13px] font-semibold leading-[19px] text-[#6b5b95] transition-colors hover:text-[#4f4270] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6b5b95]/40"
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
 * "Why we ask this", closed until tapped (Figma 11303:174). The frame had an "Info &
 * guidance" row above it too, which repeated the guide line; it went when the guidance
 * became permanently shown under the title (Marcus and Mark, LoveIQ Sync 2026-10-06).
 */
const GuidancePanel: FC<GuidancePanelProps> = ({ question }) => {
  const why = question.howAnswerIsUsed || question.comment || "";

  if (!why) return null;

  return <Row label="Why we ask this" text={why} questionId={question.qId} />;
};

export default GuidancePanel;
