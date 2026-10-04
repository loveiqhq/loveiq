"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type FC } from "react";
import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
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
  trackSurveyFormError,
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
import {
  BASE_STATE_KEY,
  clearPersistedSurveyState,
  QUESTION_STATE_KEY,
} from "./hooks/surveyStorage";
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
  /** Discard this run and begin again. Without it the error screen offers no Start Over. */
  onStartOver?: () => void;
}

const TEXT_ENTRY_TYPES = /^(text|email|search|tel|url|number|password)$/;

/** A field the reader types into, where the arrow keys are theirs. Not radios or checkboxes. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
  return target instanceof HTMLInputElement && TEXT_ENTRY_TYPES.test(target.type);
}

/**
 * How many question entries this one sits above its base, or 0 when the entry on
 * screen is not the question shown (out of step, or not a question entry at all), so
 * that nothing ever pops or jumps history it did not stack.
 */
function entriesAboveBase(currentIndex: number): number {
  const state = window.history.state as Record<string, unknown> | null;
  const q = state?.[QUESTION_STATE_KEY];
  const base = state?.[BASE_STATE_KEY];
  if (typeof q !== "number" || typeof base !== "number" || q !== currentIndex) return 0;
  return Math.max(0, q - base);
}

const SurveyEngine: FC<SurveyEngineProps> = ({ onExit, onComplete, onStartOver }) => {
  const {
    answers,
    currentIndex,
    startedAt,
    prefilled,
    progress,
    setAnswer,
    getAnswer,
    getLatestAnswers,
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
  /** Pending fallback for a Previous whose history.back() found nothing to go back to. */
  const backFallback = useRef<number | null>(null);
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
    () =>
      orderEmailLast(surveyQuestions)
        .filter((q) => !isHidden(q.qId))
        .filter((q) => !prefilledKey.split(",").includes(q.qId)),
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

  /** A pending Previous fallback belongs to the question it was pressed on. */
  const cancelBackFallback = useCallback(() => {
    if (backFallback.current === null) return;
    window.clearTimeout(backFallback.current);
    backFallback.current = null;
  }, []);

  // Navigation
  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index > totalQuestions) return;
      cancelAutoAdvance();
      cancelBackFallback();
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
    [totalQuestions, setCurrentIndex, cancelAutoAdvance, cancelBackFallback, orderedQuestions]
  );

  /**
   * Make the entry on screen the questions' base, pointing at `index`, unless it
   * already names that question. Done at the first move rather than on mount: React
   * runs this component's effects before SurveyPage's, so on mount the entry on screen
   * is still consent's, and stamping it turned Back from the first question into a
   * jump back to it. An entry naming ANOTHER question is out of step (another tab moved
   * the run on, or the reader jumped through the Back menu) and its base is not ours:
   * kept, it let Previous and the collapse fall through to questions long passed.
   */
  const markBase = useCallback((index: number, force = false) => {
    if (!force && window.history.state?.[QUESTION_STATE_KEY] === index) return;
    window.history.replaceState(
      { ...window.history.state, [QUESTION_STATE_KEY]: index, [BASE_STATE_KEY]: index },
      ""
    );
  }, []);

  const goNext = useCallback(() => {
    if (!isEmailValid || !isSelectionCountValid) {
      /**
       * A blocked Next is the only "form error" this survey can produce, and
       * until now nothing recorded it: `trackSurveyFormError` was defined in
       * features/analytics/client.ts and never called once, so the event was
       * not even in PostHog's taxonomy. Marcus asked the agents to check
       * against form errors; we were blind to them.
       *
       * PostHog only, deliberately. persistAnalyticsEvent needs
       * `window.__loveiqReportSubmissionId`, and during the survey nothing has
       * been submitted yet — there is no submission to key a row to. The daily
       * digest therefore cannot see these, and says so rather than implying it
       * looked.
       *
       * Fired per attempt, not once per question: a reader pressing Next four
       * times against the same rejection is the signal, the same way a rage
       * click is.
       */
      if (question?.qId) {
        trackSurveyFormError({
          question_id: question.qId,
          error_kind: !isEmailValid ? "invalid_email" : "out_of_range",
        });
      }
      setAttemptedNext(true);
      return;
    }
    if (currentIndex >= totalQuestions - 1) {
      if (hasCompleted.current) return;
      hasCompleted.current = true;
      trackNavigation("complete");
      const duration = Date.now() - new Date(startedAt).getTime();
      /**
       * Reported here, once. A second emitter used to live in
       * `useSubmitSurvey` — see the note there — which double-counted every
       * completion. This path is the one that survives because it reaches GA4
       * as well as PostHog.
       */
      trackSurveyComplete(duration, totalQuestions);
      // `getLatestAnswers()`, never the `answers` closure: on the last question the
      // answer and this submit are two clicks apart, and the closure can predate the
      // first of them. See the note in useSurveyState.
      submitSurvey(getLatestAnswers(), startedAt, utmTracker);
      goTo(totalQuestions); // one past the end → triggers completion
      // Collapse the question entries back onto their base, so Back after submitting
      // never meets dozens of ignored entries (the listener ignores pops once
      // hasCompleted is set; the move to the report then drops the entries above).
      // Only entries this engine stacked, and never further than the browser holds:
      // Chromium and Firefox keep 50, so a full run has already lost its base and first
      // questions, and this lands on the oldest entry left, where Back has nowhere
      // further to go. A go() past the first entry would do nothing at all.
      const above = Math.min(entriesAboveBase(currentIndex), window.history.length - 1);
      if (above > 0) window.history.go(-above);
      return;
    }
    savePartial();
    trackNavigation("forward");
    if (question) {
      trackSurveyAnswer(question.qId, question.chapter);
      trackSurveyProgress(question.qId, currentIndex + 1, totalQuestions);
    }
    // Its own history entry, so the phone's Back returns here. See the popstate effect.
    markBase(currentIndex);
    // Every entry carries its base, so the stack is readable after a remount (back to
    // consent and forward again) when nothing in memory survived.
    window.history.pushState(
      { ...window.history.state, [QUESTION_STATE_KEY]: currentIndex + 1 },
      ""
    );
    goTo(currentIndex + 1);
  }, [
    currentIndex,
    totalQuestions,
    startedAt,
    question,
    goTo,
    submitSurvey,
    // `answers` is deliberately NOT a dependency. Nothing in this callback reads it any
    // more, and leaving it out is what makes `goNext` stable across answer changes — so
    // the auto-advance timer's captured copy is the same function and still reads fresh
    // answers through getLatestAnswers().
    getLatestAnswers,
    trackNavigation,
    isEmailValid,
    isSelectionCountValid,
    utmTracker,
    savePartial,
    markBase,
  ]);

  const goPrev = useCallback(() => {
    // Finished: the screens after submitting are not questions. ArrowLeft and a right swipe
    // reach this through window listeners on them too, and reopened the last question under
    // the finished run's session id, saving its answers again; a reload then read them as a
    // new run (#393) and Next filed the same answers as a second submission.
    if (currentIndex >= totalQuestions) return;
    // An auto-advance still pending would push the next question over the pop in flight,
    // and the reader's Previous was lost.
    cancelAutoAdvance();
    const moveWithoutHistory = () => {
      trackNavigation("back");
      if (currentIndex > 0) markBase(currentIndex - 1, true);
      goTo(currentIndex - 1);
    };
    if (entriesAboveBase(currentIndex) > 0) {
      // A second tap before the first popstate must not leave the first tap's fallback
      // armed: it would fire later with a stale index and move the screen forward.
      cancelBackFallback();
      window.history.back(); // the popstate effect shows the previous question
      // The browser keeps 50 entries, so deep into a run the one below may be gone and
      // back() does nothing. No popstate soon after means exactly that: move anyway.
      backFallback.current = window.setTimeout(() => {
        backFallback.current = null;
        moveWithoutHistory();
      }, 500);
      return;
    }
    moveWithoutHistory();
  }, [
    currentIndex,
    totalQuestions,
    goTo,
    trackNavigation,
    markBase,
    cancelAutoAdvance,
    cancelBackFallback,
  ]);

  /**
   * The phone's Back goes to the previous question, and Forward to the next.
   *
   * The questions used to share ONE history entry, so Back left them: it showed the
   * 18+ consent screen with both boxes unticked, which reads as "the survey reset",
   * and a couple more presses reached the homepage. 30 Sep–4 Oct, 20 readers landed
   * on the homepage mid-survey that way (8 past question 40) and 19 never answered
   * again; the recording watchers flagged it 26 times as "sent back to the start".
   *
   * So the history mirrors the questions: every forward move pushes an entry, every
   * backward move pops one, and the entry the questions opened on (the base) holds
   * the question on screen whenever nothing sits above it. A pop past the base is
   * SurveyPage's, as before: Back from the first question still reaches consent.
   */
  const navigateFromHistory = useRef<(index: number) => void>(() => {});
  // What a Next press would accept here: the button's rule and goNext's own checks.
  const mayMoveOn = (hasAnswer || !question?.required) && isEmailValid && isSelectionCountValid;
  useEffect(() => {
    navigateFromHistory.current = (index: number) => {
      // Finished, including a run restored onto its completion screen (hasCompleted is
      // only set by submitting in this mount): the same guard as goPrev, see #393.
      if (currentIndex >= totalQuestions || index === currentIndex) return;
      // Forward is a Next, so Next's checks apply. Without them, Back to the email
      // question, an edit and Forward submitted an address nobody had confirmed.
      // Refused, the history steps back onto the question on screen.
      if (index > currentIndex && !mayMoveOn) {
        setAttemptedNext(true);
        window.history.back();
        return;
      }
      // Back while paused goes back a question like any other Back, and the dialog
      // closes with it instead of promising "where you left off" over another question.
      setShowPauseModal(false);
      trackNavigation(index < currentIndex ? "back" : "forward");
      goTo(index);
    };
  }, [currentIndex, totalQuestions, goTo, trackNavigation, mayMoveOn]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      cancelBackFallback();
      const index = (e.state as Record<string, unknown> | null)?.[QUESTION_STATE_KEY];
      if (typeof index !== "number") return; // consent or a slide: SurveyPage's
      if (hasCompleted.current) return; // after submitting these are not questions
      navigateFromHistory.current(index);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      cancelBackFallback();
    };
  }, [cancelBackFallback]);

  const handlePause = useCallback(() => {
    cancelBackFallback(); // it would move the question under the dialog
    savePartial();
    trackNavigation("abandon");
    if (question) {
      trackSurveyPause(question.qId, progress);
    }
    setShowPauseModal(true);
  }, [question, progress, trackNavigation, savePartial, cancelBackFallback]);

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
      if (showPauseModal) return; // the dialog has the keyboard
      // In a text field the arrows move the caret. They used to change the question,
      // so fixing a typo in your email threw you back to the question before it.
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && isTextEntry(e.target)) return;
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
  }, [hasAnswer, question, goNext, goPrev, showPauseModal]);

  // Touch swipe — only trigger on primarily horizontal gestures
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      // TouchEvent always fires with at least one touch point.
      touchStartX.current = e.touches[0]!.clientX;
      touchStartY.current = e.touches[0]!.clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      if (showPauseModal) return; // a swipe on the dialog is not a question move
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
  }, [hasAnswer, question, goNext, goPrev, showPauseModal]);

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
        onStartOver={onStartOver}
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
