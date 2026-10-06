"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, type FC } from "react";
import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
import { useSurveyState, type AnswerValue } from "./hooks/useSurveyState";
import SurveyJumpMenu from "./SurveyJumpMenu";
import SurveyNav from "./SurveyNav";
import SurveyProgress from "./SurveyProgress";
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
  trackSurveyFormError,
  setReportSubmissionContext,
  setSurveyVariant,
} from "@features/analytics/client";
import { assignSurveyVariant, type SurveyVariant } from "@shared/experiments/surveyVariant";
import { orderAskedQuestions } from "./questionOrder";
import { SurveyThemeProvider } from "./SurveyThemeContext";
import { useSubmitSurvey } from "./hooks/useSubmitSurvey";
import { useSurveyTracking } from "./hooks/useSurveyTracking";
import { useUtmCapture } from "./hooks/useUtmCapture";
import { usePartialSave } from "./hooks/usePartialSave";
import { BASE_STATE_KEY, QUESTION_STATE_KEY } from "./hooks/surveyStorage";
import { completedReportToken } from "./hooks/surveySession";
import { isValidSurveyEmail, tidySurveyEmail } from "@features/survey/email";
import { getCsrfToken } from "@shared/http/csrf-client";
import { isNonProdDeploy } from "@shared/env/is-non-prod-deploy";
import { readCookie } from "@shared/observability/cookie";
import { isLandingVariant, LANDING_VARIANT_COOKIE } from "@shared/experiments/landingVariant";
import { getStoredUtm, sanitizeUtmSource } from "@shared/url/utm";
import SurveyConfirmation from "./SurveyConfirmation";
import PreReportWizard from "./PreReportWizard";
import ProcessingSequence from "./ProcessingSequence";

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

/** Where a touch never starts a swipe between questions. */
const NO_SWIPE = "input, textarea, select, [contenteditable], [data-no-swipe]";

