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
  setReportSubmissionContext,
  setSurveyVariant,
} from "@features/analytics/client";
import { assignSurveyVariant, type SurveyVariant } from "@shared/experiments/surveyVariant";
import { orderEmailLast } from "./questionOrder";
import { SurveyThemeProvider } from "./SurveyThemeContext";
import { useSubmitSurvey } from "./hooks/useSubmitSurvey";
import { useSurveyTracking } from "./hooks/useSurveyTracking";
import { useUtmCapture } from "./hooks/useUtmCapture";
import { usePartialSave } from "./hooks/usePartialSave";
import { useAutoAdvance } from "./hooks/useAutoAdvance";
import { clearPersistedSurveyState } from "./hooks/surveyStorage";
import { copySurveySessionToReportSession } from "./hooks/surveySession";
import { getCsrfToken } from "@shared/http/csrf-client";
import { readCookie } from "@shared/observability/cookie";
import { isLandingVariant, LANDING_VARIANT_COOKIE } from "@shared/experiments/landingVariant";
import { getStoredUtm, sanitizeUtmSource } from "@shared/url/utm";
import SurveyConfirmation from "./SurveyConfirmation";
import PreReportWizard from "./PreReportWizard";
import ProcessingSequence from "./ProcessingSequence";
import SurveyPauseModal from "./SurveyPauseModal";

type CompletionPhase = "processing" | "wizard" | "done";

interface SurveyEngineProps {
  onExit: () => void;
  onComplete: (reportToken?: string | null) => void;
}

