// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The pre-report wizard as a reader meets it: inside SurveyEngine, after the last
 * question (final review, 30.09). The wizard's own tests render it alone, where its keys
 * and swipes worked; here the engine's window-level handlers ran too, swallowed
 * ArrowRight and Enter, and took ArrowLeft and a back swipe to the last question, whose
 * Next does nothing once the survey is submitted.
 */
const state = vi.hoisted(() => ({
  setCurrentIndex: vi.fn(),
  setAnswer: vi.fn(),
  getAnswer: vi.fn(() => null),
  clearState: vi.fn(),
  submit: vi.fn(),
  retryPending: vi.fn(),
  trackNavigation: vi.fn(),
  startedAt: new Date().toISOString(),
}));

vi.mock("@features/survey/ui/hooks/useSurveyState", () => ({
  useSurveyState: () => ({
    answers: {},
    // One past the last of the fixture's four questions: the survey is over.
    currentIndex: 4,
    startedAt: state.startedAt,
    prefilled: [],
    progress: 100,
    setAnswer: state.setAnswer,
    getAnswer: state.getAnswer,
    getLatestAnswers: () => ({}),
    setCurrentIndex: state.setCurrentIndex,
    clearState: state.clearState,
  }),
}));

vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: state.submit,
    retryPending: state.retryPending,
    hasPendingCompletion: false,
    status: "success",
  }),
}));

vi.mock("@features/survey/ui/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: state.trackNavigation }),
}));

vi.mock("@/data/survey-data", async () => {
  const { defaultSurveyQuestions } = await import("@/__tests__/__fixtures__/survey");
  return { surveyQuestions: defaultSurveyQuestions() };
});

vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyPause: vi.fn(),
  setReportSubmissionContext: vi.fn(),
  setSurveyVariant: vi.fn(),
  trackExperimentExposure: vi.fn(),
  trackWizardSlideAdvanced: vi.fn(),
  trackWizardMapStep: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    unoptimized: _unoptimized,
    ...props
  }: Record<string, unknown> & { alt?: string; unoptimized?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test-only mock for next/image
    <img {...props} alt={alt} />
  ),
}));

vi.mock("@features/survey/ui/ProcessingSequence", () => ({
  default: ({ onComplete }: { onComplete: () => void; submitDone: boolean }) => (
    <button onClick={onComplete}>Finish Processing</button>
  ),
}));

import SurveyEngine from "@features/survey/ui/SurveyEngine";

/** Let a slide's 250ms leave animation finish. */
const flush = (ms = 260) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });
const counter = () => screen.getByText(/^\d \/ 6$/).textContent;

const openWizard = () => {
  render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
  expect(counter()).toBe("1 / 6");
  state.setCurrentIndex.mockClear();
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("SurveyEngine — the wizard after the last question", () => {
  it("moves the wizard's slides with the arrow keys, never back into the survey", () => {
    openWizard();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    flush();
    expect(counter()).toBe("2 / 6");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    flush();
    expect(counter()).toBe("1 / 6");
    // On the first slide ArrowLeft has nowhere to go, in the wizard or out of it.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    flush();
    expect(counter()).toBe("1 / 6");
    expect(state.setCurrentIndex).not.toHaveBeenCalled();
  });

  it("moves on Enter", () => {
    openWizard();
    fireEvent.keyDown(window, { key: "Enter" });
    flush();
    expect(counter()).toBe("2 / 6");
  });

  it("takes a back swipe as the wizard's own, a slide back", () => {
    openWizard();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    flush();
    expect(counter()).toBe("2 / 6");
    const wizard = screen.getByRole("main");
    fireEvent.touchStart(wizard, { touches: [{ clientX: 40, clientY: 300 }] });
    fireEvent.touchEnd(wizard, { changedTouches: [{ clientX: 260, clientY: 304 }] });
    flush();
    expect(counter()).toBe("1 / 6");
    expect(state.setCurrentIndex).not.toHaveBeenCalled();
  });
});
