// @vitest-environment jsdom
/**
 * "Time and drop-out per question" (Marcus's Survey copy board, 10 Nov 2026): the running survey
 * time, the 5% flag, the order toggle, an empty range; and the funnel table's median-time bar.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import { buildSurveyQuestions, type QuestionRow } from "@features/admin/server/ap/survey";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";
import type { DropoffRun } from "@features/admin/server/dropoff-report";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import { chapterBand, timeDropChart } from "@features/admin/ui/ap/SurveyTimeDrop";

import { factsFixture } from "./ap-fixtures";

const row = (id: string, n: number, medianMs: number | null, dropRate: number | null) =>
  ({ id, n, text: `Question ${id}`, medianMs, dropRate, exits: 0, shown: 10 }) as QuestionRow;

describe("the time and drop-out charts' figures", () => {
  it("adds the medians up in the order given; a question with no time adds nothing", () => {
    const c = timeDropChart([
      row("00001", 1, 8000, 0.1),
      row("01002", 2, null, 0.02),
      row("01005", 3, 12_000, 0),
      row("03011", 4, 40_000, null),
    ]);
    expect(c.cols.map((x) => x.soFarMs)).toEqual([8000, 8000, 20_000, 60_000]);
    // The other order of the same questions: the same total, reached another way.
    const swapped = timeDropChart([
      row("00001", 1, 8000, 0.1),
      row("03011", 2, 40_000, null),
      row("01005", 3, 12_000, 0),
    ]);
    expect(swapped.cols.map((x) => x.soFarMs)).toEqual([8000, 48_000, 60_000]);
    // Scales with exact quarter lines: 40 s (10 s each), 1 min of running time in 4 min.
    expect(c.secTop).toBe(40);
    expect(c.minTop).toBe(4);
  });

  it("calls a median well above average from 1.6 times the mean of the medians there are", () => {
    // Mean of 10, 10, 10 and 26 s is 14 s: 22.4 s and up is slow; the blank one counts nowhere.
    const c = timeDropChart([
      row("00001", 1, 10_000, 0),
      row("01002", 2, 10_000, 0),
      row("01005", 3, 10_000, 0),
      row("01006", 4, null, 0),
      row("02001", 5, 26_000, 0),
    ]);
    expect(c.cols.map((x) => x.slow)).toEqual([false, false, false, false, true]);
    // The factor itself: with 10, 10 and 10 s, 20 s is at it (×1.7 would miss it), 19.9 s under
    // it (×1.5 would take it).
    const last = (ms: number) =>
      timeDropChart(
        ["00001", "01002", "01005", "01006"].map((id, i) => row(id, i + 1, i < 3 ? 10_000 : ms, 0))
      ).cols[3]!.slow;
    expect([last(20_001), last(19_900)]).toEqual([true, false]);
    expect(timeDropChart([row("00001", 1, 0, 0), row("01002", 2, 0, 0)]).cols[0]!.slow).toBe(false);
  });

  it("flags a drop-out over 5% as its one-decimal figure reads it", () => {
    const c = timeDropChart([
      row("00001", 1, 1000, 0.0504),
      row("01002", 2, 1000, 0.0506),
      row("01005", 3, 1000, 0.05),
      row("01006", 4, 1000, 0.25),
      row("02001", 5, 1000, null),
    ]);
    // "5.0%" never is, "5.1%" always; nobody put the question is no flag.
    expect(c.cols.map((x) => x.over)).toEqual([false, true, false, true, false]);
    // At least 4%, as drawn; above it, exact quarter lines (25% → 32%, 8% each).
    expect(c.pctTop).toBe(32);
    expect(timeDropChart([row("00001", 1, 1000, 0.01)]).pctTop).toBe(4);
  });

  it("leaves out a question no longer asked and groups the chapters as drawn", () => {
    const c = timeDropChart([
      row("00001", 1, 1000, 0),
      row("01002", 2, 1000, 0),
      row("03011", 3, 1000, 0),
      row("08002", 4, 1000, 0),
      row("00000", 5, 1000, 0),
      row("16015", 6, 1000, 0),
      row("16003", 0, 99_000, 0.9),
    ]);
    expect(c.cols.map((x) => x.row.id)).not.toContain("16003");
    expect(c.bands).toEqual([
      { label: "Name", count: 1 },
      { label: "Desire & arousal", count: 2 },
      { label: "Attachment", count: 1 },
      { label: "Email", count: 1 },
      { label: "Goals & growth", count: 1 },
    ]);
    expect(["10002", "11004", "14020", "15003"].map(chapterBand)).toEqual([
      "Communication & power",
      "Communication & power",
      "Motivation",
      "About you",
    ]);
  });

  it("draws nothing for a range with no runs", () => {
    const c = timeDropChart([row("00001", 1, null, null), row("01002", 2, null, null)]);
    expect(c).toMatchObject({ timed: false, rated: false, secTop: 4, minTop: 4, pctTop: 4 });
    expect(timeDropChart([])).toMatchObject({ cols: [], bands: [], timed: false, rated: false });
  });
});

// The page, as the design test builds it: four runs in the survey's order (one left on the
// first question) and two in the test's, with times on three questions.
const survey = askedQuestions(400, "control").map((q) => q.qId);
const test = askedQuestions(400, "variant").map((q) => q.qId);
const run = (
  sessionId: string,
  startedAt: string,
  reached: string[],
  leftAt: string | null = null
): DropoffRun => ({
  sessionId,
  startedAt: Date.parse(startedAt),
  reached,
  leftAt,
  source: "other",
  device: null,
});
const questions = buildSurveyQuestions(
  [
    run("a", "2026-10-08T10:00:00Z", survey),
    run("b", "2026-10-08T11:00:00Z", survey),
    run("c", "2026-10-09T10:00:00Z", survey),
    run("d", "2026-10-09T10:30:00Z", survey.slice(0, 1), survey[0]!),
    run("v1", "2026-10-09T11:00:00Z", test),
    run("v2", "2026-10-09T12:00:00Z", test),
  ],
  {
    steps: [
      { q_id: "00001", went_back: 0, skipped: 0, median_ms: 8000, timed: 6 },
      { q_id: "01002", went_back: 0, skipped: 0, median_ms: 6000, timed: 5 },
      { q_id: "03011", went_back: 0, skipped: 0, median_ms: 30_000, timed: 5 },
    ],
    exits: [],
    orders: [
      { s: "v1", q: test.slice(0, 6) },
      { s: "v2", q: test.slice(0, 6) },
    ],
  },
  "2026-10-07",
  "2026-10-13",
  "All traffic",
  null
);
const page = (q: typeof questions | null, questionsError: string | null = null) =>
  buildSurveyPage({
    facts: factsFixture({ from: "2026-10-07", to: "2026-10-13" }),
    previous: null,
    benchmark: factsFixture(),
    benchmarkKind: "all",
    filters: parseFilters({ period: "custom", from: "2026-10-07", to: "2026-10-13" }, "2026-10-14"),
    today: "2026-10-14",
    now: new Date("2026-10-14T10:00:00Z"),
    questions: q,
    questionsError,
    introClicks: null,
  });
const view = { payload: page(questions) };
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data: url === "/api/admin/ap/survey" ? view.payload : null,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import ApSurvey from "@features/admin/ui/ap/ApSurvey";

const scrolled = vi.fn();
Element.prototype.scrollIntoView = scrolled;
afterEach(() => {
  cleanup();
  scrolled.mockClear();
  view.payload = page(questions);
});

/** A chart's keyboard box, and the questions of its columns in the order drawn. */
const chart = (name: string) => screen.getByRole("group", { name: new RegExp(`^${name}\\.`) });
const columns = (name: string) =>
  [...chart(name).parentElement!.querySelectorAll<HTMLElement>("[data-q]")].map((c) => ({
    id: c.dataset.q!,
    label: c.textContent,
    color: (c.lastElementChild as HTMLElement).style.background,
    height: (c.lastElementChild as HTMLElement).style.height,
  }));
