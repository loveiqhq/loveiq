// @vitest-environment jsdom
/**
 * Survey 2.0 (Mark's survey review, behind the `survey_2` switch) in AP-Analytics: a third
 * question order with its own funnel. Its runs are told by their first questions, as C13's were:
 * 2.0 opens on 10003 and asks the name on its last screen, so no classic run fits it.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table } from "@features/admin/server/ap/common";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildSurveyQuestions, runOrder } from "@features/admin/server/ap/survey";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";
import type { DropoffRun } from "@features/admin/server/dropoff-report";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import { fields } from "@features/admin/ui/ap/fields/survey";
import { chapterBand } from "@features/admin/ui/ap/SurveyTimeDrop";
import { QUESTION_ORDER_TEST_END } from "@shared/experiments/questionOrderArm";

import { factsFixture } from "./ap-fixtures";

const ids = (arm: "control" | "variant" | "survey2") => askedQuestions(400, arm).map((q) => q.qId);
const orders = { control: ids("control"), variant: ids("variant"), survey2: ids("survey2") };
const AFTER = "2026-11-24T10:00:00Z";

const run = (sessionId: string, reached: string[], startedAt = AFTER): DropoffRun => ({
  sessionId,
  startedAt: Date.parse(startedAt),
  reached,
  leftAt: null,
  source: "other",
  device: null,
});

describe("a run's order, with Survey 2.0", () => {
  it("puts a run whose first questions follow 2.0's screens on Survey 2.0", () => {
    const first = new Map([
      ["s2", orders.survey2.slice(0, 6)],
      ["s2-left-early", ["10003"]],
      ["v", ["00001", "01002", "03011", "10005"]],
      ["c", ["00001", "01002", "01005", "01006"]],
    ]);
    const after = Date.parse(AFTER);
    expect(orders.survey2.slice(0, 2)).toEqual(["10003", "11003"]);
    expect(runOrder("s2", first, orders, after)).toBe("survey2");
    expect(runOrder("s2-left-early", first, orders, after)).toBe("survey2");
    // Classic runs open on the name question, which 2.0 asks on its details page: never 2.0.
    expect(runOrder("v", first, orders, after)).toBe("variant");
    expect(runOrder("c", first, orders, after)).toBe("control");
    expect(runOrder("none", first, orders, Date.parse(QUESTION_ORDER_TEST_END))).toBe("variant");
  });
});

describe("Survey 2.0's own funnel", () => {
  const s2 = orders.survey2;
  const q = buildSurveyQuestions(
    [run("s1", s2.slice(0, 6)), run("s2", s2.slice(0, 3)), run("v1", orders.variant.slice(0, 6))],
    {
      steps: [],
      exits: [],
      orders: [
        { s: "s1", q: s2.slice(0, 6) },
        { s: "s2", q: s2.slice(0, 3) },
        { s: "v1", q: orders.variant.slice(0, 6) },
      ],
    },
    "2026-11-23",
    "2026-11-29",
    "All traffic",
    null
  );

  it("counts 2.0's runs along its 61 screens, apart from the classic runs", () => {
    expect(q.survey2).not.toBeNull();
    expect(q.survey2!.people).toBe(2);
    expect(q.survey2!.rows.map((r) => r.id)).toEqual(s2);
    expect(q.survey2!.rows).toHaveLength(61);
    expect(q.survey2!.rows.slice(0, 6).map((r) => r.reached)).toEqual([2, 2, 2, 1, 1, 1]);
    expect(q.test!.people).toBe(1);
  });

  it("names 2.0's own screens, and reads its questions in Mark's words", () => {
    const row = (id: string) => q.survey2!.rows.find((r) => r.id === id)!;
    expect(row("00010")).toMatchObject({
      text: "Last step to your report to become a more intelligent lover",
      chapter: "Your details",
      n: 61,
    });
    expect(row("16016a").text).toBe(
      "Beyond sex, which areas would you most like to understand about yourself?"
    );
    expect(row("02002").text).toBe("I usually need touch or closeness before I feel desire.");
    // The classic funnel keeps today's words.
    expect(q.test!.rows.find((r) => r.id === "02002")!.text).not.toBe(row("02002").text);
  });

  it("has no Survey 2.0 funnel while the range has no 2.0 runs", () => {
    const classic = buildSurveyQuestions(
      [run("v1", orders.variant.slice(0, 6))],
      { steps: [], exits: [], orders: [{ s: "v1", q: orders.variant.slice(0, 6) }] },
      "2026-11-23",
      "2026-11-29",
      "All traffic",
      null
    );
    expect(classic.survey2).toBeNull();
  });
});

describe("the charts' chapter groups", () => {
  it("groups 2.0's details page as the reader's details and its closing questions as feedback", () => {
    expect(chapterBand("00010")).toBe("Your details");
    expect(["17001", "17002", "17003"].map(chapterBand)).toEqual([
      "Feedback",
      "Feedback",
      "Feedback",
    ]);
    expect(chapterBand("16016a")).toBe(chapterBand("16016"));
  });
});

describe("the documented queries", () => {
  const sql = fields["survey.funnel"]!.query!.text;
  const literal = (arm: string) =>
    [
      ...(new RegExp(`\\('${arm}', ARRAY\\[([^\\]]+)\\]\\)`).exec(sql)?.[1] ?? "").matchAll(
        /'([^']+)'/g
      ),
    ].map((m) => m[1]);

  it("hold every order the survey asks, exactly as the code asks it", () => {
    expect(literal("control")).toEqual(orders.control);
    expect(literal("variant")).toEqual(orders.variant);
    expect(literal("survey2")).toEqual(orders.survey2);
  });

  it("tell a 2.0 run by the same rule as the page", () => {
    expect(sql).toMatch(/LEFT JOIN fit s ON s\.session_id = r\.session_id AND s\.arm = 'survey2'/);
    expect(sql).toMatch(/THEN 'survey2'/);
  });
});

// The page: the classic order it opens on, and Survey 2.0's funnel one pill away.
const pageQuestions = buildSurveyQuestions(
  [
    run("s1", orders.survey2.slice(0, 6)),
    run("s2", orders.survey2.slice(0, 3)),
    run("v1", orders.variant.slice(0, 6)),
  ],
  {
    steps: [],
    exits: [],
    orders: [
      { s: "s1", q: orders.survey2.slice(0, 6) },
      { s: "s2", q: orders.survey2.slice(0, 3) },
      { s: "v1", q: orders.variant.slice(0, 6) },
    ],
  },
  "2026-11-23",
  "2026-11-29",
  "All traffic",
  null
);
const payload = buildSurveyPage({
  facts: factsFixture({ from: "2026-11-23", to: "2026-11-29" }),
  previous: null,
  benchmark: factsFixture(),
  benchmarkKind: "all",
  filters: parseFilters({ period: "custom", from: "2026-11-23", to: "2026-11-29" }, "2026-11-30"),
  today: "2026-11-30",
  now: new Date("2026-11-30T10:00:00Z"),
  questions: pageQuestions,
  questionsError: null,
  introClicks: null,
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
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import ApSurvey from "@features/admin/ui/ap/ApSurvey";

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

const funnelOrder = () => within(screen.getByRole("group", { name: "Question order" }));
const funnelRows = () =>
  within(screen.getByRole("table", { name: "Survey question funnel" }))
    .getAllByRole("row")
    .slice(1);

describe("the Survey page with Survey 2.0 runs", () => {
  it("opens on the classic order and shows Survey 2.0's funnel on its pill", () => {
    render(<ApSurvey />);
    const classic = funnelOrder().getByRole("button", { name: "New order (C13) · 1 runs" });
    const s2 = funnelOrder().getByRole("button", { name: "Survey 2.0 · 2 runs" });
    expect(classic).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(s2);
    expect(s2).toHaveAttribute("aria-pressed", "true");
    expect(funnelRows()[0]!.textContent).toContain("10003");
    expect(funnelRows()[1]!.textContent).toContain("11003");
    // The charts above follow the same pick.
    expect(
      within(screen.getByRole("group", { name: "Question order for these charts" })).getByRole(
        "button",
        { name: "Survey 2.0 · 2 runs" }
      )
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("exports Survey 2.0's funnel as its own table", () => {
    render(<ApSurvey />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections.map((s) => s.name)).toContain("Questions · Survey 2.0");
  });
});
