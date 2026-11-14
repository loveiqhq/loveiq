// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The sheets between questions in the real question screen (Mark, 11 Nov 2026): a sheet
 * placed after a question holds the move, whichever way the reader moves on, and Keep going
 * carries on; one placed before a question rises over it as it arrives; each opens once per
 * run, only with its switch on, never with a price for a reader who paid before the survey,
 * and never when it would draw nothing.
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
  trackOptInSheetShown: vi.fn(),
  trackOptInSheetClosed: vi.fn(),
  trackSurveySheetShown: analytics.shown,
  trackSurveySheetClosed: analytics.closed,
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

const scale = (qId: string, question: string) => ({
  qId,
  cId: Number(qId.slice(0, 2)),
  chapter: "Chapter",
  question,
  answerType: "scale",
  options: [],
  required: true,
  guide: "",
  supportAndGuidance: "",
});
const single = (qId: string, question: string, options: string[]) => ({
  ...scale(qId, question),
  answerType: "single",
  options,
  formatGuidance: "Select one option.",
});
const QUESTIONS = vi.hoisted(() => [] as unknown[]);
vi.mock("@/data/survey-data", () => ({ surveyQuestions: QUESTIONS }));
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
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { SURVEY_SHEET_IDS, type SurveySheetId } from "@features/survey/surveySheets";
import { SURVEY_SESSION_KEY } from "@features/survey/ui/hooks/surveySession";
import { assignGateRevealArm } from "@shared/experiments/gateRevealArm";

const RESPOND = "The other person starts things — I respond to them";
QUESTIONS.push(
  scale("01001", "How satisfied are you right now?"),
  single("02004", "What kind of starting point usually leads to the best sex for you?", [
    "I'm the one who starts things — I make the first move",
    RESPOND,
    "It works best when we plan it ahead and both know it's coming",
    "It happens naturally, with no one having to start",
  ]),
  scale("03008", "I prefer sex that is intense and high-energy."),
  scale("01003", "Filler three."),
  ...Array.from({ length: 8 }, (_, i) => scale(`9000${i + 1}`, `Filler ${i + 4}.`)),
  scale("01005", "I want more variety."),
  scale("11003", "During sex, I focus more on the other person's pleasure."),
  single("16005", "Which of these best describes where your sexuality feels right now?", [
    "Pausing",
    "Steady",
  ]),
  scale("90010", "Three questions follow this one."),
  scale("90011", "Tail one."),
  scale("90012", "Tail two."),
  scale("90013", "Tail three.")
);

const ORDER = orderAskedQuestions(
  QUESTIONS as Parameters<typeof orderAskedQuestions>[0],
  "control"
);
const at = (qId: string) => ORDER.findIndex((q) => q.qId === qId);
const RUN = "2026-11-12T01:00:00.000Z";

/** A run resumed on the question at `index`, answered. */
function onQuestion(index: number, answer: unknown = 4) {
  localStorage.setItem(
    "loveiq-survey-answers",
    JSON.stringify({
      answers: { [ORDER[index]!.qId]: answer },
      currentIndex: index,
      startedAt: RUN,
      prefilled: [],
    })
  );
}

/**
 * The engine with these sheets, offered as a staging preview offers them, so no half of Mark's
 * 50/50 holds back the two that promise a free archetype (`previewed`); the arm has tests of
 * its own below.
 */
const engine = (
  sheets: readonly SurveySheetId[] = SURVEY_SHEET_IDS,
  payToStart = false,
  previewed: readonly SurveySheetId[] = sheets
) =>
  render(
    <SurveyEngine
      onExit={vi.fn()}
      onComplete={vi.fn()}
      sheets={sheets}
      previewedSheets={previewed}
      payToStart={payToStart}
    />
  );
const next = () => screen.getByRole("button", { name: /^next$/i });
const heading = (index: number) =>
  screen.queryByRole("heading", { name: ORDER[index]!.question, level: 1 }) ??
  screen.queryByText(ORDER[index]!.question);
const dialog = (name: string | RegExp) => screen.queryByRole("dialog", { name });
/** Past the sheet's guard against taps that land as it opens. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 450)));
/** Past the slide away. */
const gone = () => act(() => new Promise((resolve) => setTimeout(resolve, 300)));
const keepGoing = () => screen.getByRole("button", { name: "Keep going" });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

