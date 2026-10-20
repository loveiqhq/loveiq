// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Auto-advance and Pause on the real question screen. Both left with the 2026-10-04
 * redesign (623373db) and came back on Marcus's review of 20.10 ("What happened to our
 * 'Pause + Auto answer options toggle'?"). SurveyEngine.test.tsx has their history cases.
 */
const analytics = vi.hoisted(() => ({ pause: vi.fn() }));
vi.mock("@features/analytics/client", () => ({
  trackSurveyStart: vi.fn(),
  trackSurveyAnswer: vi.fn(),
  trackSurveyProgress: vi.fn(),
  trackSurveyComplete: vi.fn(),
  trackSurveyFormError: vi.fn(),
  trackSurveyGuidanceExpanded: vi.fn(),
  trackSurveyPause: analytics.pause,
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
      qId: "02001",
      cId: 2,
      chapter: "Desire",
      question: "What usually happens first?",
      answerType: "single",
      options: ["Touch", "Other (please specify)"],
      required: true,
      guide: "",
      supportAndGuidance: "",
    },
    {
      qId: "03001",
      cId: 3,
      chapter: "Closeness",
      question: "What helps you feel close?",
      answerType: "multiple",
      options: ["Kissing", "Massage"],
      required: true,
      guide: "",
      supportAndGuidance: "",
    },
    {
      qId: "04001",
      cId: 4,
      chapter: "Closing",
      question: "Would you take it again?",
      answerType: "single",
      options: ["Yes", "No"],
      required: true,
      guide: "",
      supportAndGuidance: "",
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

const FIRST = "How satisfied are you right now?";
const SECOND = "What usually happens first?";
const THIRD = "What helps you feel close?";

/** The draft the survey keeps in localStorage: what it has saved. */
const saved = () =>
  JSON.parse(localStorage.getItem("loveiq-survey-answers") ?? "{}") as {
    answers?: Record<string, unknown>;
  };

/** A run resumed on question `index` (0-based). */
function resumeAt(index: number, answers: Record<string, unknown>) {
  localStorage.setItem(
    "loveiq-survey-answers",
    JSON.stringify({ answers, currentIndex: index, startedAt: "", prefilled: [] })
  );
}

const turnedOn = () => localStorage.setItem("loveiq-survey-autoadvance", "true");
/** Long past Auto-advance's 350 ms. */
const pastTheMove = () => act(() => new Promise((resolve) => setTimeout(resolve, 500)));
const autoAdvance = () => screen.getByRole("button", { name: "Auto-advance" });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe("Auto-advance", () => {
  it("is off by default: an answer waits for Next", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    expect(autoAdvance()).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: "5 of 7" }));
    await pastTheMove();

    expect(screen.getByText(FIRST)).toBeInTheDocument();
  });

  it("once on, moves on a moment after a scale point or an option, and is remembered", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await user.click(autoAdvance());
    expect(autoAdvance()).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("loveiq-survey-autoadvance")).toBe("true");

    await user.click(screen.getByRole("button", { name: "5 of 7" }));
    // A moment later, not at once: the reader sees what they chose.
    expect(screen.getByText(FIRST)).toBeInTheDocument();
    expect(await screen.findByText(SECOND, {}, { timeout: 2000 })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /touch/i }));
    expect(await screen.findByText(THIRD, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(saved().answers).toMatchObject({ "01001": 5, "02001": "Touch" });
  });

  it("waits for Other's text", async () => {
    turnedOn();
    resumeAt(1, { "01001": 4 });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /other/i }));
    await pastTheMove();

    expect(screen.getByText(SECOND)).toBeInTheDocument();
  });

  it("never moves a multiple choice on", async () => {
    turnedOn();
    resumeAt(2, { "01001": 4, "02001": "Touch" });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    await user.click(screen.getByRole("checkbox", { name: /kissing/i }));
    await pastTheMove();

    expect(screen.getByText(THIRD)).toBeInTheDocument();
  });

  it("drops the move an answer scheduled when the reader goes back", async () => {
    turnedOn();
    resumeAt(1, { "01001": 4 });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /touch/i }));
    await user.click(screen.getByRole("button", { name: /previous/i }));
    await pastTheMove();

    expect(screen.getByText(FIRST)).toBeInTheDocument();
  });

  it("files the last question with the answer just chosen", async () => {
    // Production, 09.2026: the move's callback predated the answer's render, and the last
    // question was submitted without it (e2e/survey-last-answer.spec.ts).
    turnedOn();
    resumeAt(3, { "01001": 4, "02001": "Touch", "03001": ["Kissing"] });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    await user.click(screen.getByRole("radio", { name: /yes/i }));

    await waitFor(() => expect(run.submit).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(run.submit.mock.calls[0]![0]).toMatchObject({ "04001": "Yes" });
  });

  it("takes Enter on the focused switch as a flip of the switch, not as Next", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "5 of 7" }));

    autoAdvance().focus();
    await user.keyboard("{Enter}");
    await pastTheMove();

    expect(autoAdvance()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(FIRST)).toBeInTheDocument();
  });
});

describe("Pause", () => {
  it("saves the run, records where, and says the reminders go to the reader's email", async () => {
    resumeAt(1, { "01001": 4, "00000": "reader@example.com" });
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(run.save).toHaveBeenCalledTimes(1);
    expect(run.navigation).toHaveBeenCalledWith("abandon");
    // Question 2 of 4: a quarter of the way in.
    expect(analytics.pause).toHaveBeenCalledWith("02001", 25);
    const dialog = screen.getByRole("dialog", { name: /paused the test/i });
    expect(dialog).toHaveTextContent("reader@example.com");
  });

  it("says the run is saved on this device when there is no email yet", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(screen.getByRole("dialog", { name: /paused the test/i })).toHaveTextContent(
      /saved on this device/i
    );
  });

  it("holds the keys while open, and Continue goes back to the same question", async () => {
    const user = userEvent.setup();
    render(<SurveyEngine onExit={vi.fn()} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "5 of 7" }));
    await user.click(screen.getByRole("button", { name: "Pause" }));

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: /paused the test/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue where i left off/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(FIRST)).toBeInTheDocument();
  });

  it("leaves through the survey's way out on Go back to main page", async () => {
    const onExit = vi.fn();
    const user = userEvent.setup();
    render(<SurveyEngine onExit={onExit} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Pause" }));

    await user.click(screen.getByRole("button", { name: /go back to main page/i }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
