"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, type FC } from "react";
import { surveyQuestions } from "@/data/survey-data";
import { isHidden } from "@features/survey/questionFlags";
import { useSurveyState, type AnswerValue } from "./hooks/useSurveyState";
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
import { orderEmailLast } from "./questionOrder";
import { SurveyThemeProvider } from "./SurveyThemeContext";
import { useSubmitSurvey } from "./hooks/useSubmitSurvey";
import { useSurveyTracking } from "./hooks/useSurveyTracking";
import { useUtmCapture } from "./hooks/useUtmCapture";
import { usePartialSave } from "./hooks/usePartialSave";
import { clearPersistedSurveyState } from "./hooks/surveyStorage";
import { copySurveySessionToReportSession } from "./hooks/surveySession";
import { getCsrfToken } from "@shared/http/csrf-client";
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

const SurveyEngine: FC<SurveyEngineProps> = ({ onExit, onComplete, onStartOver }) => {
  const {
    answers,
    currentIndex,
    startedAt,
    prefilled,
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

  const [animKey, setAnimKey] = useState(0);
  const [emailConfirmValue, setEmailConfirmValue] = useState("");
  const hasTrackedStart = useRef(false);
  const hasCompleted = useRef(false);
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

  // Navigation
  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index > totalQuestions) return;
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
    [totalQuestions, setCurrentIndex, orderedQuestions]
  );

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
    // `answers` is deliberately NOT a dependency. Nothing in this callback reads it any
    // more: the submit reads getLatestAnswers(), so a Next pressed before React has
    // committed the last answer still sends it.
    getLatestAnswers,
    trackNavigation,
    isEmailValid,
    isSelectionCountValid,
    utmTracker,
    savePartial,
  ]);

  const goPrev = useCallback(() => {
    // Finished: the screens after submitting are not questions. ArrowLeft and a right swipe
    // reach this through window listeners on them too, and reopened the last question under
    // the finished run's session id, saving its answers again; a reload then read them as a
    // new run (#393) and Next filed the same answers as a second submission.
    if (currentIndex >= totalQuestions) return;
    trackNavigation("back");
    goTo(currentIndex - 1);
  }, [currentIndex, totalQuestions, goTo, trackNavigation]);

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

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Enter on a focused control is that control's own press: a scale point, an
      // option, Previous/Next, a guidance row. Taking it here moved the survey on AND
      // cancelled the press, so a changed answer was never saved, and Enter on Next
      // moved twice. Enter anywhere else (a text box, the page) still means next.
      if (e.key === "Enter" && e.target instanceof Element && e.target.closest("button, a")) {
        return;
      }
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
  const canGoNext = (hasAnswer && isEmailValid && isSelectionCountValid) || !question.required;

  return (
    // The question screen, Figma 11303:174 (2026-10-04): one card holding the
    // question, then Previous / Next, then the progress strip. The theme provider
    // stays for the components that still read it; it is always "white".
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
        style={{ touchAction: "pan-y" }}
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
            {/* Fill `backwards`, not `both`: a transform left in place after the
                entrance would trap the country dropdown under the sticky footer. */}
            <div
              key={animKey}
              ref={bodyRef}
              className="flex flex-1 flex-col gap-5 px-[18.4px] pt-[22.4px] motion-safe:animate-[survey-fade-up_0.4s_cubic-bezier(0.16,1,0.3,1)_backwards] sm:px-[35px] sm:pb-3 sm:pt-[33px]"
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

            {/* Previous / Next and the progress strip stay on screen while a long
                question scrolls (above the cookie banner while it is up). Not on
                a landscape phone, where they would cover half the screen. */}
            <div
              ref={footerRef}
              className={`sticky bottom-[var(--liq-consent-h,0px)] z-20 bg-white transition-shadow duration-200 sm:rounded-b-[21px] [@media(max-height:500px)]:static ${
                footerFloating
                  ? "shadow-[0_-1px_0_rgba(22,16,33,0.09),0_-12px_24px_-16px_rgba(22,16,33,0.2)]"
                  : ""
              }`}
            >
              <SurveyNav
                canGoBack={currentIndex > 0}
                canGoNext={canGoNext}
                hasAnswer={hasAnswer}
                onPrevious={goPrev}
                onNext={goNext}
              />
              <SurveyProgress index={currentIndex} total={totalQuestions} />
            </div>
            <div ref={cardEndRef} aria-hidden className="absolute bottom-0 h-px w-px" />
          </section>
        </div>
      </main>
    </SurveyThemeProvider>
  );
};

export default SurveyEngine;
