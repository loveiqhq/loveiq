"use client";

import { useState, useRef, useEffect, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface GuidancePanelProps {
  question: SurveyQuestion;
}

const BookIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0 text-white/90"
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

const GuidancePanel: FC<GuidancePanelProps> = ({ question }) => {
  const [insightOpen, setInsightOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!insightOpen) return;
    if (window.innerWidth >= 640) return; // desktop: no-op

    const id = setTimeout(() => {
      if (!panelRef.current) return;
      const rect = panelRef.current.getBoundingClientRect();
      // scrollHeight = full content height regardless of maxHeight clipping
      const projectedBottom = rect.top + panelRef.current.scrollHeight;
      const overflow = projectedBottom - window.innerHeight;
      if (overflow > 0) {
        window.scrollBy({ top: overflow + 32, behavior: "smooth" });
      }
    }, 50);

    return () => clearTimeout(id);
  }, [insightOpen]);

  const supportText = question.supportAndGuidance || question.guide;
  const hasInsight =
    (question.answerOptionsExplained && question.answerOptionsExplained.length > 0) ||
    question.howAnswerIsUsed ||
    question.comment;
  const hasContent = supportText || hasInsight;

  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-8">
      {/* Always-visible: Support and guidance */}
      {supportText && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <BookIcon />
            <h4 className="font-serif text-[16px] font-semibold text-white/90 sm:text-[20px]">
              Support and guidance
            </h4>
          </div>
          <p className="font-sans text-[13px] leading-[1.6] text-white/70">{supportText}</p>
        </div>
      )}

      {/* Learn more toggle — only if there's insight content */}
      {hasInsight && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setInsightOpen((o) => !o)}
            className="flex items-center gap-2 rounded-full border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.1)] px-6 py-2.5 font-sans text-[13px] font-medium text-[#e0d9ff] shadow-[0_0_2px_rgba(167,139,250,0.03)] transition hover:bg-[rgba(167,139,250,0.15)]"
          >
            <HelpCircleIcon />
            <span>
              {insightOpen ? (
                "Hide details"
              ) : (
                <>
                  <span className="sm:hidden">Learn more about question</span>
                  <span className="hidden sm:inline">
                    Learn more about this question &amp; how to answer
                  </span>
                </>
              )}
            </span>
            <ChevronIcon open={insightOpen} />
          </button>

          {/* Helper text below button */}
          {!insightOpen && (
            <p className="font-sans text-[10px] tracking-[0.25px] text-white/55">
              Tap to explore context, tips &amp; reassurance
            </p>
          )}

          {/* Collapsible insight panel */}
          <div
            ref={panelRef}
            className="mt-3 w-full overflow-hidden transition-all duration-300 ease-out"
            style={{
              maxHeight: insightOpen ? "2000px" : "0px",
              opacity: insightOpen ? 1 : 0,
            }}
          >
            <div className="flex flex-col gap-5 rounded-[16px] border border-white/[0.08] bg-white/[0.03] p-5 sm:p-[25px]">
              {/* Answer options explained */}
              {question.answerOptionsExplained && question.answerOptionsExplained.length > 0 && (
                <div className="flex flex-col gap-3 border-b border-white/[0.06] pb-5">
                  <div className="flex items-center gap-2">
                    <HelpCircleIcon />
                    <h4 className="font-serif text-[16px] font-semibold text-white/90 sm:text-[20px]">
                      Answer option(s) explained
                    </h4>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {question.answerOptionsExplained.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-[14px] border border-white/[0.05] bg-white/[0.03] px-4 py-3.5"
                      >
                        <p className="font-sans text-[13px] font-medium leading-[18px] text-white/90">
                          {item.option.replace(/^\s*\d+\s*=\s*/, "")}
                        </p>
                        <p className="mt-1 font-sans text-[13px] font-light leading-[21px] text-white/50">
                          {item.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* How this answer will be used */}
              {(question.howAnswerIsUsed || question.comment) && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <HelpCircleIcon />
                    <h4 className="font-serif text-[16px] font-semibold text-white/90 sm:text-[20px]">
                      How this answer will be used
                    </h4>
                  </div>
                  <p className="font-sans text-[13px] font-light leading-[21px] text-white/60">
                    {question.howAnswerIsUsed || question.comment}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuidancePanel;
