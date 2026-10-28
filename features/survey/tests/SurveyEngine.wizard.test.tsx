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
  /** The reply said the survey was paid for before it was taken (pay to start): its wizard. */
  paidWizard: null as "pay_to_start" | "pay_to_start_initial" | null,
  /** The reply said the EUR 1.99 gate will stop this reader, at this price. */
  gatePriceCents: null as number | null,
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
    paidWizard: state.paidWizard,
    gatePriceCents: state.gatePriceCents,
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
import { PAID_WIZARD_KEY, GATE_PRICE_KEY } from "@features/survey/ui/hooks/surveySession";

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
  state.paidWizard = null;
  state.gatePriceCents = null;
  sessionStorage.clear();
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

describe("SurveyEngine — the wizard for a survey paid before it was taken", () => {
  const fourCounter = () => screen.getByText(/^\d \/ 4$/).textContent;
  const fiveCounter = () => screen.getByText(/^\d \/ 5$/).textContent;

  it("shows the four-slide wizard when the reply says the full report was paid for", () => {
    state.paidWizard = "pay_to_start";
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(fourCounter()).toBe("1 / 4");
  });

  it("shows the five, with the map, when it says the initial report was (Marcus, 20.10)", () => {
    state.paidWizard = "pay_to_start_initial";
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(fiveCounter()).toBe("1 / 5");
  });

  it("keeps it after a reload mid-wizard, from the tab's record", () => {
    sessionStorage.setItem(PAID_WIZARD_KEY, "pay_to_start_initial");
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(fiveCounter()).toBe("1 / 5");
  });

  it("reads a record from before the EUR 1.99 wizard as the full report's", () => {
    sessionStorage.setItem(PAID_WIZARD_KEY, "1");
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(fourCounter()).toBe("1 / 4");
  });

  it("shows everyone else the six", () => {
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    expect(counter()).toBe("1 / 6");
  });
});

// Eman, 27.10: the map names the EUR 1.99 to a reader the gate will stop, from the reply or,
// after a reload mid-wizard, from the tab's record.
describe("SurveyEngine — the map for a reader the EUR 1.99 gate will stop", () => {
  const firstLine = () => screen.getByText("your opening chapters").closest("p")!.textContent;
  const toMap = () => {
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /finish processing/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue to next slide/i }));
    flush();
  };

  it("names the price the reply gave", () => {
    state.gatePriceCents = 199;
    toMap();
    expect(firstLine()).toBe("Read your opening chapters in full for €1.99.");
  });

  it("keeps it after a reload mid-wizard, from the tab's record", () => {
    sessionStorage.setItem(GATE_PRICE_KEY, "199");
    toMap();
    expect(firstLine()).toBe("Read your opening chapters in full for €1.99.");
  });

  it("names none for anyone else", () => {
    toMap();
    expect(firstLine()).toBe("Read your opening chapters in full.");
  });
});
