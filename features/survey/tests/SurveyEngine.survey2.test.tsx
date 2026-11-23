// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Survey 2.0 in the real question screen, with the real question data: 16016 asked on two
 * screens (the areas, then the topics inside them), and new areas dropping the topics outside
 * them from the draft.
 */
vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyFormError: vi.fn(),
  trackSurveyGuidanceExpanded: vi.fn(),
  trackSurveyPause: vi.fn(),
  trackOptInSheetShown: vi.fn(),
  trackOptInSheetClosed: vi.fn(),
  trackSurveySheetShown: vi.fn(),
  trackSurveySheetClosed: vi.fn(),
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
vi.mock("@features/survey/ui/hooks/usePartialSave", () => ({
  usePartialSave: () => ({ savePartial: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: vi.fn() }),
}));
vi.mock("@features/survey/ui/hooks/useUtmCapture", () => ({
  useUtmCapture: () => ({ utm: null }),
}));

import { surveyQuestions } from "@/data/survey-data";
import SurveyEngine from "@features/survey/ui/SurveyEngine";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { SURVEY_SESSION_KEY } from "@features/survey/ui/hooks/surveySession";

const SCREENS = orderAskedQuestions(surveyQuestions, "survey2");
const at = (qId: string) => SCREENS.findIndex((q) => q.qId === qId);
const DATING = "Dating & Finding Love";
const WORK = "Work, Purpose & Money";
const STUCK = "Feeling stuck in your career";

const draft = () =>
  JSON.parse(localStorage.getItem("loveiq-survey-answers") ?? "{}") as {
    answers: Record<string, unknown>;
  };

beforeEach(() => {
  sessionStorage.setItem(SURVEY_SESSION_KEY, "00000000-0000-4000-8000-000000000001");
  localStorage.setItem(
    "loveiq-survey-answers",
    JSON.stringify({
      answers: {},
      currentIndex: at("16016a"),
      startedAt: new Date().toISOString(),
      prefilled: [],
      orderArm: "survey2",
    })
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Survey 2.0's two 16016 screens", () => {
  it("asks the areas, then only the topics inside them", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await screen.findByText(
      "Beyond sex, which areas would you most like to understand about yourself?"
    );
    await user.click(screen.getByText(DATING));
    await user.click(screen.getByText(WORK));
    await user.click(screen.getByRole("button", { name: /^next/i }));

    await screen.findByText(
      "In the areas you picked, which of these matter most to you right now?"
    );
    expect(screen.getByText(DATING)).toBeTruthy();
    expect(screen.getByText(WORK)).toBeTruthy();
    expect(screen.queryByText("Mood & Energy")).toBeNull();
  });

  it("prunes topics when areas change", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: { "16016a": [DATING, WORK], "16016": [STUCK] },
        currentIndex: at("16016a"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await screen.findByText(
      "Beyond sex, which areas would you most like to understand about yourself?"
    );
    await user.click(screen.getByText(WORK)); // unpick the area STUCK sits in
    await waitFor(() => expect(draft().answers["16016"]).toEqual([]));
    expect(draft().answers["16016a"]).toEqual([DATING]);
  });
});