const toggle = (name: string) => within(screen.getByRole("group", { name }));

describe("the Survey page's time and drop-out per question", () => {
  it("sits between the tiles and the question funnel, every question in survey order", () => {
    render(<ApSurvey />);
    const heading = screen.getByRole("heading", { name: "Time and drop-out per question" });
    const funnel = screen.getByRole("heading", { name: "Question funnel" });
    expect(heading.compareDocumentPosition(funnel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByText(
        "Every question in survey order. Hover a bar to see the question; click it to open it in Question detail."
      )
    ).toBeTruthy();
    expect(columns("Median time per question").map((c) => c.id)).toEqual(survey);
    expect(columns("Drop-out rate per question").map((c) => c.id)).toEqual(survey);
  });

  it("draws the median times, the slow one dark and labelled, with the time so far over them", () => {
    render(<ApSurvey />);
    const cols = columns("Median time per question");
    const at = (id: string) => cols.find((c) => c.id === id)!;
    // 8, 6 and 30 s on a 32 s scale (8 s lines); 30 s is 1.6 times their 14.7 s mean or more.
    expect(at("00001")).toMatchObject({ label: "", color: "rgb(185, 173, 223)", height: "25%" });
    expect(at("03011")).toMatchObject({
      label: "30 s",
      color: "rgb(90, 66, 166)",
      height: "93.8%",
    });
    expect(at("01005").height).toBe("0%");
    const plot = chart("Median time per question").parentElement!;
    const line = plot.querySelector("polyline")!.getAttribute("points")!.split(" ");
    // 44 s in all by the last question: 0.7 of a minute on a 4-minute scale.
    expect(line).toHaveLength(survey.length);
    expect(line[line.length - 1]).toBe(`${((61.5 / 62) * 100).toFixed(2)},81.67`);
    expect(within(plot.parentElement!).getByText("32 s")).toBeTruthy();
    expect(within(plot.parentElement!).getByText("4 min")).toBeTruthy();
  });

  it("flags the drop-out over 5% in orange with its one-decimal figure", () => {
    render(<ApSurvey />);
    const cols = columns("Drop-out rate per question");
    // One of the four runs put question 1 left there: 25.0% on a 32% scale.
    expect(cols[0]).toMatchObject({ label: "25.0%", color: "rgb(254, 104, 57)", height: "78.1%" });
    expect(cols[1]).toMatchObject({ label: "", color: "rgb(185, 173, 223)", height: "0%" });
  });

  it("follows the order picked here or in the funnel, and a picked bar opens its question", () => {
    render(<ApSurvey />);
    const charts = toggle("Question order for these charts");
    fireEvent.click(charts.getByRole("button", { name: "Test order (C13) · 2 runs" }));
    expect(columns("Median time per question").map((c) => c.id)).toEqual(test);
    expect(screen.getByText(/^Every question in the test's order \(C13\)\./)).toBeTruthy();
    // One choice for the page: the funnel's toggle and rows follow it.
    expect(
      toggle("Question order").getByRole("button", { name: "Test order (C13) · 2 runs" })
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      toggle("Question order").getByRole("button", { name: "Survey order · 4 runs" })
    );
    expect(charts.getByRole("button", { name: "Survey order · 4 runs" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(columns("Drop-out rate per question").map((c) => c.id)).toEqual(survey);

    // The keyboard reads a bar (the card's words, aloud) and Enter opens it in Question detail.
    const time = chart("Median time per question");
    fireEvent.focus(time);
    fireEvent.keyDown(time, { key: "Home" });
    expect(time.textContent).toContain("#1 · 00001 · Name");
    expect(time.textContent).toContain("Median time: 8 s");
    expect(time.textContent).toContain("Survey time so far: 0.1 min");
    // Question 2 is the detail's own first pick (the countable one most people leave on): go to 3.
    expect(screen.getByText(/^Survey · Question detail · 01002 · Step 2 of \d+$/)).toBeTruthy();
    fireEvent.keyDown(time, { key: "ArrowRight" });
    fireEvent.keyDown(time, { key: "ArrowRight" });
    fireEvent.keyDown(time, { key: "Enter" });
    expect(screen.getByText(/^Survey · Question detail · 01005 · Step 3 of \d+$/)).toBeTruthy();
    expect(scrolled).toHaveBeenCalled();
    expect((scrolled.mock.contexts.at(-1) as HTMLElement).id).toBe("question-detail");
  });

  it("has no toggle without runs in the test's order, and says why a range is blank", () => {
    view.payload = page(
      buildSurveyQuestions(
        [run("a", "2026-10-08T10:00:00Z", survey)],
        { steps: [], exits: [] },
        "2026-10-07",
        "2026-10-13",
        "All traffic",
        null
      )
    );
    render(<ApSurvey />);
    expect(screen.queryByRole("group", { name: "Question order for these charts" })).toBeNull();
    // Drop-out without a single time: the time chart says so.
    expect(screen.getByText("No time was recorded on the questions in this range.")).toBeTruthy();
    cleanup();

    view.payload = page(
      buildSurveyQuestions(
        [],
        { steps: [], exits: [] },
        "2026-10-07",
        "2026-10-13",
        "All traffic",
        null
      )
    );
    render(<ApSurvey />);
    expect(screen.getByText("No survey run began in this range.")).toBeTruthy();
    expect(screen.queryByRole("group", { name: /^Median time per question\./ })).toBeNull();
    cleanup();

    view.payload = page(null, "The questions could not be read.");
    render(<ApSurvey />);
    const section = screen
      .getByRole("heading", { name: "Time and drop-out per question" })
      .closest("section")!;
    expect(within(section).getByText("The questions could not be read.")).toBeTruthy();
  });

  it("puts an info card on each chart and on the running time", () => {
    render(<ApSurvey />);
    for (const name of [
      "Median time per question",
      "Drop-out rate per question",
      "Survey time so far (min)",
    ])
      expect(screen.getByRole("button", { name: `About ${name}` })).toBeTruthy();
  });
});

describe("the funnel table's median time bar", () => {
  it("draws each time against the slowest question, which is dark and full", () => {
    render(<ApSurvey />);
    const table = screen.getByRole("table", { name: "Survey question funnel" });
    const cell = (id: string) => {
      const r = within(table)
        .getAllByRole("row")
        .find((x) => x.textContent!.includes(id))!;
      return within(r).getAllByRole("cell")[7]!;
    };
    const fill = (id: string) => cell(id).querySelector<HTMLElement>("[aria-hidden] > span")!.style;
    expect(cell("03011").textContent).toBe("30 s");
    expect(fill("03011")).toMatchObject({ width: "100%", background: "rgb(90, 66, 166)" });
    expect(fill("00001")).toMatchObject({ width: "27%", background: "rgb(169, 155, 217)" });
    expect(fill("01005").width).toBe("0%");
    expect(cell("00001").title).toBe(
      "8 s median · 26.7% of the slowest question (30 s) · median of all questions 8 s"
    );
    expect(cell("01005").title).toBe("No time recorded");
  });
});
