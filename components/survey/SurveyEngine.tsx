"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
import { surveyQuestions, chapterIntros, type ChapterIntro } from "@/data/survey-data";
import { useSurveyState, type AnswerValue } from "./hooks/useSurveyState";
import SurveyHeader from "./SurveyHeader";
import SurveyNav from "./SurveyNav";
import GuideAvatar from "./GuideAvatar";
import GuidancePanel from "./GuidancePanel";
import OpenResponseQuestion from "./questions/OpenResponseQuestion";
import ScaleQuestion from "./questions/ScaleQuestion";
import SingleChoiceQuestion from "./questions/SingleChoiceQuestion";
import MultipleChoiceQuestion from "./questions/MultipleChoiceQuestion";
import {
  trackSurveyStart,
  trackSurveyAnswer,
  trackSurveyComplete,
  trackSurveyPause,
} from "@/lib/analytics";

interface SurveyEngineProps {
  onExit: () => void;
}

const SurveyEngine: FC<SurveyEngineProps> = ({ onExit }) => {
  const { currentIndex, startedAt, progress, setAnswer, getAnswer, setCurrentIndex } =
    useSurveyState();

  const [animKey, setAnimKey] = useState(0);
  const [dismissedChapters, setDismissedChapters] = useState<Set<number>>(new Set());
  const hasTrackedStart = useRef(false);
  const touchStartX = useRef<number | null>(null);

  const question = surveyQuestions[currentIndex];
  const totalQuestions = surveyQuestions.length;

  // Track survey start once
  useEffect(() => {
    if (!hasTrackedStart.current) {
      hasTrackedStart.current = true;
      trackSurveyStart();
    }
  }, []);

  // Chapter intro map
  const chapterIntroMap = useMemo(() => {
    const map = new Map<number, ChapterIntro>();
    for (const intro of chapterIntros) {
      map.set(intro.cId, intro);
    }
    return map;
  }, []);

  // Get current chapter intro (if any)
  const currentChapterIntro = question ? chapterIntroMap.get(question.cId) : undefined;

  // Compute pending chapter intro from current position + dismissed set
  const pendingChapterIntro = useMemo<ChapterIntro | null>(() => {
    if (!question) return null;
    const prevQuestion = currentIndex > 0 ? surveyQuestions[currentIndex - 1] : null;
    const isNewChapter = !prevQuestion || prevQuestion.cId !== question.cId;
    if (isNewChapter && !dismissedChapters.has(question.cId)) {
      return chapterIntroMap.get(question.cId) ?? null;
    }
    return null;
  }, [currentIndex, question, chapterIntroMap, dismissedChapters]);

  // Current answer
  const currentAnswer = question ? getAnswer(question.qId) : null;

  // "Other" companion text
  const otherText = question ? ((getAnswer(question.qId + "_other") as string | null) ?? "") : "";

  const handleOtherTextChange = useCallback(
    (text: string) => {
      if (question) setAnswer(question.qId + "_other", text);
    },
    [question, setAnswer]
  );

  const hasAnswer = useMemo(() => {
    if (currentAnswer === null || currentAnswer === undefined) return false;
    if (typeof currentAnswer === "string") return currentAnswer.trim().length > 0;
    if (Array.isArray(currentAnswer)) return currentAnswer.length > 0;
    if (typeof currentAnswer === "number") return true;
    return false;
  }, [currentAnswer]);

  // Navigation
  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= totalQuestions) return;
      setAnimKey((k) => k + 1);
      setCurrentIndex(index);
    },
    [totalQuestions, setCurrentIndex]
  );

  const goNext = useCallback(() => {
    if (currentIndex >= totalQuestions - 1) {
      // Survey complete
      const duration = Date.now() - new Date(startedAt).getTime();
      trackSurveyComplete(duration);
      goTo(totalQuestions); // one past the end → triggers completion
      return;
    }
    if (question) {
      trackSurveyAnswer(question.qId, question.chapter);
    }
    goTo(currentIndex + 1);
  }, [currentIndex, totalQuestions, startedAt, question, goTo]);

  const goPrev = useCallback(() => {
    goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  const handlePause = useCallback(() => {
    if (question) {
      trackSurveyPause(question.qId, progress);
    }
    onExit();
  }, [question, progress, onExit]);

  // Handle answer change
  const handleChange = useCallback(
    (value: AnswerValue) => {
      if (!question) return;
      setAnswer(question.qId, value);
    },
    [question, setAnswer]
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (hasAnswer || !question?.required) {
          e.preventDefault();
          goNext();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [hasAnswer, question, goNext, goPrev]);

  // Touch swipe
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const diff = e.changedTouches[0].clientX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(diff) < 50) return;
      if (diff < 0 && (hasAnswer || !question?.required)) goNext();
      if (diff > 0) goPrev();
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [hasAnswer, question, goNext, goPrev]);

  // Dismiss chapter intro
  const handleDismissIntro = useCallback(() => {
    if (pendingChapterIntro) {
      setDismissedChapters((s) => new Set(s).add(pendingChapterIntro.cId));
    }
  }, [pendingChapterIntro]);

  // Survey complete
  if (!question || currentIndex >= totalQuestions) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0510] px-6 text-center">
        <div
          className="flex flex-col items-center gap-6"
          style={{ animation: "survey-scale-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" }}
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] to-[#a78bfa]">
            <svg
              className="h-10 w-10 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h2 className="font-serif text-[32px] font-bold text-white sm:text-[40px]">
            Survey Complete
          </h2>
          <p className="max-w-md font-sans text-[16px] leading-relaxed text-white/60">
            Thank you for sharing your answers. Your personalized report is being prepared.
          </p>
          <button
            type="button"
            onClick={onExit}
            className="mt-4 rounded-full bg-gradient-to-r from-[#fe6839] to-[#ff8f6b] px-8 py-3 font-sans text-[14px] font-bold text-white shadow-[0_4px_16px_rgba(254,104,57,0.3)] transition hover:shadow-[0_6px_20px_rgba(254,104,57,0.4)]"
          >
            Return to site
          </button>
        </div>
      </main>
    );
  }

  // Status text for nav
  const statusText = hasAnswer
    ? question.answerType === "multiple"
      ? `${(currentAnswer as string[]).length} selected`
      : "Answer saved"
    : question.required
      ? "Select an option"
      : "Optional — skip or answer";

  const canGoNext = hasAnswer || !question.required;

  return (
    <main className="relative flex min-h-screen flex-col bg-[#0a0510]">
      {/* Background gradient blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[rgba(167,139,250,0.06)] blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-[rgba(254,104,57,0.04)] blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-[512px] flex-1 flex-col gap-6 px-5 pb-32 pt-6 sm:pt-10">
        {/* Header */}
        <SurveyHeader chapter={question.chapter} progress={progress} onPause={handlePause} />

        {/* Question with animation */}
        <div
          key={animKey}
          className="flex-1"
          style={{
            animation: "survey-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
          }}
        >
          {/* Question component */}
          <div className="py-4">
            {question.answerType === "open" && (
              <OpenResponseQuestion
                question={question}
                value={currentAnswer as string | null}
                onChange={handleChange}
              />
            )}
            {question.answerType === "scale" && (
              <ScaleQuestion
                question={question}
                value={currentAnswer as number | null}
                onChange={handleChange}
              />
            )}
            {question.answerType === "single" && (
              <SingleChoiceQuestion
                question={question}
                value={currentAnswer as string | null}
                onChange={handleChange}
                otherText={otherText}
                onOtherTextChange={handleOtherTextChange}
              />
            )}
            {question.answerType === "multiple" && (
              <MultipleChoiceQuestion
                question={question}
                value={currentAnswer as string[] | null}
                onChange={handleChange}
                otherText={otherText}
                onOtherTextChange={handleOtherTextChange}
              />
            )}
          </div>

          {/* Guidance panel */}
          <div className="mt-4">
            <GuidancePanel question={question} chapterIntro={currentChapterIntro} />
          </div>
        </div>

        {/* Navigation */}
        <SurveyNav
          canGoBack={currentIndex > 0}
          canGoNext={canGoNext}
          hasAnswer={hasAnswer}
          statusText={statusText}
          onPrevious={goPrev}
          onNext={goNext}
        />
      </div>

      {/* Guide Avatar */}
      <GuideAvatar chapterIntro={pendingChapterIntro} onDismiss={handleDismissIntro} />
    </main>
  );
};

export default SurveyEngine;
