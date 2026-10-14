// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data: url === "/api/admin/ap/survey" ? payload : null,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
vi.mock("@features/admin/ui/ap/ApOverview", () => ({ RangeLine: () => null }));

import ApSurvey from "@features/admin/ui/ap/ApSurvey";

afterEach(cleanup);

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
    expect(column(intro, 1)).toEqual(["—", "5.0 s", "12.0 s", "—", "1:05", "—"]);
    const text = rows(intro).map((r) => r.textContent);
    expect(text[0]).toContain("31% tap the silhouette");
    // Whole percentages as drawn; a tenth under 10%, so a handful never reads "0%".
    expect(text[3]).toContain("6.0% open the Trust Zone");
    expect(text[5]).toContain("Return to site 5.0% · read the terms 8.0%");

    const byTime = within(table(intro)).getByRole("button", { name: "Sort by Time" });
    fireEvent.click(byTime);
    expect(column(intro, 1)).toEqual(["1:05", "12.0 s", "5.0 s", "—", "—", "—"]);
    fireEvent.click(byTime);
    expect(column(intro, 1)).toEqual(["5.0 s", "12.0 s", "1:05", "—", "—", "—"]);
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