const SurveyEngine: FC<SurveyEngineProps> = ({ onExit, onComplete }) => {
  const {
    answers,
    currentIndex,
    startedAt,
    prefilled,
    progress,
    setAnswer,
    getAnswer,
    setCurrentIndex,
  } = useSurveyState();
  const {
    submit: submitSurvey,
    retryPending,
    hasPendingCompletion,
    reportToken,
    submissionId,
    status: submitStatus,
  } = useSubmitSurvey();

  // PreReportWizard fires wizard_slide_advanced via persistAnalyticsEvent, which
  // requires window.__loveiqReportSubmissionId to write durable rows. Set it as
  // soon as the submission lands so the wizard's first slide-advance ping
  // already has context. /report's own setReportSubmissionContext call will
  // re-set the same value once the user lands there.
  useEffect(() => {
    if (submissionId != null) {
      setReportSubmissionContext(submissionId);
    }
  }, [submissionId]);
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

  // Questions answered before the survey opened (the landing-page card) are
  // dropped from the flow so nobody is asked twice. Their answers stay in
  // `answers` and submit + score exactly like the rest, so the total is
  // unchanged — only where the question gets asked moves.
  // `orderEmailLast` moves the email question from its generated index 0 to just
  // before the marketing opt-in, for everyone (the email-position A/B that used
  // to pick this per visitor was retired 2026-08-16 in favour of "last").
  // Joined into a string so the memo key is stable across re-renders.
  const prefilledKey = prefilled.join(",");
  const orderedQuestions = useMemo(
    () => orderEmailLast(surveyQuestions).filter((q) => !prefilledKey.split(",").includes(q.qId)),
    [prefilledKey]
  );
  const totalQuestions = orderedQuestions.length;
  const question = orderedQuestions[currentIndex];

  // Survey theme. The A/B concluded in white's favour on 2026-08-25, so this is
  // "white" for everyone; `?survey=white|dark` still previews either on
  // dev/staging. Resolved on first render so the first question paint is already
  // themed (the engine renders client-only, behind SurveyPage's hydration gate).
  const [surveyVariant] = useState<SurveyVariant>(() => {
    const devParam =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("survey");
    return assignSurveyVariant(devParam);
  });
  const surveyExposureFired = useRef(false);
  useEffect(() => {
    if (surveyExposureFired.current) return;
    surveyExposureFired.current = true;
    /**
     * Stamp the theme onto persisted survey events. Still worth doing — on
     * staging `?survey=dark` previews the old arm and the events should say so.
     *
     * No `trackExperimentExposure` any more. That wrote a one-per-visitor
     * `experiment_exposure` row as the denominator for a per-arm completion
     * rate, and the experiment is over: it would have gone on recording
     * exposures to a concluded test, for one arm, forever.
     */
    setSurveyVariant(surveyVariant);
  }, [surveyVariant]);

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
      // The landing arm is NOT sent from here: /api/funnel-event reads the same
      // cookie server-side, so it cannot be attested by a client.
      if (visitorId) {
        // First-touch acquisition source, so start-rate can be split by channel
        // (the visitor denominator carries it too — see proxy.ts/recordVisit.ts).
        // Best-effort: empty/unparseable stored UTM just sends no source.
        let utmSource: string | undefined;
        try {
          const rawUtm = getStoredUtm();
          if (rawUtm) {
            const parsed = JSON.parse(rawUtm) as { utm_source?: unknown };
            if (typeof parsed.utm_source === "string") {
              // Same normalizer as proxy.ts so both rows share one label format
              // (this is first-touch localStorage; the visitor row is last-touch
              // URL — per-channel start-rate is directional, not exact).
              utmSource = sanitizeUtmSource(parsed.utm_source);
            }
          }
        } catch {
          /* no usable stored UTM */
        }
        fetch("/api/funnel-event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            event: "survey_engine_mount",
            visitor_id: visitorId,
            ...(utmSource ? { utm_source: utmSource } : {}),
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
      const targetQuestion = orderedQuestions[index];
      if (targetQuestion?.inputType !== "email") {
        setEmailConfirmValue("");
      }
      setCurrentIndex(index);
      window.scrollTo({ top: 0, behavior: "instant" });
    },
    [totalQuestions, setCurrentIndex, cancelAutoAdvance, orderedQuestions]
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
              setCompletionPhase("wizard");
            }
          }}
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

  const isWhite = surveyVariant === "white";

  return (
    // The QUESTIONS-only theme, white for everyone since the test concluded
    // 2026-08-25. The provider + data attribute scope it to this <main> (the
    // post-submit processing/wizard/confirmation are separate early returns above
    // and stay dark). The dark branches remain, reachable via ?survey=dark on
    // dev/staging.
    <SurveyThemeProvider variant={surveyVariant}>
      {/* NOTE: the survey root is deliberately NOT masked from session replay
          (owner decision, 2026-08-10) — this reverses audit finding L8. It
          previously carried data-clarity-mask (and data-hj-suppress before
          that), which stopped the recorder capturing question text, choice
          labels and selection state. Without it, Clarity recordings can
          reconstruct a visitor's Article-9 answers, and those recordings sit
          with Microsoft as an independent controller (30-day retention, no
          per-user deletion). Documented in docs/compliance/DPIA.md §6.

          To restore the protection, put data-clarity-mask="true" back on the
          <main> below — that single attribute is the whole control. */}
      <main
        className={`relative flex min-h-screen flex-col ${isWhite ? "bg-white" : "bg-[#0a0510]"}`}
        style={{ touchAction: "pan-y" }}
        data-survey-theme={surveyVariant}
      >
        {/* Background gradient blurs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div
            className={`absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full blur-[120px] ${
              isWhite ? "bg-[rgba(167,139,250,0.10)]" : "bg-[rgba(167,139,250,0.06)]"
            }`}
          />
          <div
            className={`absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full blur-[120px] ${
              isWhite ? "bg-[rgba(254,104,57,0.08)]" : "bg-[rgba(254,104,57,0.04)]"
            }`}
          />
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
          <div
            className={`fixed bottom-0 left-0 right-0 z-20 rounded-tl-[24px] rounded-tr-[24px] border-t px-6 py-4 backdrop-blur-xl sm:sticky sm:bottom-6 sm:left-auto sm:right-auto sm:rounded-2xl sm:border ${
              isWhite
                ? "border-black/[0.08] bg-white/80 sm:border-black/[0.08]"
                : "border-white/10 bg-[rgba(10,5,16,0.8)] sm:border-white/10"
            }`}
          >
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
    </SurveyThemeProvider>
  );
};

export default SurveyEngine;
