// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * `survey_completed` arrives at PostHog TWICE in 209 of 218 production sessions
 * (2.06 per session), while the server-side record is singular — 79 rows across
 * 79 sessions. So the survey is not double-completing; only the analytics copy
 * is inflated, and any trend counting events rather than unique sessions reads
 * double. That matters beyond tidiness: Google Ads bids on "Survey completed".
 *
 * The two events carry `duration_ms` values 2-80ms apart, so they are two
 * distinct evaluations of `Date.now()` — two real calls, not a delivery retry.
 * A two-question survey reproduces the completion path deterministically.
 */
const analytics = vi.hoisted(() => ({
  complete: vi.fn(),
  start: vi.fn(),
  answer: vi.fn(),
  progress: vi.fn(),
  pause: vi.fn(),
  setCtx: vi.fn(),
  setVariant: vi.fn(),
}));
vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: analytics.start,
  trackSurveyAnswer: analytics.answer,
  trackSurveyProgress: analytics.progress,
  trackSurveyComplete: analytics.complete,
  trackSurveyPause: analytics.pause,
  setReportSubmissionContext: analytics.setCtx,
  setSurveyVariant: analytics.setVariant,
}));

const submitSpy = vi.hoisted(() => vi.fn());
vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: submitSpy,
    status: "idle",
    hasPendingCompletion: false,
    error: null,
    retry: vi.fn(),
    reset: vi.fn(),
  }),
}));

// A two-question survey: one scale, then the email step questionOrder puts last.
vi.mock("@/data/survey-data", () => ({
  surveyQuestions: [
    {
      qId: "01001",
      cId: 1,
      chapter: "Opening",
      question: "How satisfied are you right now?",
      answerType: "scale",
      options: ["1", "2", "3", "4", "5", "6", "7"],
      required: true,
    },
    {
      qId: "00000",
      cId: 99,
      chapter: "Contact",
      question: "What is your email?",
      answerType: "open",
      inputType: "email",
      options: [],
      required: true,
    },
  ],
}));

vi.mock("@features/survey/ui/hooks/usePartialSave", () => ({
  usePartialSave: () => ({ savePartial: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: vi.fn(), trackAnswerChange: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useUtmCapture", () => ({
  useUtmCapture: () => ({ utm: null }),
}));

import SurveyEngine from "@features/survey/ui/SurveyEngine";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

async function completeIt() {
  const user = userEvent.setup();
  render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
  const next = () => screen.getAllByRole("button").find((b) => /^next$/i.test(b.textContent ?? ""));
  // The scale renders its options as buttons with EMPTY labels, so pick by
  // position rather than by text.
  const blanks = screen.getAllByRole("button").filter((b) => !(b.textContent ?? "").trim());
  if (blanks[3]) await user.click(blanks[3]!);
  const n1 = next();
  if (n1) await user.click(n1);
  // Email step.
  await waitFor(() => expect(document.querySelector("input")).not.toBeNull());
  // The email step requires a matching CONFIRM field, so fill every input.
  for (const input of [...document.querySelectorAll("input")] as HTMLInputElement[]) {
    await user.type(input, "reader@example.com");
  }
  const n2 = next();
  if (n2) await user.click(n2);
  return { user, next };
}

describe("survey completion fires exactly once", () => {
  it("reaches completion and reports it a single time", async () => {
    await completeIt();
    await waitFor(() => expect(analytics.complete).toHaveBeenCalled());
    expect(analytics.complete).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it("stays at one when Next is pressed again after completing", async () => {
    // Four triggers reach goNext (button, keyboard, swipe, auto-advance), and a
    // second one arriving ~50ms later is the shape the production data shows.
    const { user, next } = await completeIt();
    await waitFor(() => expect(analytics.complete).toHaveBeenCalled());
    // The completion screen may render no buttons at all; the assertion is
    // that no further completion is reported either way.
    const again = screen.queryAllByRole("button").find((b) => /^next$/i.test(b.textContent ?? ""));
    if (again) {
      await user.click(again);
      await user.click(again);
    }
    expect(analytics.complete).toHaveBeenCalledTimes(1);
  });

  it("stays at one across a REMOUNT with the finished index restored", async () => {
    // `useSurveyState` persists `currentIndex` to localStorage and restores it,
    // while `hasCompleted` is a ref that resets — so a remount is the one way a
    // second completion could be reported for the same visit.
    await completeIt();
    await waitFor(() => expect(analytics.complete).toHaveBeenCalled());
    cleanup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(analytics.complete).toHaveBeenCalledTimes(1);
  });

  it("still completes when storage THROWS on every access", async () => {
    // Safari private mode and several in-app WebViews raise SecurityError on
    // every storage access. Losing the completion event there would be worse
    // than counting it twice, so a throw must fall through to firing.
    const real = window.sessionStorage;
    const boom = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom }),
    });
    try {
      await completeIt();
      await waitFor(() => expect(analytics.complete).toHaveBeenCalledTimes(1));
    } finally {
      Object.defineProperty(window, "sessionStorage", { configurable: true, value: real });
    }
  });
});
