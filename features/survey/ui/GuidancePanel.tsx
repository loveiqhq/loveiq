"use client";

import { type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface GuidancePanelProps {
  question: SurveyQuestion;
}

const BookIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#A78BFA"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const HelpCircleIcon: FC = () => (
  <svg aria-hidden className="h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="none">
    <path
      d="M8 14.665c3.682 0 6.667-2.984 6.667-6.666S11.682 1.332 8 1.332 1.333 4.317 1.333 7.999 4.318 14.665 8 14.665Z"
      stroke="#A78BFA"
      strokeWidth="1.333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.06 6c.157-.445.466-.821.873-1.06a1.946 1.946 0 0 1 1.351-.307c.466.08.888.322 1.192.683.304.362.47.819.47 1.291 0 1.334-2 2-2 2"
      stroke="#A78BFA"
      strokeWidth="1.333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8 11.332h.007"
      stroke="#A78BFA"
      strokeWidth="1.333"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const GuidancePanel: FC<GuidancePanelProps> = ({ question }) => {
  const supportText = question.supportAndGuidance || question.guide;
  const howAnswerIsUsed = question.howAnswerIsUsed || question.comment;

  if (!supportText && !howAnswerIsUsed) return null;

  return (
    <div className="flex flex-col gap-8">
      {supportText && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BookIcon />
            <h4 className="font-serif text-[16px] font-semibold text-white/90 sm:text-[20px]">
              Info and guidance
            </h4>
          </div>
          <p className="font-sans text-[13px] leading-[1.6] text-white/70">{supportText}</p>
        </div>
      )}

      {howAnswerIsUsed && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <HelpCircleIcon />
            <h4 className="font-serif text-[16px] font-semibold text-white/90 sm:text-[20px]">
              How this answer will be used
            </h4>
          </div>
          <p className="font-sans text-[13px] leading-[1.6] text-white/70">{howAnswerIsUsed}</p>
        </div>
      )}
    </div>
  );
};

export default GuidancePanel;