describe("the sheets between questions", () => {
  it("lays the test's questions out where the placements need them", () => {
    expect(at("02004")).toBeGreaterThanOrEqual(0);
    expect(at("01005")).toBeGreaterThanOrEqual(10);
    expect(ORDER[ORDER.length - 4]!.qId).toBe("90010");
  });

  it("holds the move after 02004 and shows Mark's message, the same for every answer", () => {
    onQuestion(at("02004"), RESPOND);
    engine();
    fireEvent.click(next());

    expect(dialog("More people love to respond")).toBeInTheDocument();
    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveTextContent(
      "say their best sex starts when the other person makes the first move. Only"
    );
    expect(sheet).toHaveTextContent("say it’s when they start.");
    // The shares a screen reader hears, before the digits count up to them: the 12% counts
    // up too since Mark's second review (13 Nov).
    expect([...sheet.querySelectorAll(".sr-only")].map((n) => n.textContent)).toEqual(
      expect.arrayContaining(["36%", "12%"])
    );
    expect(sheet.querySelectorAll("[data-count-up]")).toHaveLength(2);
    expect(heading(at("02004"))).toBeInTheDocument();
    expect(analytics.shown).toHaveBeenCalledWith({ sheet: "science", question_id: "02004" });
  });

  it("Keep going closes it and carries on to the next question", async () => {
    onQuestion(at("02004"), RESPOND);
    engine();
    fireEvent.click(next());
    await settle();
    fireEvent.click(keepGoing());
    await gone();

    expect(dialog(/More people love to respond/)).not.toBeInTheDocument();
    expect(heading(at("02004") + 1)).toBeInTheDocument();
    expect(analytics.closed).toHaveBeenCalledWith(
      { sheet: "science", question_id: "02004" },
      expect.objectContaining({ via: "keep_going" })
    );
  });

  it("ignores Keep going in its first moments, so a double tap on Next cannot skip it", () => {
    onQuestion(at("02004"), RESPOND);
    engine();
    fireEvent.click(next());
    fireEvent.click(keepGoing());

    expect(dialog(/More people love to respond/)).toBeInTheDocument();
    expect(heading(at("02004"))).toBeInTheDocument();
  });

  it("takes the keyboard while open: Enter and the arrows neither move nor go back", () => {
    onQuestion(at("02004"), RESPOND);
    engine();
    fireEvent.click(next());
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });

    expect(dialog(/More people love to respond/)).toBeInTheDocument();
    expect(heading(at("02004"))).toBeInTheDocument();
  });

  it("carries on when closed without the button (Esc): these sheets ask nothing", async () => {
    onQuestion(at("02004"), RESPOND);
    engine();
    fireEvent.click(next());
    fireEvent.keyDown(window, { key: "Escape" });
    await gone();

    expect(heading(at("02004") + 1)).toBeInTheDocument();
    expect(analytics.closed).toHaveBeenCalledWith(
      { sheet: "science", question_id: "02004" },
      expect.objectContaining({ via: "escape" })
    );
  });

  it("opens instead of Auto-advance's move", async () => {
    localStorage.setItem("loveiq-survey-autoadvance", "true");
    onQuestion(at("02004"), null);
    const user = userEvent.setup();
    engine();
    await user.click(screen.getByRole("radio", { name: RESPOND }));

    await waitFor(() => expect(dialog(/More people love to respond/)).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(heading(at("02004"))).toBeInTheDocument();
  });

  it("goes with the question on Back", async () => {
    onQuestion(at("02004"), RESPOND);
    engine();
    fireEvent.click(next());
    act(() => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { surveyQuestion: at("02004") - 1 } })
      );
    });
    await gone();

    expect(dialog(/More people love to respond/)).not.toBeInTheDocument();
    expect(analytics.closed).toHaveBeenCalledWith(
      { sheet: "science", question_id: "02004" },
      expect.objectContaining({ via: "back" })
    );
  });

  it("opens once per run, also after a reload", () => {
    onQuestion(at("02004"), RESPOND);
    const first = engine();
    fireEvent.click(next());
    expect(dialog(/More people love to respond/)).toBeInTheDocument();
    first.unmount();

    engine();
    fireEvent.click(next());
    expect(dialog(/More people love to respond/)).not.toBeInTheDocument();
    expect(heading(at("02004") + 1)).toBeInTheDocument();
    expect(analytics.shown).toHaveBeenCalledTimes(1);
  });

  it("rises over 01005 as it arrives; Keep going leaves the reader there", async () => {
    onQuestion(at("01005") - 1);
    engine();
    fireEvent.click(next());

    expect(dialog("Dr. Dijana Galijašević")).toBeInTheDocument();
    expect(heading(at("01005"))).toBeInTheDocument();
    await settle();
    fireEvent.click(keepGoing());
    await gone();
    expect(dialog("Dr. Dijana Galijašević")).not.toBeInTheDocument();
    expect(heading(at("01005"))).toBeInTheDocument();
  });

  it("opens nothing with its switch off", () => {
    onQuestion(at("02004"), RESPOND);
    engine([]);
    fireEvent.click(next());

    expect(dialog(/More people love to respond/)).not.toBeInTheDocument();
    expect(heading(at("02004") + 1)).toBeInTheDocument();
    expect(analytics.shown).not.toHaveBeenCalled();
  });

  it("never shows a reader who paid before the survey a sheet with a price", () => {
    onQuestion(at("11003"));
    engine(SURVEY_SHEET_IDS, true);
    fireEvent.click(next());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(heading(at("11003") + 1)).toBeInTheDocument();
  });

  it("never holds the move for a Trustpilot sheet that would draw nothing", () => {
    // No Trustpilot switch or numbers in the test environment.
    onQuestion(at("03008"));
    engine(["trustpilot"]);
    fireEvent.click(next());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(heading(at("03008") + 1)).toBeInTheDocument();
  });

  it("halfway: the steps, with the minutes the progress strip counts", () => {
    onQuestion(at("11003"));
    engine();
    fireEvent.click(next());

    const sheet = dialog(/You’re already halfway/);
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveTextContent(/Only ~\d+ more minutes\./);
    expect(sheet).toHaveTextContent("Your Core Archetype is taking shape.");
    // Mark's review (12 Nov): no tick beside the heading; the three steps arrive one by one.
    expect(screen.queryByRole("img", { name: "First half done" })).not.toBeInTheDocument();
    const steps = sheet!.querySelectorAll("[data-halfway-step]");
    expect(steps).toHaveLength(3);
    const delays = [...steps].map((s) =>
      Number.parseInt((s as HTMLElement).style.getPropertyValue("--sheet-delay"), 10)
    );
    expect(delays[1]! - delays[0]!).toBeGreaterThanOrEqual(250);
    expect(delays[2]! - delays[1]!).toBeGreaterThanOrEqual(250);
  });

  it("State of Desire: the box starts unticked; Keep going says whether it was ticked", async () => {
    onQuestion(at("16005"), "Steady");
    engine();
    fireEvent.click(next());
    const box = screen.getByRole("checkbox");
    expect(box).not.toBeChecked();
    // One line of text on a wide sheet: no forced break before "5€ off" (Mark's review, 12 Nov).
    expect(box.closest("label")!.querySelector("br")).toBeNull();
    expect(box.closest("label")).toHaveTextContent("Email me a 5€ off code.");
    fireEvent.click(box);
    expect(box).toBeChecked();
    await settle();
    fireEvent.click(keepGoing());

    expect(analytics.closed).toHaveBeenCalledWith(
      { sheet: "desire", question_id: "16005" },
      expect.objectContaining({ via: "keep_going", ticked: true })
    );
  });

  it("the map: three left; Previous stays on the question, Next carries on", async () => {
    const index = ORDER.length - 4;
    onQuestion(index);
    engine();
    fireEvent.click(next());
    const map = dialog(/Only 3 questions left/);
    expect(map).toBeInTheDocument();
    expect(map).toHaveTextContent("17 Chapters");
    // Mark's board: the line breaks after "your Light Report".
    expect(map).toHaveTextContent(
      /your Light Report\s*also opening part of each featured chapter\./
    );
    // Bigger from 640px (Mark's review, 12 Nov): 0.7872 on a phone, 1.2 on a desktop.
    expect(map!.querySelector("[data-report-map]")!.className).toMatch(/sm:\[zoom:1\.2\]/);
    await settle();
    const previous = screen
      .getAllByRole("button", { name: /previous/i })
      .find((b) => map!.contains(b))!;
    fireEvent.click(previous);
    await gone();
    expect(dialog(/Only 3 questions left/)).not.toBeInTheDocument();
    expect(heading(index)).toBeInTheDocument();
    expect(analytics.closed).toHaveBeenCalledWith(
      { sheet: "reportMap", question_id: "90010" },
      expect.objectContaining({ via: "previous" })
    );
  });
});

