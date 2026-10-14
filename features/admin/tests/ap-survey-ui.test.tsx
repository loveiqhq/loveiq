// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnswerSplit } from "@features/admin/server/ap/answers";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildSurveyQuestions } from "@features/admin/server/ap/survey";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";
import type { DropoffRun } from "@features/admin/server/dropoff-report";

import { factsFixture } from "./ap-fixtures";

const run = (sessionId: string, startedAt: string, reached: string[]): DropoffRun => ({
  sessionId,
  startedAt: Date.parse(startedAt),
  reached,
  leftAt: null,
  source: "other",
  device: null,
});
// 16014 is reached by three people from before the range, 16019 (next in today's order) by
// one who began during it: a fall to a third, but 16019 was first asked in the range.
const questions = buildSurveyQuestions(
  [
    run("a", "2026-09-30T10:00:00Z", ["00001", "01002", "16014"]),
    run("b", "2026-09-30T10:00:00Z", ["00001", "01002", "16014"]),
    run("c", "2026-09-30T10:00:00Z", ["00001", "16014"]),
    run("d", "2026-10-03T10:00:00Z", ["00001", "16019"]),
  ],
  { steps: [], exits: [] },
  "2026-10-01",
  "2026-10-07",
  "All traffic",
  null
);
const payload = buildSurveyPage({
  facts: factsFixture({
    intro: [
      { day: "2026-10-01", step: "intro_slide_1", n: 4, ms: [4000, 9000, 5000], skipped: 1 },
      { day: "2026-10-01", step: "intro_slide_2", n: 3, ms: [12_000], skipped: 2 },
      { day: "2026-10-01", step: "intro_slide_4", n: 1, ms: [65_000], skipped: 0 },
    ],
  }),
  previous: null,
  benchmark: factsFixture(),
  benchmarkKind: "all",
  filters: parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, "2026-10-13"),
  today: "2026-10-13",
  now: new Date("2026-10-13T10:00:00Z"),
  questions,
  questionsError: null,
  introClicks: {
    ok: true,
    value: {
      opened: 100,
      skipped: 20,
      agreed: 60,
      returned: 5,
      trust: 6,
      terms: 8,
      answered: 55,
      silhouette: 31,
    },
  },
});

/** What the page fetches: the payload above unless a test swaps it, and no answers. */
const view: { payload: typeof payload; answers: AnswerSplit | null } = { payload, answers: null };

vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data:
      url === "/api/admin/ap/survey"
        ? view.payload
        : url === "/api/admin/ap/survey/answers"
          ? view.answers
          : null,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
vi.mock("@features/admin/ui/ap/ApOverview", () => ({ RangeLine: () => null }));

import ApSurvey from "@features/admin/ui/ap/ApSurvey";

afterEach(() => {
  cleanup();
  view.payload = payload;
  view.answers = null;
});

const table = (name: string) => screen.getByRole("table", { name });
const rows = (name: string) => within(table(name)).getAllByRole("row").slice(1);
const column = (name: string, i: number) =>
  rows(name).map((r) => within(r).getAllByRole("cell")[i]!.textContent);