const SurveyEngine: FC<SurveyEngineProps> = ({ onExit, onComplete, onStartOver }) => {
  const {
    answers,
    currentIndex,
    startedAt,
    prefilled,
    orderArm,
    setAnswer,
    getAnswer,
    getLatestAnswers,
    setCurrentIndex,
  } = useSurveyState();
  const {
    submit: submitSurvey,
    retryPending,
    clearPendingCompletion,
    hasPendingCompletion,
    reportToken,
    submissionId,
    status: submitStatus,
    errorKind: submitErrorKind,
  } = useSubmitSurvey();

  // PreReportWizard fires wizard_slide_advanced (and its map's wizard_map_step) via
  // persistAnalyticsEvent, which requires window.__loveiqReportSubmissionId to write
  // durable rows. Set it as soon as the submission lands so the wizard's first
  // slide-advance ping already has context. /report's own setReportSubmissionContext
  // call will re-set the same value once the user lands there.
  useEffect(() => {
    if (submissionId != null) {
      setReportSubmissionContext(submissionId);
    }
  }, [submissionId]);
  const utmTracker = useUtmCapture();
  const { savePartial } = usePartialSave(
    answers,
    currentIndex,
    startedAt,
    utmTracker,
    submitStatus === "success"
  );

  const [animKey, setAnimKey] = useState(0);
  const [emailConfirmValue, setEmailConfirmValue] = useState("");
  const hasTrackedStart = useRef(false);
  const hasCompleted = useRef(false);
  /** Pending fallback for a Previous whose history.back() found nothing to go back to. */
  const backFallback = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  // The card's last pixel; while it is below the fold the sticky footer is
  // floating over content and gets a hairline to separate the two.
  const cardEndRef = useRef<HTMLDivElement | null>(null);
  const cardWrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [footerFloating, setFooterFloating] = useState(false);

  // Questions answered before the survey opened (the landing-page card) are
  // dropped from the flow so nobody is asked twice. Their answers stay in
  // `answers` and submit + score exactly like the rest, so the total is
  // unchanged — only where the question gets asked moves.
  // `orderEmailLast` moves the email question from its generated index 0 to just
  // before the marketing opt-in, for everyone (the email-position A/B that used
  // to pick this per visitor was retired 2026-08-16 in favour of "last").
  // C13 — the opening-order experiment. Resolved once per run by useSurveyState and kept
  // in the draft: the order must not change under a respondent who reloads, goes back or
  // resumes, so a draft begun before C13 keeps the control order (its saved position
  // would otherwise skip the questions the variant moves forward). A fresh run is
  // bucketed by its session id; no session id (storage blocked) means control.
  // `?order=control|variant` previews either arm on dev and staging, never on production.
  // Joined into a string so the memo key is stable across re-renders.
  const prefilledKey = prefilled.join(",");
  const orderedQuestions = useMemo(
    () =>
      orderAskedQuestions(surveyQuestions, orderArm)
        .filter((q) => !isHidden(q.qId))
        .filter((q) => !prefilledKey.split(",").includes(q.qId)),
    [prefilledKey, orderArm]
  );
  const totalQuestions = orderedQuestions.length;
  const question = orderedQuestions[currentIndex];

  // Survey theme. The A/B concluded in white's favour on 2026-08-25, so this is
  // "white" for everyone. The `?survey=dark` preview went with the 2026-10-04
  // redesign (Figma 11303:174), which has no dark version to preview. Resolved
  // here because assignSurveyVariant also expires the old arm cookie.
  const [surveyVariant] = useState<SurveyVariant>(() => assignSurveyVariant());
  const surveyExposureFired = useRef(false);
  useEffect(() => {
    if (surveyExposureFired.current) return;
    surveyExposureFired.current = true;
    /**
     * Stamp the theme onto persisted survey events, so they keep carrying the
     * same `survey_variant` property they always have.
     *
     * No `trackExperimentExposure` any more. That wrote a one-per-visitor
     * `experiment_exposure` row as the denominator for a per-arm completion
     * rate, and the experiment is over: it would have gone on recording
     * exposures to a concluded test, for one arm, forever.
     */
    setSurveyVariant(surveyVariant);
  }, [surveyVariant]);

  // Post-survey completion phase management
  // Mounting onto a finished run: a pending submission shows its retry screen. With none,
  // nothing is in flight (it landed while the reader was elsewhere), so the screens that
  // lead to the report. "processing" here waited for a submit that would never come, at
  // 95%, with no button.
  const [completionPhase, setCompletionPhase] = useState<CompletionPhase>(() => {
    if (currentIndex < totalQuestions) return "processing";
    if (hasPendingCompletion) return "done";
    return submitStatus === "idle" ? "wizard" : "processing";
  });

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
    // The server's own rule (features/survey/email.ts): an address this let through and the
    // server refused stranded the reader at the final submit.
    if (!isValidSurveyEmail(currentAnswer)) return false;
    return (
      emailConfirmValue.trim().length > 0 &&
      tidySurveyEmail(emailConfirmValue).toLowerCase() ===
        tidySurveyEmail(currentAnswer).toLowerCase()
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
    [totalQuestions, setCurrentIndex, cancelBackFallback, orderedQuestions]
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
    // Finished: the same guard as goPrev. A remount onto the retry screen resets
    // hasCompleted, and ArrowRight, Enter or a left swipe there re-ran the whole
    // completion: a second survey_completed, and a new payload under this tab's session.
    if (currentIndex >= totalQuestions) return;
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
    // more: the submit reads getLatestAnswers(), so a Next pressed before React has
    // committed the last answer still sends it.
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
  }, [currentIndex, totalQuestions, goTo, trackNavigation, markBase, cancelBackFallback]);

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
      // Forward is a Next, so Next's checks apply, one question at a time. Without
      // them, Back to the email question, an edit and Forward submitted an address
      // nobody had confirmed; and a jump over several entries (the browser's history
      // list) would skip the checks of every question edited since. Refused, the
      // history steps back ONE entry and this runs again where it lands: entries can
      // skip question numbers once a run was re-based (another tab moved it on), so a
      // go() by the question gap could overshoot. A refused jump therefore ends one
      // question on, if this one passes, or back on this one.
      if (index > currentIndex && (index > currentIndex + 1 || !mayMoveOn)) {
        setAttemptedNext(true);
        window.history.back();
        return;
      }
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

  // Handle answer change. Moving on is always the reader's own Next: the
  // auto-advance toggle and the Pause / Save & exit control left with the
  // 2026-10-04 redesign (Figma 11303:174), which carries neither.
  const handleChange = useCallback(
    (value: AnswerValue) => {
      if (!question) return;
      setAnswer(question.qId, value);
    },
    [question, setAnswer]
  );

  // Once the last question is answered there is nothing to navigate: the processing
  // screen, the pre-report wizard and the confirmation own the keys and the swipes. Left
  // live, these handlers swallowed the wizard's ArrowRight and Enter and took ArrowLeft
  // or a back swipe to the last question, whose Next does nothing once the survey is
  // submitted (final review, 30.09).
  const surveyOver = currentIndex >= totalQuestions;

  // Keyboard navigation
  useEffect(() => {
    if (surveyOver) return;
    const handleKey = (e: KeyboardEvent) => {
      // Enter on a focused control is that control's own press: a scale point, an
      // option, Previous/Next, a guidance row. Taking it here moved the survey on AND
      // cancelled the press, so a changed answer was never saved, and Enter on Next
      // moved twice. Enter anywhere else (a text box, the page) still means next.
      if (e.key === "Enter" && e.target instanceof Element && e.target.closest("button, a")) {
        return;
      }
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
  }, [hasAnswer, question, goNext, goPrev, surveyOver]);

  // Touch swipe — only trigger on primarily horizontal gestures
  useEffect(() => {
    if (surveyOver) return;
    const clearSwipe = () => {
      touchStartX.current = null;
      touchStartY.current = null;
    };
    const handleTouchStart = (e: TouchEvent) => {
      // A drag that starts on the scale (it looks like a slider) or in a text box (moving
      // the caret, selecting text) is not a swipe between questions; it changed the
      // question under the reader. Nor is a pinch (the finger it lifts first was measured
      // from the other finger's start), or a drag across a zoomed-in page, which is a
      // reader moving around the question to read it.
      if (
        e.touches.length !== 1 ||
        (window.visualViewport?.scale ?? 1) > 1.01 ||
        (e.target as Element | null)?.closest?.(NO_SWIPE)
      ) {
        clearSwipe();
        return;
      }
      touchStartX.current = e.touches[0]!.clientX;
      touchStartY.current = e.touches[0]!.clientY;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      // A finger still down: the end of one finger of a pinch.
      if (e.touches.length > 0) {
        clearSwipe();
        return;
      }
      if (touchStartX.current === null || touchStartY.current === null) return;
      const diffX = e.changedTouches[0]!.clientX - touchStartX.current;
      const diffY = e.changedTouches[0]!.clientY - touchStartY.current;
      clearSwipe();
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
  }, [hasAnswer, question, goNext, goPrev, surveyOver]);

  // The country search opens a list under its box, which a phone keyboard would cover
  // if the question sat lower: that one stays at the top on a phone.
  const holdAtTop = question?.answerType === "country";

  // No dead space. From 640px the card hugs its content and sits a little above the
  // middle of the window; on a phone the question sits a little above the middle of
  // the room left over the pinned buttons. Placed once as each question opens, then
  // held: picking an answer or opening a row grows it downward instead of moving what
  // was just pressed, and too tall to fit just starts at the top. Written to the
  // elements directly, so placing costs no re-render.
  useLayoutEffect(() => {
    let placedWidth = -1;
    const place = () => {
      const wrap = cardWrapRef.current;
      const card = cardRef.current;
      const body = bodyRef.current;
      const foot = footerRef.current;
      if (!wrap || !card || !body || !foot) return;
      placedWidth = window.innerWidth;
      const banner =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--liq-consent-h")
        ) || 0;
      const room = window.innerHeight - banner;
      const wide =
        typeof window.matchMedia === "function" && window.matchMedia("(min-width: 640px)").matches;
      wrap.style.paddingTop = "";
      body.style.paddingTop = "";
      if (wide) {
        const free = room - card.offsetHeight;
        wrap.style.paddingTop = `${Math.max(24, Math.floor(free * 0.4))}px`;
        return;
      }
      if (holdAtTop) return;
      const first = body.firstElementChild;
      const last = body.lastElementChild;
      if (!first || !last) return;
      const content = last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
      const top = parseFloat(getComputedStyle(body).paddingTop) || 0;
      // 24px always kept between the content and the buttons.
      const free = room - foot.offsetHeight - top - content - 24;
      if (free > 0) body.style.paddingTop = `${top + Math.floor(free * 0.4)}px`;
    };
    // A phone's toolbar sliding away on scroll is a height-only resize: re-placing on
    // it would shift the question under the reader's thumb. Re-place on width only.
    const onResize = () => {
      if (window.innerWidth !== placedWidth) place();
    };
    place();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [currentIndex, totalQuestions, holdAtTop]);

  // Hairline over the sticky footer only while it floats over the card's content.
  useEffect(() => {
    const end = cardEndRef.current;
    if (!end || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setFooterFloating(entry ? !entry.isIntersecting : false),
      // A few px of slack: a card ending exactly on the viewport edge is not floating.
      { rootMargin: "0px 0px 4px 0px" }
    );
    io.observe(end);
    return () => io.disconnect();
  }, [currentIndex, totalQuestions]);

  // Survey complete — phase-based rendering
  const handleRetry = useCallback(async () => {
    setCompletionPhase("processing");
    await retryPending();
  }, [retryPending]);

  // The server refused the email (an old page, or a rule that changed): back to that
  // question with every other answer kept, where only Start Over was on offer.
  const handleFixEmail = useCallback(() => {
    const emailIndex = orderedQuestions.findIndex((q) => q.inputType === "email");
    if (emailIndex < 0) return;
    clearPendingCompletion();
    hasCompleted.current = false;
    setCompletionPhase("processing");
    goTo(emailIndex);
  }, [orderedQuestions, clearPendingCompletion, goTo]);

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
      return (
        <PreReportWizard onComplete={() => onComplete(reportToken ?? completedReportToken())} />
      );
    }

    // Error confirmation only
    return (
      <SurveyConfirmation
        status={submitStatus === "idle" && hasPendingCompletion ? "error" : submitStatus}
        onExit={onExit}
        errorKind={submitErrorKind}
        onRetry={handleRetry}
        onFixEmail={handleFixEmail}
        onStartOver={onStartOver}
      />
    );
  }
  const canGoNext = (hasAnswer && isEmailValid && isSelectionCountValid) || !question.required;

  return (
    // The question screen, Figma 11303:174 (ready for dev 2026-10-06): one card holding
    // the question, then one footer row with Previous, the progress strip and Next. The
    // theme provider stays for the components that still read it; it is always "white".
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
        id="main-content"
        className="relative flex min-h-dvh flex-col bg-white"
        // pinch-zoom too: pan-y alone turned off zooming on the whole survey.
        style={{ touchAction: "pan-y pinch-zoom" }}
        data-survey-theme={surveyVariant}
      >
        {/* Background gradient blurs */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[rgba(167,139,250,0.10)] blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-[rgba(254,104,57,0.08)] blur-[120px]" />
        </div>

        {/* Phones: the card is the screen. From 640px: a 720px card with a border. */}
        <div
          ref={cardWrapRef}
          className="relative z-10 mx-auto flex w-full max-w-[768px] flex-1 flex-col sm:flex-none sm:px-6 sm:pb-6"
        >
          {/* Figma draws its 1px strokes INSIDE a frame; a CSS border adds 1px. So
              every bordered box here sits 1px in from the frame's padding (36 → 35). */}
          <section
            ref={cardRef}
            aria-label={`Question ${currentIndex + 1} of ${totalQuestions}`}
            className="relative flex flex-1 flex-col bg-white sm:rounded-[22px] sm:border sm:border-[rgba(22,16,33,0.09)]"
          >
            {/* Read out each new question: focus stays on Next, so a screen reader said
                nothing when the question changed. */}
            <p className="sr-only" aria-live="polite">
              {`Question ${currentIndex + 1} of ${totalQuestions}: ${question.question}`}
            </p>
            {/* Staging, previews and dev only (Mark, 30.09): jump straight to any question.
                Inside the card, so placing the card counts it. */}
            {isNonProdDeploy() ? (
              <div className="px-[18.4px] pt-3 sm:px-[35px]">
                <SurveyJumpMenu
                  questions={orderedQuestions}
                  currentIndex={currentIndex}
                  onJump={goTo}
                />
              </div>
            ) : null}
            {/* Fill `backwards`, not `both`: a transform left in place after the
                entrance would trap the country dropdown under the sticky footer. */}
            <div
              key={animKey}
              ref={bodyRef}
              className="flex flex-1 flex-col gap-5 px-[18.4px] pb-3 pt-[22.4px] motion-safe:animate-[survey-fade-up_0.4s_cubic-bezier(0.16,1,0.3,1)_backwards] sm:px-[35px] sm:pt-[33px]"
            >
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

              <GuidancePanel question={question} />
            </div>

            {/* The footer row (Previous, the progress strip, Next) stays on screen while
                a long question scrolls (above the cookie banner while it is up). Not in
                a window 500px tall or less (a landscape phone, a short desktop window),
                where it would cover a third to half of it: there it follows the
                question and the page scrolls to it. The row draws its own hairline, so
                floating adds only the soft shadow. */}
            <div
              ref={footerRef}
              data-survey-footer
              className={`sticky bottom-[var(--liq-consent-h,0px)] z-20 bg-white transition-shadow duration-200 sm:rounded-b-[21px] [@media(max-height:500px)]:static ${
                footerFloating ? "shadow-[0_-12px_24px_-16px_rgba(22,16,33,0.2)]" : ""
              }`}
            >
              <SurveyNav
                canGoBack={currentIndex > 0}
                canGoNext={canGoNext}
                // Drawn "ready" on an optional question even when it is empty: the faded
                // Next would tell the respondent they are blocked when they are not.
                hasAnswer={hasAnswer || !question.required}
                onPrevious={goPrev}
                onNext={goNext}
                progress={<SurveyProgress index={currentIndex} total={totalQuestions} />}
              />
            </div>
            <div ref={cardEndRef} aria-hidden className="absolute bottom-0 h-px w-px" />
          </section>
        </div>
      </main>
    </SurveyThemeProvider>
  );
};

export default SurveyEngine;
