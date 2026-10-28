// @vitest-environment jsdom
/**
 * The Survey page against Marcus's design (21 Oct 2026 call): the funnel's two question orders,
 * each never rising (24 Oct 2026), a question added during the range, Skipped over both orders, Completion
 * as submissions ÷ starts, the answers' groups as drawn, and an info icon on every figure.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { splitAnswers, type AnswerRow } from "@features/admin/server/ap/answers";
import type { Table } from "@features/admin/server/ap/common";
import { parseFilters } from "@features/admin/server/ap/filters";
import { ALL } from "@features/admin/server/ap/metrics";
import { buildSurveyQuestions } from "@features/admin/server/ap/survey";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";
import type { DropoffRun } from "@features/admin/server/dropoff-report";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import { metadata } from "@/app/admin/ap/assessment-a/survey/page";

import { factsFixture } from "./ap-fixtures";

const run = (sessionId: string, startedAt: string, reached: string[]): DropoffRun => ({
  sessionId,
  startedAt: Date.parse(startedAt),
  reached,
  leftAt: null,
  source: "other",
  device: null,
});
const survey = askedQuestions(400, "control").map((q) => q.qId);
const test = askedQuestions(400, "variant").map((q) => q.qId);
const without16019 = survey.filter((id) => id !== "16019");
// Two runs of the survey's order went to the end before 16019 was asked, a third had it; two
// runs were asked the test's order (their first six questions say so), and went to the end.
const questions = buildSurveyQuestions(
  [
    run("a", "2026-10-08T10:00:00Z", without16019),
    run("b", "2026-10-08T11:00:00Z", without16019),
    run("c", "2026-10-09T10:00:00Z", survey),
    run("v1", "2026-10-09T11:00:00Z", test),
    run("v2", "2026-10-09T12:00:00Z", test),
  ],
  {
    steps: [{ q_id: "16019", went_back: 0, skipped: 2, median_ms: 8400, timed: 3 }],
    exits: [],
    // 16019 first asked on 9 Oct, after a and b began.
    first_asked: { "16019": "2026-10-09T00:00:00Z" },
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
const payload = buildSurveyPage({
  facts: factsFixture({ from: "2026-10-07", to: "2026-10-13" }),
  previous: null,
  benchmark: factsFixture(),
  benchmarkKind: "all",
  filters: parseFilters({ period: "custom", from: "2026-10-07", to: "2026-10-13" }, "2026-10-14"),
  today: "2026-10-14",
  now: new Date("2026-10-14T10:00:00Z"),
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
      reachedQ1: 70,
      silhouette: 31,
    },
  },
});

const view = { payload };
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
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import ApSurvey from "@features/admin/ui/ap/ApSurvey";

Element.prototype.scrollIntoView = vi.fn();
afterEach(() => {
  cleanup();
  view.payload = payload;
});

const funnel = () => screen.getByRole("table", { name: "Survey question funnel" });
const funnelRows = () => within(funnel()).getAllByRole("row").slice(1);
const rowOf = (id: string) => funnelRows().find((r) => r.textContent!.includes(id))!;
const cells = (id: string) => within(rowOf(id)).getAllByRole("cell");

describe("the Survey page, Marcus's design", () => {
  it("names the browser tab as drawn", () => {
    expect(metadata.title).toBe("AP-Analytics · Survey analytics");
  });

  it("gives each question order its own funnel, the survey's first", () => {
    render(<ApSurvey />);
    const survey3 = screen.getByRole("button", { name: "Survey order · 3 runs" });
    const test2 = screen.getByRole("button", { name: "Test order (C13) · 2 runs" });
    expect(survey3).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText(/^Since 6 Oct 2026 half of new runs are asked the opening questions/)
    ).toBeTruthy();
    // The survey's order: question 3 is 01005, reached by its three runs.
    expect(funnelRows()[2]!.textContent).toContain(survey[2]);
    expect(screen.getByText("First step").nextSibling!.textContent).toBe("3");

    fireEvent.click(test2);
    expect(test2).toHaveAttribute("aria-pressed", "true");
    // The test's order, numbered in it: question 3 is 03011.
    expect(funnelRows()[2]!.textContent).toContain(test[2]);
    expect(cells(test[2]!)[0]!.textContent).toBe("3");
    expect(screen.getByText("First step").nextSibling!.textContent).toBe("2");
    // The detail follows the order picked.
    fireEvent.click(within(rowOf(test[2]!)).getByRole("button", { pressed: false }));
    expect(
      screen.getByText(new RegExp(`Question detail · ${test[2]} · Step 3 of 62$`))
    ).toBeTruthy();
  });

  it("counts a question added during the range for every run that went past it: no rise, no false fall", () => {
    render(<ApSurvey />);
    // 16019 was added: a and b went past it before it was asked, c had it. All three got that
    // far, so it reads 3 of 16014's 3, marked as added; its rates are over c, who was put it.
    expect(cells("16019")[1]!.textContent).toBe("3");
    expect(cells("16019")[4]!.textContent).toBe("100.0%");
    expect(rowOf("16019").className).not.toContain("bg-ap-orange");
    expect(rowOf("16019").textContent).toContain("added during the range");
    expect(cells("16020")[4]!.textContent).toBe("100.0%");
    // No question has more runs than the one before it, in either order.
    for (const name of [/^Survey order/, /^Test order/]) {
      fireEvent.click(screen.getByRole("button", { name }));
      const counts = funnelRows()
        .filter((r) => !r.textContent!.includes("not asked now"))
        .map((r) => Number(within(r).getAllByRole("cell")[1]!.textContent!.replace(/,/g, "")));
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  it("reads Skipped over every run the question was put to, in both orders", () => {
    render(<ApSurvey />);
    fireEvent.click(within(rowOf("16019")).getByRole("button", { pressed: false }));
    // 2 skips of the 1 + 2 runs 16019 was put to in either order (not a and b, who went past
    // it before it was asked), a tenth as drawn.
    const box = screen.getByText("Skipped").closest("div")!;
    expect(box.textContent).toContain("66.7%");
    expect(box.textContent).toContain("2 passed without an answer");
  });

  it("exports both orders' funnels", () => {
    render(<ApSurvey />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const names = exported.sections.map((s) => s.name);
    expect(names).toContain("Questions · survey order");
    expect(names).toContain("Questions · test order (C13)");
    const testTable = exported.sections.find((s) => s.name === "Questions · test order (C13)")!;
    expect(testTable.table.rows[2]!.label.startsWith(test[2]!)).toBe(true);
  });

  it("puts an info icon on every figure: tiles, columns, boxes, cards", () => {
    render(<ApSurvey />);
    const about = (name: string) => screen.getAllByRole("button", { name: `About ${name}` });
    for (const name of ["Survey starts", "Submissions", "Completion"])
      expect(about(name)).toHaveLength(1);
    for (const name of ["Saw the intro", "Agreed to consent", "Skipped slides", "Left before Q1"])
      expect(about(name)).toHaveLength(1);
    const funnelHead = within(funnel()).getAllByRole("row")[0]!;
    for (const name of ["Reached", "Funnel", "% of start", "% of prev.", "Exits", "Drop-out rate"])
      expect(within(funnelHead).getByRole("button", { name: `About ${name}` })).toBeTruthy();
    expect(within(funnelHead).getByRole("button", { name: "Sort by Median time" })).toBeTruthy();
    expect(within(funnelHead).getByRole("button", { name: "About Exits per day" })).toBeTruthy();
    const wizardHead = within(
      screen.getByRole("table", { name: "Intro wizard cards" })
    ).getAllByRole("row")[0]!;
    for (const name of ["Median time", "Reached", "Continue", "Skip intro", "Back", "Exit"])
      expect(within(wizardHead).getByRole("button", { name: `About ${name}` })).toBeTruthy();
    for (const name of ["Question funnel", "First step", "Reached last step", "Skipped"])
      expect(about(name).length).toBeGreaterThan(0);
    for (const name of ["Core demographics", "Country", "Gender", "Age", "Device", "Intro wizard"])
      expect(about(name).length).toBeGreaterThan(0);
    // The explanations moved into the cards.
    expect(screen.queryByText("How these are counted")).toBeNull();
  });

  it("counts Completion as the design does: submissions over starts", () => {
    const page = buildSurveyPage({
      facts: factsFixture(),
      previous: null,
      benchmark: factsFixture(),
      benchmarkKind: "all",
      filters: parseFilters(
        { period: "custom", from: "2026-10-01", to: "2026-10-07" },
        "2026-10-13"
      ),
      today: "2026-10-13",
      now: new Date("2026-10-13T10:00:00Z"),
      questions: null,
      questionsError: null,
      introClicks: null,
    });
    // 2 submissions over 14 starts (each probe left out); not the 10 starts that finished.
    const completion = page.tiles.find((t) => t.key === "completion")!;
    expect(completion.value).toBeCloseTo(2 / 14);
    expect(completion.foot).toBe("submissions per start");
  });
});

describe("the answers' groups, as drawn", () => {
  const row = (over: Partial<AnswerRow>): AnswerRow => ({
    answer: ["5"],
    other: null,
    src: "google",
    med: "cpc",
    ads: true,
    gender: null,
    relationship: null,
    device: "iOS",
    tier: "tier_1",
    ph: null,
    ...over,
  });
  const many = (n: number, over: Partial<AnswerRow>) => Array.from({ length: n }, () => row(over));
  const names = (
    dim: Parameters<typeof splitAnswers>[2],
    rows: AnswerRow[],
    other: string | null = null
  ) => splitAnswers("01005", rows, dim, other, ALL, rows.length).segments.map((s) => s.name);

  it("names no split All submissions and the devices Mobile and Desktop", () => {
    expect(names("none", many(5, {}))).toEqual(["All submissions"]);
    expect(names("device", [...many(6, {}), ...many(5, { device: "Desktop" })])).toEqual([
      "Mobile",
      "Desktop",
    ]);
  });

  it("groups relationships into three", () => {
    const rows = [
      ...many(4, { relationship: "In one exclusive relationship (only each other)" }),
      ...many(3, { relationship: "Non-exclusive, with agreed limits — known as 'open'" }),
      ...many(6, { relationship: "Single" }),
      ...many(3, { relationship: "Still figuring it out / doesn't fit a label" }),
      ...many(2, { relationship: null }),
    ];
    expect(names("relationship", rows)).toEqual([
      "In a relationship",
      "Single",
      "Other or not stated",
    ]);
  });

  it("names another question's scale sides with its id, three groups at most", () => {
    const rows = [
      ...many(7, { other: ["6"] }),
      ...many(6, { other: ["4"] }),
      ...many(5, { other: ["2"] }),
    ];
    expect(names("question", rows, "01002")).toEqual([
      "Agree on 01002",
      "Neutral on 01002",
      "Disagree on 01002",
    ]);
    const genders = ["Woman", "Man", "Nonbinary", "Other"].flatMap((g, i) =>
      many(9 - i, { gender: g })
    );
    const split = splitAnswers("01005", genders, "gender", null, ALL, genders.length);
    expect(split.segments).toHaveLength(3);
    expect(split.hidden.map((h) => h.name)).toEqual(["Other"]);
  });
});
