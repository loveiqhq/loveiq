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
const run = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: run.submit,
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
import { optInLabels } from "@features/survey/survey2/details";

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
  // jsdom draws no layout: the country search scrolls its highlighted option into view.
  Element.prototype.scrollIntoView = vi.fn();
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

describe("Survey 2.0's details screen", () => {
  const OPT_IN = surveyQuestions.find((q) => q.qId === "16015")!;
  const { yes: YES } = optInLabels(OPT_IN.options);
  const onDetails = (answers: Record<string, unknown>) =>
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers,
        currentIndex: at("00010"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );

  it("steps through the fields on Next and submits the five answers under today's ids", async () => {
    run.submit.mockClear();
    onDetails({});
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    const next = () => user.click(screen.getByRole("button", { name: /^next/i }));

    await user.type(await screen.findByLabelText("Name or nickname"), "Sam");
    await next();
    await user.type(await screen.findByLabelText("Email"), "sam.private@example.com");
    await next();
    await user.type(
      await screen.findByRole("combobox", { name: "Which country do you live in?" }),
      "Germany"
    );
    await user.click(await screen.findByRole("option", { name: /Germany/ }));
    await user.type(await screen.findByPlaceholderText("e.g. 10115"), "101");
    await next();
    expect(run.submit).not.toHaveBeenCalled(); // the newsletter answer is still missing
    await screen.findByText("Choose yes or no to finish.");
    await user.click(screen.getByRole("radio", { name: "Yes, keep learning" }));
    await next();

    await waitFor(() => expect(run.submit).toHaveBeenCalledTimes(1));
    expect(run.submit.mock.calls[0]![0]).toMatchObject({
      "00001": "Sam",
      "00000": "sam.private@example.com",
      "15001": "Germany",
      "15002": "101",
      "16015": YES,
    });
  });

  it("offers the miss-out sheet once, when No is picked", async () => {
    onDetails({ "00001": "Sam", "00000": "sam.private@example.com" });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 />);
    await user.click(await screen.findByRole("radio", { name: "No, thanks" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("radio", { name: "Yes, keep learning" }));
    await user.click(screen.getByRole("radio", { name: "No, thanks" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Survey 2.0's report map", () => {
  it("opens after 17002 and counts the two screens left", async () => {
    localStorage.setItem(
      "loveiq-survey-answers",
      JSON.stringify({
        answers: { "17002": 5 },
        currentIndex: at("17002"),
        startedAt: new Date().toISOString(),
        prefilled: [],
        orderArm: "survey2",
      })
    );
    const user = userEvent.setup();
    render(<SurveyEngine onExit={() => {}} onComplete={() => {}} survey2 sheets={["reportMap"]} />);
    await user.click(await screen.findByRole("button", { name: /^next/i }));
    expect(await screen.findByText(/2 questions left/)).toBeTruthy();
  });
});
