"use client";

import { useState, type FC } from "react";
import type { SurveyQuestion, ChapterIntro } from "@/data/survey-data";

interface GuidancePanelProps {
  question: SurveyQuestion;
  chapterIntro?: ChapterIntro;
}

const BookOpenIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const ChevronIcon: FC<{ open: boolean }> = ({ open }) => (
  <svg
    aria-hidden
    className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const ShieldIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0 text-[#a78bfa]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const InfoIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0 text-white/50"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
);

const ActivityIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0 text-white/50"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const GuidancePanel: FC<GuidancePanelProps> = ({ question, chapterIntro }) => {
  const [open, setOpen] = useState(false);

  const hasContent = question.guide || question.comment || chapterIntro;
  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 self-start rounded-full border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.1)] px-4 py-2 font-sans text-[13px] font-medium text-[#a78bfa] transition hover:bg-[rgba(167,139,250,0.15)]"
      >
        <BookOpenIcon />
        <span>{open ? "Hide Context & Guidance" : "Learn more about this question"}</span>
        <ChevronIcon open={open} />
      </button>

      {/* Collapsible content */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{
          maxHeight: open ? "600px" : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div className="flex flex-col gap-4 rounded-[16px] border border-white/10 bg-white/5 p-5">
          {/* User guidance */}
          {question.guide && (
            <div className="flex gap-3">
              <ShieldIcon />
              <div>
                <h4 className="mb-1 font-sans text-[13px] font-semibold uppercase tracking-wider text-[#a78bfa]">
                  User Guidance
                </h4>
                <p className="font-sans text-[14px] leading-relaxed text-white/60">
                  {question.guide}
                </p>
              </div>
            </div>
          )}

          {/* How answer is used */}
          {question.comment && (
            <div className="flex gap-3">
              <InfoIcon />
              <div>
                <h4 className="mb-1 font-sans text-[13px] font-semibold uppercase tracking-wider text-white/40">
                  How this answer will be used
                </h4>
                <p className="font-sans text-[14px] leading-relaxed text-white/50">
                  {question.comment}
                </p>
              </div>
            </div>
          )}

          {/* Background info from chapter intro */}
          {chapterIntro && (
            <div className="flex gap-3">
              <ActivityIcon />
              <div>
                <h4 className="mb-1 font-sans text-[13px] font-semibold uppercase tracking-wider text-white/40">
                  Background
                </h4>
                <p className="font-sans text-[14px] leading-relaxed text-white/50">
                  {chapterIntro.text}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuidancePanel;
