// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The opt-in's "Sure you want to miss out?" sheet in the real question screen (Mark, 10 Nov
 * 2026): a No on the last question opens it once per run instead of submitting, whichever
 * way the reader moves on. Its Yes submits the opt-in's own Yes, filed as given in the
 * sheet; Not now submits the No; closing it keeps the reader on the question.
 */
const analytics = vi.hoisted(() => ({ shown: vi.fn(), closed: vi.fn() }));
vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyFormError: vi.fn(),
  trackSurveyGuidanceExpanded: vi.fn(),
  trackSurveyPause: vi.fn(),
  trackOptInSheetShown: analytics.shown,
  trackOptInSheetClosed: analytics.closed,
  setReportSubmissionContext: vi.fn(),
  setSurveyVariant: vi.fn(),
}));
const run = vi.hoisted(() => ({ submit: vi.fn(), save: vi.fn(), navigation: vi.fn() }));
vi.mock("@features/survey/ui/hooks/useSubmitSurvey", () => ({
  useSubmitSurvey: () => ({
    submit: run.submit,
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
    },
    {
      qId: "16015",
      cId: 16,
      chapter: "Next Steps & Preferences",
      question: "Would you like to receive free LoveIQ hints and insights?",
      answerType: "single",
      options: [
        "Yes, I want to keep learning about myself.",
        "No, I am not interested in this growth opportunity.",
      ],
      required: true,
      guide: "",
      supportAndGuidance: "",
      formatGuidance: "Select one option.",
    },
  ],
}));
vi.mock("@features/survey/ui/hooks/usePartialSave", () => ({
  usePartialSave: () => ({ savePartial: run.save }),
}));
vi.mock("@features/survey/ui/hooks/useSurveyTracking", () => ({
  useSurveyTracking: () => ({ trackNavigation: run.navigation }),
}));
vi.mock("@features/survey/ui/hooks/useUtmCapture", () => ({
  useUtmCapture: () => ({ utm: null }),
}));

import SurveyEngine from "@features/survey/ui/SurveyEngine";

const QUESTION = "Would you like to receive free LoveIQ hints and insights?";
const YES = "Yes, I want to keep learning about myself.";
const NO = "No, I am not interested in this growth opportunity.";
const RUN = "2026-11-10T09:00:00.000Z";

/** A run resumed on the opt-in, the last question, with these answers. */
function onTheOptIn(answers: Record<string, unknown>) {
  localStorage.setItem(
    "loveiq-survey-answers",
    JSON.stringify({
      answers: { "01001": 4, ...answers },
      currentIndex: 1,
      startedAt: RUN,
      prefilled: [],
    })
  );
}

const engine = () => render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
const next = () => screen.getByRole("button", { name: /^next$/i });
const sheet = () => screen.queryByRole("dialog", { name: "Sure you want to miss out?" });
/** Past the sheet's guard against taps that land as it opens. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 450)));
/** Past the sheet's slide back down. */
const closed = () => act(() => new Promise((resolve) => setTimeout(resolve, 300)));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("the opt-in's miss-out sheet", () => {
  it("opens on a No and Next instead of submitting", async () => {
    onTheOptIn({ "16015": NO });
    engine();
    fireEvent.click(next());

    expect(sheet()).toBeInTheDocument();
    expect(run.submit).not.toHaveBeenCalled();
    expect(analytics.shown).toHaveBeenCalledTimes(1);
  });

  it("submits the opt-in's own Yes from its Yes, filed as given in the sheet", async () => {
    onTheOptIn({ "16015": NO });
    engine();
    fireEvent.click(next());
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Yes, I want to keep learning" }));

    expect(run.submit).toHaveBeenCalledTimes(1);
    const [answers, startedAt, , options] = run.submit.mock.calls[0]!;
    expect(answers).toMatchObject({ "16015": YES });
    expect(startedAt).toBe(RUN);
    expect(options).toEqual({ marketingOptInVia: "sheet" });
    expect(analytics.closed).toHaveBeenCalledWith({ outcome: "yes" });
    expect(sheet()).not.toBeInTheDocument();
  });

  it("submits the No from Not now, in one tap, not filed as the sheet's", async () => {
    onTheOptIn({ "16015": NO });
    engine();
    fireEvent.click(next());
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(run.submit).toHaveBeenCalledTimes(1);
    const [answers, , , options] = run.submit.mock.calls[0]!;
    expect(answers).toMatchObject({ "16015": NO });
    expect(options).toBeUndefined();
    expect(analytics.closed).toHaveBeenCalledWith({ outcome: "not_now" });
  });

  it("closes on Esc with the reader still on the question; the next Next submits without it", async () => {
    onTheOptIn({ "16015": NO });
    engine();
    fireEvent.click(next());
    fireEvent.keyDown(window, { key: "Escape" });
    await closed();

    expect(sheet()).not.toBeInTheDocument();
    expect(run.submit).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: QUESTION })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: NO })).toHaveAttribute("aria-checked", "true");
    expect(analytics.closed).toHaveBeenCalledWith({ outcome: "dismissed", via: "escape" });

    fireEvent.click(next());
    expect(sheet()).not.toBeInTheDocument();
    expect(run.submit).toHaveBeenCalledTimes(1);
    expect(run.submit.mock.calls[0]![0]).toMatchObject({ "16015": NO });
    expect(analytics.shown).toHaveBeenCalledTimes(1);
  });

  it("never opens on a Yes", () => {
    onTheOptIn({ "16015": YES });
    engine();
    fireEvent.click(next());

    expect(sheet()).not.toBeInTheDocument();
    expect(run.submit).toHaveBeenCalledTimes(1);
    expect(run.submit.mock.calls[0]![3]).toBeUndefined();
  });

  it("opens instead of Auto-advance's submit on a No", async () => {
    localStorage.setItem("loveiq-survey-autoadvance", "true");
    onTheOptIn({});
    const user = userEvent.setup();
    engine();
    await user.click(screen.getByRole("radio", { name: NO }));

    await waitFor(() => expect(sheet()).toBeInTheDocument(), { timeout: 2000 });
    expect(run.submit).not.toHaveBeenCalled();
  });

  it("takes the keyboard while open: the page's Enter and arrows neither submit nor move", () => {
    onTheOptIn({ "16015": NO });
    engine();
    fireEvent.click(next());
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });
    // ArrowLeft used to be Previous: it must not swap the question under the sheet.
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(run.submit).not.toHaveBeenCalled();
    expect(sheet()).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: QUESTION })).toBeInTheDocument();
  });

  it("goes with the question on Back, as the Pause dialog does", () => {
    onTheOptIn({ "16015": NO });
    engine();
    fireEvent.click(next());
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: { surveyQuestion: 0 } }));
    });

    expect(sheet()).not.toBeInTheDocument();
    expect(analytics.closed).toHaveBeenCalledWith({ outcome: "dismissed", via: "back" });
    expect(run.submit).not.toHaveBeenCalled();
  });

  it("asks once per run, also after a reload", () => {
    onTheOptIn({ "16015": NO });
    const first = engine();
    fireEvent.click(next());
    expect(sheet()).toBeInTheDocument();
    first.unmount();

    engine();
    fireEvent.click(next());
    expect(sheet()).not.toBeInTheDocument();
    expect(run.submit).toHaveBeenCalledTimes(1);
  });
});
