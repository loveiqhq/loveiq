// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AnswerSplit } from "@features/admin/server/ap/answers";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildSurveyQuestions } from "@features/admin/server/ap/survey";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";
import type { Table } from "@features/admin/server/ap/common";
import type { DropoffRun } from "@features/admin/server/dropoff-report";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";

import { factsFixture } from "./ap-fixtures";

const run = (sessionId: string, startedAt: string, reached: string[]): DropoffRun => ({
  sessionId,
  startedAt: Date.parse(startedAt),
  reached,
  leftAt: null,
  source: "other",
  device: null,
});
// The range's first two runs went through to the end before 16019 was asked; the last one had
// it: 16014 is reached by three, 16019 (next in today's order) by one, a fall to a third, but
// 16019 was added in the range. The third run left on question 1, so 01002 really loses one.
const every = askedQuestions(400).map((q) => q.qId);
const before16019 = every.filter((id) => id !== "16019");
const questions = buildSurveyQuestions(
  [
    run("a", "2026-10-01T10:00:00Z", before16019),
    run("b", "2026-10-01T11:00:00Z", before16019),
    run("c", "2026-10-02T10:00:00Z", ["00001"]),
    run("d", "2026-10-03T10:00:00Z", every),
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
// The CSV's tables as the page hands them over, without a download.
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import ApSurvey from "@features/admin/ui/ap/ApSurvey";

// A picked row scrolls to its detail; jsdom has no scrolling.
const scrolled = vi.fn();
Element.prototype.scrollIntoView = scrolled;

afterEach(() => {
  cleanup();
  scrolled.mockClear();
  view.payload = payload;
  view.answers = null;
});

const table = (name: string) => screen.getByRole("table", { name });
const rows = (name: string) => within(table(name)).getAllByRole("row").slice(1);
const column = (name: string, i: number) =>
  rows(name).map((r) => within(r).getAllByRole("cell")[i]!.textContent);

describe("the Survey page as drawn", () => {
  it("intro: the design's four tiles, six numbered cards, their times and engagement, sortable", () => {
    render(<ApSurvey />);
    // Before the tracking day the tiles are PostHog's: 100 sessions opened the intro, 20
    // skipped, 60 agreed, 55 answered question 1. No period before, so no change.
    const tile = (label: string) => screen.getByText(label).nextSibling!.textContent;
    expect(tile("Saw the intro")).toBe("100");
    // Whole percentages, as drawn.
    expect(tile("Agreed to consent")).toBe("60%");
    expect(tile("Skipped slides")).toBe("20%");
    expect(tile("Left before Q1")).toBe("45%");
    expect(screen.queryByText(/The engagement column is blank/)).toBeNull();

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

  it("intro CSV: the consent's Continue as the table shows it, PostHog's before our own", () => {
    render(<ApSurvey />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const intro = exported.sections.find((s) => s.name.startsWith("Intro wizard"))!.table;
    // A row's values follow its name: each sits one place left of its column.
    const cont = intro.columns.findIndex((c) => c.label === "Continue") - 1;
    expect(column("Intro wizard cards", 3)[5]).toBe("60%");
    expect(intro.rows[5]!.values[cont]).toBe(0.6);
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
    // 4 agreed and went on, of the 12 who began on the intro or the consent.
    expect(screen.getByText("Agreed to consent").nextSibling!.textContent).toBe("33%");
    // Our own skips and exits: 2 of the intro's 10 skipped; 2 + 1 + 2 of the 12 left on a card.
    expect(screen.getByText("Skipped slides").nextSibling!.textContent).toBe("20%");
    expect(screen.getByText("Left before Q1").nextSibling!.textContent).toBe("42%");
    // PostHog failed: the engagement column says why it is blank.
    expect(
      screen.getByText("The engagement column is blank: PostHog could not be read just now.")
    ).toBeTruthy();

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

    // Reached sorts by the share it shows. The consent's 6 include the two from the landing
    // page: by that count it would sit above slides 3 and 4 (5 each); by its 40% it is last.
    fireEvent.click(within(table(intro)).getByRole("button", { name: "Sort by Reached" }));
    expect(column(intro, 0)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(column(intro, 2).map((t) => t!.match(/^\d+%/)![0])).toEqual([
      "100%",
      "80%",
      "60%",
      "50%",
      "50%",
      "40%",
    ]);
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
    expect(screen.getByText(/less our own finished test runs/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Question funnel" })).toBeTruthy();
    expect(
      screen.getByText(
        "Survey sessions reaching each question, 1 Oct – 7 Oct 2026. Click a row to open it in Question detail."
      )
    ).toBeTruthy();
    // Four began; three went through to the last question (the third left on question 1).
    expect(screen.getByText("First step").nextSibling!.textContent).toBe("4");
    expect(screen.getByText("Reached last step").nextSibling!.textContent).toBe("75.0% · 3");
  });

  it("funnel: no orange for a question first asked in the range; sorts; searches", () => {
    render(<ApSurvey />);
    const funnel = "Survey question funnel";
    const row = (id: string) => rows(funnel).find((r) => r.textContent!.includes(id))!;
    // The picked row is purple, so pick one that is not under test.
    fireEvent.click(within(row(every[0]!)).getByRole("button"));
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
    fireEvent.change(search, { target: { value: "no such question" } });
    expect(screen.getByText("No question matches “no such question”.")).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    expect(rows(funnel).length).toBeGreaterThan(50);
  });

  it("funnel: exits and the drop-out rate per question, red above 5%; a row opens its detail", () => {
    // Four began; one left on question 1 and never finished.
    const left = (sessionId: string, startedAt: string, reached: string[]) => ({
      ...run(sessionId, startedAt, reached),
      leftAt: reached[reached.length - 1]!,
    });
    view.payload = {
      ...payload,
      questions: buildSurveyQuestions(
        [
          run("p", "2026-10-02T10:00:00Z", every),
          run("q", "2026-10-02T11:00:00Z", every),
          run("r", "2026-10-03T10:00:00Z", every),
          left("s", "2026-10-03T11:00:00Z", every.slice(0, 1)),
        ],
        { steps: [], exits: [] },
        "2026-10-01",
        "2026-10-07",
        "All traffic",
        null
      ),
    };
    render(<ApSurvey />);
    const funnel = "Survey question funnel";
    const row = (id: string) => rows(funnel).find((r) => r.textContent!.includes(id))!;
    const cells = (id: string) => within(row(id)).getAllByRole("cell");
    // One exit of the four who reached question 1.
    const q1 = every[0]!;
    expect(cells(q1)[5]!.textContent).toBe("1");
    expect(cells(q1)[6]!.textContent).toBe("25.00%");
    expect(cells(q1)[6]!.className).toContain("text-ap-bad");
    // Nobody left on question 2.
    expect(cells(every[1]!)[6]!.textContent).toBe("0.00%");
    expect(cells(every[1]!)[6]!.className).not.toContain("text-ap-bad");

    // A click on another row picks that one and scrolls to its detail.
    const pick = within(row(every[2]!)).getByRole("button");
    expect(pick).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pick);
    expect(pick).toHaveAttribute("aria-pressed", "true");
    expect(row(every[2]!).className).toContain("bg-ap-purple/10");
    expect(
      screen.getByText(new RegExp(`^Survey · Question detail · ${every[2]} · Step 3 of \\d+$`))
    ).toBeTruthy();
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect((scrolled.mock.contexts[0] as HTMLElement).id).toBe("question-detail");
    // One row is picked at a time.
    expect(
      within(table(funnel))
        .getAllByRole("button", { pressed: true })
        .map((b) => b.textContent)
    ).toHaveLength(1);
  });

  it("funnel: shades a real fall in a quiet range, though nobody reached it on the first day", () => {
    // Nobody began on 1 Oct. One run went to the end on the 2nd; one left on the 3rd after
    // question 31. Question 32 keeps one of the two, and was asked all along: shaded.
    view.payload = {
      ...payload,
      questions: buildSurveyQuestions(
        [
          run("p", "2026-10-02T10:00:00Z", every),
          run("q", "2026-10-03T10:00:00Z", every.slice(0, 31)),
        ],
        { steps: [], exits: [] },
        "2026-10-01",
        "2026-10-07",
        "All traffic",
        null
      ),
    };
    render(<ApSurvey />);
    const row = rows("Survey question funnel").find((r) => r.textContent!.includes(every[31]!))!;
    expect(row.textContent).toContain("50.0%");
    expect(row.className).toContain("bg-ap-orange");
  });
});