// Fatih, 14 Nov: the halfway sheet and the report map promise the archetype for free, which
// only Mark's new EUR 1.99 page gives, so they open only for that page's half of his 50/50.
// The half comes from the run's session id, the one the report's server reads for the gate.
describe("the sheets in Mark's 50/50 of the new EUR 1.99 page", () => {
  const sessionIn = (arm: "control" | "reveal") => {
    for (let i = 0; ; i += 1) {
      const id = `11111111-2222-4333-8444-${String(i).padStart(12, "0")}`;
      if (assignGateRevealArm(id) === arm) return id;
    }
  };
  afterEach(() => sessionStorage.clear());

  it("opens the report map for the new page's half", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, sessionIn("reveal"));
    onQuestion(ORDER.length - 4);
    engine(SURVEY_SHEET_IDS, false, []);
    fireEvent.click(next());
    expect(dialog(/Only 3 questions left/)).toBeInTheDocument();
  });

  it("keeps it shut for today's half, who carries straight on", () => {
    sessionStorage.setItem(SURVEY_SESSION_KEY, sessionIn("control"));
    const index = ORDER.length - 4;
    onQuestion(index);
    engine(SURVEY_SHEET_IDS, false, []);
    fireEvent.click(next());
    expect(dialog(/Only 3 questions left/)).not.toBeInTheDocument();
    expect(heading(index + 1)).toBeInTheDocument();
  });
});