describe("the Survey page as drawn", () => {
  it("intro: the design's boxes, six numbered cards, their times and engagement, sortable", () => {
    render(<ApSurvey />);
    expect(screen.getByText("Saw the intro")).toBeTruthy();
    expect(screen.getByText("most skips on slide 2")).toBeTruthy();
    // Left before Q1: 1 − 55 answered of 100.
    expect(screen.getByText("Left before Q1").nextSibling!.textContent).toBe("45.0%");
    expect(screen.getByText("incl. 5 Return to site")).toBeTruthy();
    expect(screen.getAllByText("Live")).toHaveLength(4);

    const intro = "Intro wizard cards";
    expect(column(intro, 0)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(column(intro, 1)).toEqual(["—", "0:05.0", "0:12", "—", "1:05", "—"]);
    const text = rows(intro).map((r) => r.textContent);
    expect(text[0]).toContain("31% tap the silhouette");
    // Whole percentages as drawn; a tenth under 10%, so a handful never reads "0%".
    expect(text[3]).toContain("6.0% open the Trust Zone");
    expect(text[5]).toContain("Return to site 5.0% · read the terms 8.0%");

    const byTime = within(table(intro)).getByRole("button", { name: "Sort by Time" });
    fireEvent.click(byTime);
    expect(column(intro, 1)).toEqual(["1:05", "0:12", "0:05.0", "—", "—", "—"]);
    fireEvent.click(byTime);
    expect(column(intro, 1)).toEqual(["0:05.0", "0:12", "1:05", "—", "—", "—"]);
  });

  it("intro: Skip intro, Back and Exit columns, which say when they start for an earlier range", () => {
    render(<ApSurvey />);
    const intro = "Intro wizard cards";
    for (const name of ["Skip intro", "Back", "Exit"]) {
      expect(within(table(intro)).getByRole("button", { name: `Sort by ${name}` })).toBeTruthy();
    }
    // 1 to 7 Oct is before the tracking day: no zeros, a note saying when they start.
    for (const i of [4, 5, 6]) expect(new Set(column(intro, i))).toEqual(new Set(["—"]));
    expect(
      screen.getByText(/recorded from 15 Oct 2026: pick a range from that day on/)
    ).toBeTruthy();
    // Before the consent recorded itself, its continue is PostHog's: 60 agreed of 100 sessions,
    // in whole percentages as drawn.
    expect(column(intro, 3)[5]).toBe("60%");
    // The device card: tablets are recorded from the same day.
    expect(screen.getByText("Recorded from 15 Oct 2026")).toBeTruthy();
  });

  it("intro from the tracking day: our own first two boxes, kept when PostHog fails, and the reds", () => {
    const row = (step: string, n: number, wentOn: number, left: number, direct = 0) => ({
      day: "2026-10-15",
      step,
      n,
      ms: [],
      skipped: 0,
      wentOn,
      left,
      direct,
    });
    view.payload = buildSurveyPage({
      facts: factsFixture({
        from: "2026-10-15",
        to: "2026-10-16",
        intro: [
          row("intro_view", 10, 8, 2),
          row("intro_slide_1", 8, 6, 0),
          row("intro_skip_1", 2, 0, 0),
          row("intro_slide_2", 6, 5, 0),
          row("intro_slide_3", 5, 5, 0),
          row("intro_slide_4", 5, 4, 1),
          // Two of its six came straight from the landing page's question card.
          row("consent_view", 6, 4, 2, 2),
        ],
      }),
      previous: null,
      benchmark: factsFixture(),
      benchmarkKind: "all",
      filters: parseFilters(
        { period: "custom", from: "2026-10-15", to: "2026-10-16" },
        "2026-10-17"
      ),
      today: "2026-10-17",
      now: new Date("2026-10-17T10:00:00Z"),
      questions,
      questionsError: null,
      introClicks: { ok: false, error: "PostHog could not be read just now." },
    });
    render(<ApSurvey />);
    expect(screen.getByText("Saw the intro").nextSibling!.textContent).toBe("10");
    expect(screen.getByText("visitors on the intro card")).toBeTruthy();
    // 4 agreed and went on, of the 12 who began on the intro or the consent.
    expect(screen.getByText("Agreed to consent").nextSibling!.textContent).toBe("33.3%");
    expect(screen.getByText("went on to question 1")).toBeTruthy();
    // PostHog's boxes give way to its one sentence; ours stay.
    expect(screen.queryByText("Skipped slides")).toBeNull();
    expect(screen.getByText("PostHog could not be read just now.")).toBeTruthy();

    const intro = "Intro wizard cards";
    expect(column(intro, 4)).toEqual(["—", "25%", "0%", "0%", "0%", "—"]);
    expect(column(intro, 6)).toEqual(["20%", "0%", "0%", "0%", "20%", "33%"]);
    // The consent's share leaves out the two from the landing page: 4 of the intro's 10.
    expect(column(intro, 2)[5]).toBe("40%6");
    const cell = (r: number, c: number) => within(rows(intro)[r]!).getAllByRole("cell")[c]!;
    // The design's red: Skip intro from 15%, Exit from 8%.
    expect(cell(1, 4).className).toContain("font-bold text-ap-bad");
    expect(cell(2, 4).className).not.toContain("text-ap-bad");
    expect(cell(5, 6).className).toContain("font-bold text-ap-bad");
    expect(cell(1, 6).className).not.toContain("text-ap-bad");
  });

  it("reads as drawn: the page's line, completed counts, the detail's step and its answers", () => {
    view.answers = {
      qid: "01002",
      question: "Right now, I feel satisfied with my sex life.",
      type: "scale",
      multiple: false,
      segments: [{ name: "All submissions", n: 10 }],
      answers: [{ label: "Strongly agree", shares: [0.5] }],
      gap: null,
      respondents: 10,
      finished: 12,
    };
    render(<ApSurvey />);
    expect(
      screen.getByText(
        "Where people slow down, engage or leave: wizard cards first, then every question."
      )
    ).toBeTruthy();
    expect(screen.getByText("This survey · 2 completed")).toBeTruthy();
    expect(screen.getByText("Benchmark · 2 completed")).toBeTruthy();
    expect(screen.getByText(/^Survey · Question detail · \d{5} · Step \d+ of \d+$/)).toBeTruthy();
    // A 140px label column leaves the bars room on a phone.
    expect(
      (screen.getByText("Strongly agree").parentElement as HTMLElement).style.gridTemplateColumns
    ).toBe("140px minmax(0,1fr)");
    expect(screen.getByRole("button", { name: "Show first 10 only" })).toBeTruthy();
    expect(screen.getByText(/our own finished test runs left out/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Survey Question Funnel" })).toBeTruthy();
    expect(screen.getByText("Reached last step")).toBeTruthy();
  });

  it("funnel: no orange for a question first asked in the range; sorts; shares the search", () => {
    render(<ApSurvey />);
    const funnel = "Survey question funnel";
    const row = (id: string) => rows(funnel).find((r) => r.textContent!.includes(id))!;
    // Both lose more than 5% of the step before; only the older question is shaded.
    expect(row("01002").className).toContain("bg-ap-orange");
    expect(row("16019").textContent).toContain("33.3%");
    expect(row("16019").className).not.toContain("bg-ap-orange");

    fireEvent.click(within(table(funnel)).getByRole("button", { name: "Sort by Reached" }));
    const reached = column(funnel, 1).map(Number);
    expect(reached).toEqual([...reached].sort((a, b) => b - a));

    const search = screen.getByRole("searchbox", { name: "Search questions" });
    fireEvent.change(search, { target: { value: "16019" } });
    expect(rows(funnel)).toHaveLength(1);
    const filter = screen.getByRole("button", { name: "Filter Question" });
    fireEvent.click(filter);
    expect(screen.getByPlaceholderText("Type to filter")).toHaveProperty("value", "16019");
    // Closing the filter clears the one search: both tables show every question again.
    fireEvent.click(filter);
    expect(search).toHaveProperty("value", "");
    expect(rows(funnel).length).toBeGreaterThan(50);
  });
});
