/**
 * AP › Survey's sheets (Mark's Survey copy board, 17–18 Nov 2026): what PostHog's sheet events
 * give per sheet, where each sheet sits in an order's funnel, and the pins on the charts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockHogql = vi.fn();
vi.mock("@features/ux-review/server/review", () => ({
  hogqlTable: (...args: unknown[]) => mockHogql(...args),
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
  fetchAllRows: vi.fn(),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));
vi.mock("@features/admin/server/ap/team", () => ({
  teamUserIds: () => Promise.resolve(new Set([7])),
}));

import { fetchSurveySheets } from "@features/admin/server/ap/posthog";
import type { QuestionRow } from "@features/admin/server/ap/survey";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";
import { sheetBounce, sheetConversion, sheetSpots } from "@features/admin/ui/ap/sheets";
import {
  sheetAfterQuestion,
  sheetBeforeQuestion,
  SURVEY_SHEET_IDS,
  type SurveySheetId,
} from "@features/survey/surveySheets";
import { sheetTipRows, timeDropChart } from "@features/admin/ui/ap/SurveyTimeDrop";

const TEAM_VISIT = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

beforeEach(() => {
  mockSupabaseFetch.mockResolvedValue(
    new Response(JSON.stringify([{ posthog_session_id: TEAM_VISIT }]), { status: 200 })
  );
});
afterEach(() => vi.clearAllMocks());

/** A funnel row as the page has it: only the id, its place and its figures matter here. */
const rowsOf = (ids: string[]): QuestionRow[] =>
  ids.map(
    (id, i) =>
      ({
        id,
        n: i + 1,
        text: `Question ${id}`,
        type: "single",
        reached: 100 - i,
        exits: 1,
        dropRate: 0.01,
        medianMs: 5000,
        shown: 100,
        shownAll: 100,
        skipped: 0,
        newInRange: false,
        exitsTrend: [],
      }) as unknown as QuestionRow
  );
const newOrder = askedQuestions(400, "variant").map((q) => q.qId);
const oldOrder = askedQuestions(400, "control").map((q) => q.qId);

describe("what PostHog saw of the sheets", () => {
  it("reads each sheet per question order and all of them together, leaving the team out", async () => {
    mockHogql.mockResolvedValue({
      ok: true,
      cut: false,
      rows: [
        ["test", "halfway", 34, 34, 0, 34, 6327, 0],
        ["survey", "halfway", 29, 29, 2, 27, 4832, 0],
        ["test", "desire", 18, 18, 0, 18, 3495, 1],
        // Nobody closed it yet: no time, not a NaN.
        ["test", "reportMap", 2, 0, 0, 0, Number.NaN, 0],
        // Not a sheet of ours, or a run whose order is unknown: ignored.
        ["test", "mystery", 9, 9, 9, 0, null, 0],
        ["", "science", 5, 5, 0, 5, 3000, 0],
        ["test", "", 54, 52, 0, 52, 4100, 1],
        ["survey", "", 29, 29, 2, 27, 4832, 0],
      ],
    });
    const r = await fetchSurveySheets("2026-11-17", "2026-11-21");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.test.bySheet.halfway).toEqual({
      saw: 34,
      settled: 34,
      leftOpen: 0,
      closed: 34,
      medianMs: 6327,
      ticked: 0,
    });
    expect(r.value.survey.bySheet.halfway?.leftOpen).toBe(2);
    expect(r.value.test.bySheet.reportMap?.medianMs).toBeNull();
    expect(Object.keys(r.value.test.bySheet).sort()).toEqual(["desire", "halfway", "reportMap"]);
    expect(Object.keys(r.value.survey.bySheet)).toEqual(["halfway"]);
    expect(r.value.test.all.saw).toBe(54);
    expect(r.value.survey.all.saw).toBe(29);
    const [query, cap] = mockHogql.mock.calls[0]!;
    // Runs begun in the range (a person's first survey event, 30 days back), Berlin days; the
    // sheets' closes read a day past it; the team's people left out of both.
    expect(query).toContain("toDateTime('2026-11-16 23:00:00', 'UTC') - INTERVAL 30 DAY");
    expect(query).toContain(
      "HAVING began >= toDateTime('2026-11-16 23:00:00', 'UTC') AND began < toDateTime('2026-11-21 23:00:00', 'UTC')"
    );
    expect(query).toContain("toDateTime('2026-11-21 23:00:00', 'UTC') + INTERVAL 1 DAY");
    expect(query.match(new RegExp(`\\$session_id IN \\('${TEAM_VISIT}'\\)`, "g"))).toHaveLength(2);
    // A run's order: 03011 before 01005 is the new order.
    expect(query).toContain("properties.question_id = '03011'");
    expect(query).toContain("properties.question_id = '01005'");
    expect(query).toMatch(/SELECT \* FROM \(\s+SELECT run_order, sheet/);
    expect(cap).toBe(30);
    // Someone who answered on after the sheet opened (a reload drops the open sheet, no close is
    // sent) never counts as left with it open; the tick is read however PostHog types it.
    expect(query).toContain("runs.last_answer > per.shown_at AS went_on");
    expect(query).toContain(
      "countIf(closes = 0 AND NOT went_on AND shown_at < now() - INTERVAL 30 MINUTE) AS left_open"
    );
    expect(query).toContain(
      "countIf(closes > 0 OR went_on OR shown_at < now() - INTERVAL 30 MINUTE) AS settled"
    );
    expect(query).toContain("toString(properties.ticked) = 'true'");
  });

  it("passes PostHog's failure on plainly, and never a cut answer", async () => {
    mockHogql.mockResolvedValueOnce({ ok: false, error: "HTTP 500 ..." });
    const failed = await fetchSurveySheets("2026-11-01", "2026-11-02");
    expect(failed).toEqual({
      ok: false,
      error: "PostHog could not be read just now. Try again in a minute.",
    });
    mockHogql.mockResolvedValueOnce({ ok: true, cut: true, rows: [] });
    const cut = await fetchSurveySheets("2026-11-03", "2026-11-04");
    expect(cut.ok).toBe(false);
  });

  it("reads the bounce over the settled and the conversion over everyone it opened for", () => {
    const f = { saw: 40, settled: 38, leftOpen: 2, closed: 36, medianMs: 3000, ticked: 4 };
    expect(sheetBounce(f)).toBeCloseTo(2 / 38);
    expect(sheetConversion(f)).toBeCloseTo(4 / 40);
    expect(sheetBounce({ ...f, settled: 0 })).toBeNull();
    expect(sheetBounce(undefined)).toBeNull();
    expect(sheetConversion(undefined)).toBeNull();
  });
});

