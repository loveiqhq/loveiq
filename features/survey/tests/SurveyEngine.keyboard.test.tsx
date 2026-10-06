// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Enter on a focused control belongs to that control. SurveyEngine's window-level
 * "Enter = next" used to take it: with an answer already given, Enter on a different
 * scale point moved the survey on AND cancelled the point's own press
 * (preventDefault on the keydown), so the changed answer was never saved — on the
 * last question, the old answer was submitted. Options and Next had the same trap.
 */
const analytics = vi.hoisted(() => ({ answer: vi.fn() }));
vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: analytics.answer,
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyFormError: vi.fn(),
  trackSurveyGuidanceExpanded: vi.fn(),
  setReportSubmissionContext: vi.fn(),
  setSurveyVariant: vi.fn(),
}));
vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: vi.fn(),
    retryPending: vi.fn(),
    status: "idle",
    hasPendingCompletion: false,
  }),
}));
vi.mock("@/data/survey-data", () => ({
  surveyQuestions: [
    {
      qId: "01001",
      cId: 1,
      chapter: "Opening",
      question: "How satisfied are you right now?",
      answerType: "scale",
      options: [],
      required: true,
      guide: "",
      supportAndGuidance: "",
      howAnswerIsUsed: "Context for the report.",
    },
    {
      qId: "02001",
      cId: 2,
      chapter: "Desire",
      question: "What usually happens first?",
      answerType: "single",
      options: ["Touch", "Fantasy"],
      required: true,
      guide: "",
      supportAndGuidance: "",
    },
  ],
}));
vi.mock("@features/survey/ui/hooks/usePartialSave", () => ({
  usePartialSave: () => ({ savePartial: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useUtmCapture", () => ({
  useUtmCapture: () => ({ utm: null }),
}));

import SurveyEngine from "@features/survey/ui/SurveyEngine";

const FIRST = "How satisfied are you right now?";
const SECOND = "What usually happens first?";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("Enter belongs to the focused control", () => {
  it("changes a scale answer from the keyboard, and stays on the question", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "3 of 7" }));

    screen.getByRole("button", { name: "6 of 7" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("button", { name: "6 of 7" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(analytics.answer).not.toHaveBeenCalled();
  });

  it("changes a chosen option from the keyboard, and stays on the question", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({ answers: { "01001": 4 }, currentIndex: 1, startedAt: "", prefilled: [] })
    );
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("radio", { name: /touch/i }));

    screen.getByRole("radio", { name: /fantasy/i }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("radio", { name: /fantasy/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(SECOND)).toBeInTheDocument();
  });

  it("moves on exactly once for Enter on Next", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "5 of 7" }));

    screen.getByRole("button", { name: "Next" }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByText(SECOND)).toBeInTheDocument();
    expect(analytics.answer).toHaveBeenCalledTimes(1);
  });

  it("still moves on for Enter with nothing focused, once answered", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "5 of 7" }));

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Enter}");

    expect(await screen.findByText(SECOND)).toBeInTheDocument();
    expect(analytics.answer).toHaveBeenCalledTimes(1);
  });
});
