"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
import { surveyQuestions } from "@/data/survey-data";
import { useSurveyState, type AnswerValue } from "./hooks/useSurveyState";
import SurveyHeader from "./SurveyHeader";
import SurveyNav from "./SurveyNav";
import GuidancePanel from "./GuidancePanel";
import OpenResponseQuestion from "./questions/OpenResponseQuestion";
import ScaleQuestion from "./questions/ScaleQuestion";
import SingleChoiceQuestion from "./questions/SingleChoiceQuestion";
import MultipleChoiceQuestion from "./questions/MultipleChoiceQuestion";
import CountryQuestion from "./questions/CountryQuestion";
import {
  trackSurveyStart,
  trackSurveyAnswer,
  trackSurveyComplete,
  trackSurveyPause,
} from "@/lib/analytics";
import { useSubmitSurvey } from "./hooks/useSubmitSurvey";
import { useSurveyTracking } from "./hooks/useSurveyTracking";
import { useUtmCapture } from "./hooks/useUtmCapture";
import { usePartialSave } from "./hooks/usePartialSave";
import SurveyConfirmation from "./SurveyConfirmation";
import PreReportWizard from "./PreReportWizard";
import ProcessingSequence from "./ProcessingSequence";
import ReportReady from "./ReportReady";

type CompletionPhase = "processing" | "ready" | "wizard" | "done";

interface SurveyEngineProps {
  onExit: () => void;
}

const SurveyEngine: FC<SurveyEngineProps> = ({ onExit }) => {
  const { answers, currentIndex, startedAt, progress, setAnswer, getAnswer, setCurrentIndex } =
    useSurveyState();
  const { submit: submitSurvey, status: submitStatus } = useSubmitSurvey();
  const utmTracker = useUtmCapture();
  const { savePartial } = usePartialSave(answers, currentIndex, startedAt, utmTracker);

  const [animKey, setAnimKey] = useState(0);
  const hasTrackedStart = useRef(false);
  const hasCompleted = useRef(false);
  const touchStartX = useRef<number | null>(null);

  // Post-survey completion phase management
  const [completionPhase, setCompletionPhase] = useState<CompletionPhase>("processing");

  const question = surveyQuestions[currentIndex];
  const totalQuestions = surveyQuestions.length;

  // Track survey start once
  useEffect(() => {
    if (!hasTrackedStart.current) {
      hasTrackedStart.current = true;
      trackSurveyStart();
    }
  }, []);

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

  const isEmailValid = useMemo(() => {
    if (question?.inputType !== "email") return true;
    if (!currentAnswer || typeof currentAnswer !== "string") return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentAnswer);
  }, [question, currentAnswer]);

  const [attemptedNext, setAttemptedNext] = useState(false);

  const { trackNavigation } = useSurveyTracking(currentIndex, hasAnswer, question);

  // Navigation
  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index > totalQuestions) return;
      setAnimKey((k) => k + 1);
      setAttemptedNext(false);
      setCurrentIndex(index);
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    [totalQuestions, setCurrentIndex]
  );

  const goNext = useCallback(() => {
    if (!isEmailValid) {
      setAttemptedNext(true);
      return;
    }
    if (currentIndex >= totalQuestions - 1) {
      if (hasCompleted.current) return;
      hasCompleted.current = true;
      trackNavigation("complete");
      const duration = Date.now() - new Date(startedAt).getTime();
      trackSurveyComplete(duration);
      submitSurvey(answers, startedAt, utmTracker);
      goTo(totalQuestions); // one past the end → triggers completion
      return;
    }
    savePartial();
    trackNavigation("forward");
    if (question) {
      trackSurveyAnswer(question.qId, question.chapter);
    }
    goTo(currentIndex + 1);
  }, [
    currentIndex,
    totalQuestions,
    startedAt,
    question,
    goTo,
    submitSurvey,
    answers,
    trackNavigation,
    isEmailValid,
    utmTracker,
    savePartial,
  ]);

  const goPrev = useCallback(() => {
    trackNavigation("back");
    goTo(currentIndex - 1);
  }, [currentIndex, goTo, trackNavigation]);

  const handlePause = useCallback(() => {
    savePartial();
    trackNavigation("abandon");
    if (question) {
      trackSurveyPause(question.qId, progress);
    }
    onExit();
  }, [question, progress, onExit, trackNavigation, savePartial]);

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

  // Survey complete — phase-based rendering
  if (!question || currentIndex >= totalQuestions) {
    // Processing sequence phase (5 animated steps)
    if (completionPhase === "processing") {
      return (
        <ProcessingSequence
          submitDone={submitStatus === "success" || submitStatus === "error"}
          onComplete={() => {
            if (submitStatus === "error") {
              setCompletionPhase("done");
            } else {
              setCompletionPhase("ready");
            }
          }}
        />
      );
    }

    // Report ready screen (after processing, before wizard)
    if (completionPhase === "ready") {
      return (
        <ReportReady
          name={(answers["00001"] as string) || ""}
          email={(answers["00000"] as string) || ""}
          onContinue={() => setCompletionPhase("wizard")}
        />
      );
    }

    // Pre-report wizard phase
    if (completionPhase === "wizard") {
      return <PreReportWizard onComplete={onExit} />;
    }

    // Error confirmation only
    return <SurveyConfirmation status={submitStatus} onExit={onExit} />;
  }
  // Status text for nav
  const statusText = `Question ${currentIndex + 1} of ${totalQuestions}`;

  const canGoNext = (hasAnswer && isEmailValid) || !question.required;

  return (
    <main className="relative flex min-h-screen flex-col bg-[#0a0510]">
      {/* Background gradient blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[rgba(167,139,250,0.06)] blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-[rgba(254,104,57,0.04)] blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-[768px] flex-1 flex-col gap-6 px-6 pb-[100px] pt-6 sm:pb-32 sm:pt-10">
        {/* Header */}
        <SurveyHeader progress={progress} onPause={handlePause} />

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
                forceValidation={attemptedNext}
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
            {question.answerType === "country" && (
              <CountryQuestion
                question={question}
                value={currentAnswer as string | null}
                onChange={handleChange}
              />
            )}
          </div>

          {/* Guidance panel */}
          <div className="mt-4">
            <GuidancePanel question={question} />
          </div>
        </div>

        {/* Navigation — fixed bottom bar on mobile, sticky glass card on desktop */}
        <div className="fixed bottom-0 left-0 right-0 z-20 rounded-tl-[24px] rounded-tr-[24px] border-t border-white/10 bg-[rgba(10,5,16,0.8)] px-6 py-4 backdrop-blur-xl sm:sticky sm:bottom-6 sm:left-auto sm:right-auto sm:rounded-2xl sm:border sm:border-white/10">
          <SurveyNav
            canGoBack={currentIndex > 0}
            canGoNext={canGoNext}
            hasAnswer={hasAnswer}
            statusText={statusText}
            onPrevious={goPrev}
            onNext={goNext}
          />
        </div>
      </div>
    </main>
  );
};

export default SurveyEngine;