describe("where the sheets sit", () => {
  it("follows the survey's own placements in the new order", () => {
    const spots = new Map(sheetSpots(rowsOf(newOrder)).map((s) => [s.id, s]));
    const at = (id: string) => newOrder.indexOf(id);
    expect(spots.get("science")).toMatchObject({
      n: 1,
      after: at("02004"),
      where: `After #${at("02004") + 1}`,
    });
    expect(spots.get("trustpilot")).toMatchObject({ n: 2, after: at("03008") });
    // The expert's opens on arriving at 01005: between the question before it and 01005.
    expect(spots.get("expert")).toMatchObject({
      n: 3,
      after: at("01005") - 1,
      q: at("01005"),
      where: `Before #${at("01005") + 1}`,
    });
    expect(spots.get("halfway")).toMatchObject({ n: 4, after: at("11003") });
    expect(spots.get("desire")).toMatchObject({ n: 5, after: at("16005") });
    // Three questions left: after the fourth from the end (16017 in today's survey).
    expect(spots.get("reportMap")).toMatchObject({ n: 6, after: newOrder.length - 4 });
    expect(newOrder[newOrder.length - 4]).toBe("16017");
  });

  it("gives the expert's no place in the old order, which asks its question third", () => {
    const ids = sheetSpots(rowsOf(oldOrder)).map((s) => s.id);
    expect(oldOrder.indexOf("01005")).toBeLessThan(10);
    expect(ids).toEqual(["science", "trustpilot", "halfway", "desire", "reportMap"]);
  });

  it("counts only the questions asked now", () => {
    const rows = rowsOf(newOrder);
    // A question no longer asked (n = 0) has no place: the sheets keep theirs.
    const withGone = [...rows, { ...rows[0]!, id: "99999", n: 0 }];
    expect(sheetSpots(withGone)).toEqual(sheetSpots(rows));
    expect(sheetSpots([])).toEqual([]);
  });
});

describe("where the sheets sit, against the survey's own runtime", () => {
  it("puts every sheet where the survey opens it, in both orders", () => {
    for (const order of [newOrder, oldOrder]) {
      const ctx = { enabled: SURVEY_SHEET_IDS, shown: new Set<SurveySheetId>(), payToStart: false };
      // What the survey opens: moving on from question i (after), or arriving at it (before),
      // each sheet once, as SurveyEngine asks it.
      const opened: Array<[SurveySheetId, number]> = [];
      const shown = new Set<SurveySheetId>();
      for (let i = 0; i < order.length; i++) {
        const before = sheetBeforeQuestion(order[i], i, { ...ctx, shown });
        if (before) {
          shown.add(before);
          opened.push([before, i - 1]);
        }
        const after = sheetAfterQuestion(order[i], i, order.length, { ...ctx, shown });
        if (after) {
          shown.add(after);
          opened.push([after, i]);
        }
      }
      const spots = sheetSpots(rowsOf(order)).map((s) => [s.id, s.after]);
      expect(spots.sort()).toEqual(opened.sort());
    }
  });
});

describe("the pins on the charts", () => {
  it("pins a sheet after its question only when asked to", () => {
    const rows = rowsOf(newOrder);
    expect(timeDropChart(rows).cols.every((c) => c.sheets.length === 0)).toBe(true);
    const chart = timeDropChart(rows, { sheets: true });
    const pinned = chart.cols.flatMap((c) => c.sheets.map((s) => [c.row.id, s.id]));
    expect(pinned).toEqual([
      ["02004", "science"],
      ["03008", "trustpilot"],
      [newOrder[newOrder.indexOf("01005") - 1], "expert"],
      ["11003", "halfway"],
      ["16005", "desire"],
      ["16017", "reportMap"],
    ]);
  });

  it("reads a sheet's figures in its question's card, blank when PostHog can't be read", () => {
    const spot = sheetSpots(rowsOf(newOrder)).find((s) => s.id === "desire")!;
    const f = { saw: 36, settled: 36, leftOpen: 0, closed: 36, medianMs: 3405, ticked: 1 };
    expect(sheetTipRows(spot, f).map((r) => [r.label, r.value])).toEqual([
      ["Then sheet 5 · State of Desire report promo", "36 saw it"],
      ["Bounce rate", "0.0%"],
      ["Median time open", "3 s"],
      ["Conversion", "2.8% · 1 click"],
    ]);
    const halfway = sheetSpots(rowsOf(newOrder)).find((s) => s.id === "halfway")!;
    expect(sheetTipRows(halfway, undefined).map((r) => r.label)).not.toContain("Conversion");
    expect(sheetTipRows(spot, f, false)).toEqual([
      expect.objectContaining({ value: "—", muted: true }),
    ]);
  });
});
