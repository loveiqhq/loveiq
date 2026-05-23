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
  trackSurveyProgress,
  trackSurveyComplete,
  trackSurveyPause,
} from "@features/analytics/client";
import { useSubmitSurvey } from "./hooks/useSubmitSurvey";
import { useSurveyTracking } from "./hooks/useSurveyTracking";
import { useUtmCapture } from "./hooks/useUtmCapture";
import { usePartialSave } from "./hooks/usePartialSave";
import { useAutoAdvance } from "./hooks/useAutoAdvance";
import { clearPersistedSurveyState } from "./hooks/surveyStorage";
import { copySurveySessionToReportSession } from "./hooks/surveySession";
import { getCsrfToken } from "@shared/http/csrf-client";
import { readCookie } from "@shared/observability/cookie";
import SurveyConfirmation from "./SurveyConfirmation";
import PreReportWizard from "./PreReportWizard";
import ProcessingSequence from "./ProcessingSequence";
import ReportReady from "./ReportReady";
import SurveyPauseModal from "./SurveyPauseModal";

type CompletionPhase = "processing" | "ready" | "wizard" | "done";

interface SurveyEngineProps {
  onExit: () => void;
  onComplete: (reportToken?: string | null) => void;
}

const SurveyEngine: FC<SurveyEngineProps> = ({ onExit, onComplete }) => {
  const { answers, currentIndex, startedAt, progress, setAnswer, getAnswer, setCurrentIndex } =
    useSurveyState();
  const {
    submit: submitSurvey,
    retryPending,
    hasPendingCompletion,
    reportToken,
    status: submitStatus,
  } = useSubmitSurvey();
  const utmTracker = useUtmCapture();
  const { savePartial } = usePartialSave(answers, currentIndex, startedAt, utmTracker);

  const { autoAdvance, toggleAutoAdvance } = useAutoAdvance();

  const [animKey, setAnimKey] = useState(0);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [emailConfirmValue, setEmailConfirmValue] = useState("");
  const hasTrackedStart = useRef(false);
  const hasCompleted = useRef(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasCleared = useRef(false);
  const totalQuestions = surveyQuestions.length;
  const question = surveyQuestions[currentIndex];

  // Post-survey completion phase management
  const [completionPhase, setCompletionPhase] = useState<CompletionPhase>(() =>
    currentIndex >= totalQuestions && hasPendingCompletion ? "done" : "processing"
  );

  // Track survey start once
  useEffect(() => {
    if (!hasTrackedStart.current) {
      hasTrackedStart.current = true;
      trackSurveyStart();

      // Server-side engine-mount ping for the daily Slack digest. The
      // funnel_event PK dedupes per (visitor_id, day) so a re-mount in the
      // same day is a no-op server-side.
      const visitorId = readCookie("__Host-liq_vid") || readCookie("__liq_vid");
      if (visitorId) {
        fetch("/api/funnel-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            event: "survey_engine_mount",
            visitor_id: visitorId,
          }),
          keepalive: true,
        }).catch(() => {
          // Best-effort — failure just means the day's count is short by one.
        });
      }
    }
  }, []);

  // Clear persisted storage after successful submission so future visits start fresh.
  // Only clear localStorage/sessionStorage — NOT in-memory state, because the
  // completion screens still need currentIndex >= totalQuestions and answers for name/email.
  useEffect(() => {
    if (submitStatus === "success" && !hasCleared.current) {
      hasCleared.current = true;
      copySurveySessionToReportSession();
      clearPersistedSurveyState({
        clearPendingCompletion: true,
        clearSurveySession: false,
      });
    }
  }, [submitStatus]);

  // Current answer — discard stale data whose type doesn't match the question
  const rawAnswer = question ? getAnswer(question.qId) : null;
  const currentAnswer = useMemo(() => {
    if (!question || rawAnswer === null || rawAnswer === undefined) return rawAnswer;
    // V6 migrated some questions from single→multiple; clear mismatched types
    if (question.answerType === "multiple" && !Array.isArray(rawAnswer)) return null;
    if (question.answerType === "scale" && typeof rawAnswer !== "number") return null;
    return rawAnswer;
  }, [question, rawAnswer]);

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentAnswer)) return false;
    return (
      emailConfirmValue.trim().length > 0 &&
      emailConfirmValue.trim().toLowerCase() === currentAnswer.trim().toLowerCase()
    );
  }, [question, currentAnswer, emailConfirmValue]);

  const isSelectionCountValid = useMemo(() => {
    if (question?.answerType !== "multiple") return true;
    if (!Array.isArray(currentAnswer)) return true;
    if (typeof question.maxSelections !== "number") return true;
    return currentAnswer.length <= question.maxSelections;
  }, [question, currentAnswer]);

  const [attemptedNext, setAttemptedNext] = useState(false);

  const { trackNavigation } = useSurveyTracking(currentIndex, hasAnswer, question);

  const cancelAutoAdvance = useCallback(() => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
  }, []);

  // Navigation
  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index > totalQuestions) return;
      cancelAutoAdvance();
      setAnimKey((k) => k + 1);
      setAttemptedNext(false);
      // Clear transient email-confirm state when leaving the email question
      const targetQuestion = surveyQuestions[index];
      if (targetQuestion?.inputType !== "email") {
        setEmailConfirmValue("");
      }
      setCurrentIndex(index);
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    [totalQuestions, setCurrentIndex, cancelAutoAdvance]
  );

  const goNext = useCallback(() => {
    if (!isEmailValid || !isSelectionCountValid) {
      setAttemptedNext(true);
      return;
    }
    if (currentIndex >= totalQuestions - 1) {
      if (hasCompleted.current) return;
      hasCompleted.current = true;
      trackNavigation("complete");
      const duration = Date.now() - new Date(startedAt).getTime();
      trackSurveyComplete(duration, totalQuestions);
      submitSurvey(answers, startedAt, utmTracker);
      goTo(totalQuestions); // one past the end → triggers completion
      return;
    }
    savePartial();
    trackNavigation("forward");
    if (question) {
      trackSurveyAnswer(question.qId, question.chapter);
      trackSurveyProgress(question.qId, currentIndex + 1, totalQuestions);
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
    isSelectionCountValid,
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
    setShowPauseModal(true);
  }, [question, progress, trackNavigation, savePartial]);

  const handleResumeFromPause = useCallback(() => {
    setShowPauseModal(false);
  }, []);

  const handleExitFromPause = useCallback(() => {
    setShowPauseModal(false);
    onExit();
  }, [onExit]);

  // Handle answer change
  const handleChange = useCallback(
    (value: AnswerValue) => {
      if (!question) return;
      setAnswer(question.qId, value);

      // Auto-advance for single-selection question types
      cancelAutoAdvance();
      if (
        autoAdvance &&
        (question.answerType === "single" ||
          question.answerType === "scale" ||
          question.answerType === "country")
      ) {
        // Skip auto-advance when "Other" is selected (user needs to type)
        if (
          question.answerType === "single" &&
          typeof value === "string" &&
          /^other\b/i.test(value)
        ) {
          return;
        }
        autoAdvanceTimer.current = setTimeout(() => {
          goNext();
        }, 350);
      }
    },
    [question, setAnswer, autoAdvance, cancelAutoAdvance, goNext]
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

  // Touch swipe — only trigger on primarily horizontal gestures
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // TouchEvent always fires with at least one touch point.
      touchStartX.current = e.touches[0]!.clientX;
      touchStartY.current = e.touches[0]!.clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const diffX = e.changedTouches[0]!.clientX - touchStartX.current;
      const diffY = e.changedTouches[0]!.clientY - touchStartY.current;
      touchStartX.current = null;
      touchStartY.current = null;
      if (Math.abs(diffX) < 50) return;
      // Ignore if gesture is more vertical than horizontal (prevents false triggers on scroll)
      if (Math.abs(diffY) >= Math.abs(diffX)) return;
      if (diffX < 0 && (hasAnswer || !question?.required)) goNext();
      if (diffX > 0) goPrev();
    };
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [hasAnswer, question, goNext, goPrev]);

  // Clean up auto-advance timer on unmount
  useEffect(() => {
    return () => {
      cancelAutoAdvance();
    };
  }, [cancelAutoAdvance]);

  // Survey complete — phase-based rendering
  const handleRetry = useCallback(async () => {
    setCompletionPhase("processing");
    await retryPending();
  }, [retryPending]);

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
      return <PreReportWizard onComplete={() => onComplete(reportToken)} />;
    }

    // Error confirmation only
    return (
      <SurveyConfirmation
        status={submitStatus === "idle" && hasPendingCompletion ? "error" : submitStatus}
        onExit={onExit}
        onRetry={handleRetry}
        onStartOver={onComplete}
      />
    );
  }
  // Status text for nav
  const statusText = `Question ${currentIndex + 1} of ${totalQuestions}`;

  const canGoNext = (hasAnswer && isEmailValid && isSelectionCountValid) || !question.required;

  return (
    <main
      className="relative flex min-h-screen flex-col bg-[#0a0510]"
      style={{ touchAction: "pan-y" }}
    >
      {/* Background gradient blurs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[rgba(167,139,250,0.06)] blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-[rgba(254,104,57,0.04)] blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-[768px] flex-1 flex-col gap-6 px-6 pb-[100px] pt-6 sm:pb-32 sm:pt-10">
        {/* Header */}
        <SurveyHeader
          progress={progress}
          onPause={handlePause}
          autoAdvance={autoAdvance}
          onToggleAutoAdvance={toggleAutoAdvance}
        />

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
                confirmValue={emailConfirmValue}
                onConfirmChange={setEmailConfirmValue}
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
                forceValidation={attemptedNext}
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

      <SurveyPauseModal
        open={showPauseModal}
        email={(answers["00000"] as string) || ""}
        onResume={handleResumeFromPause}
        onExit={handleExitFromPause}
      />
    </main>
  );
};

export default SurveyEngine;
