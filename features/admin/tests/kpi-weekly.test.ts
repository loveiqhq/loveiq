import { describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));

import { tallyRuns, type DropoffRun } from "@features/admin/server/dropoff-report";
import { dropoffWeeks } from "@features/admin/server/dropoff-weekly";
import {
  adSpend,
  buildKpiRows,
  dropoffColumns,
  formatChange,
  formatValue,
  isFrozenWeek,
  kpiCallout,
  kpiColumns,
  KPIS,
  kpiWeeks,
  parseKpiWeek,
  sparkline,
  summarize,
  weekContexts,
  weekDays,
  type KpiWeekData,
  type WeekContext,
} from "@features/admin/server/kpi-weekly";

/** get_kpi_week's JSON for a week, in the function's own shape. */
const raw = (over: Record<string, unknown> = {}) => ({
  visits: { all: 2049, by_arm: { white_card: 350, white_video: 392, unknown: 670 } },
  starts: { all: 288, google_ads: 265, by_arm: { white_card: 85, white_video: 105 } },
  finished: { all: 142, google_ads: 129 },
  checkout: 6,
  paywall: 89,
  sales: 1,
  sales_google_ads: 1,
  gifted: 1,
  revenue: 6.99,
  finish_cohort: { finished: 142, paid: 1 },
  start_cohort: {
    all: { started: 303, finished: 144 },
    google_ads: { started: 271, finished: 129 },
    other: { started: 32, finished: 15 },
    phone: { started: 0, finished: 0 },
    computer: { started: 0, finished: 0 },
  },
  survey_minutes: { n: 142, median: 15.3, p90: 28.3 },
  report_minutes: { n: 164, median: 1.7, p90: 15.4 },
  thumbs: { up: 5, down: 1 },
  ...over,
});

const ctx = (over: Partial<WeekContext> = {}): WeekContext => ({
  monday: "2026-10-05",
  days: 7,
  partial: false,
  adCost: 302.95,
  startsComplete: true,
  stepsComplete: true,
  ...over,
});

const kpi = (id: string) => KPIS.find((k) => k.id === id)!;

describe("parseKpiWeek", () => {
  it("reads the function's JSON, revenue as a string included", () => {
    const w = parseKpiWeek(raw({ revenue: "6.99" }));
    expect(w.visits.byArm.get("white_video")).toBe(392);
    expect(w.revenue).toBe(6.99);
    expect(w.startCohort.google_ads).toEqual({ started: 271, finished: 129 });
    expect(w.surveyMinutes.median).toBe(15.3);
  });

  it("refuses a wrong shape rather than writing zeros", () => {
    expect(() => parseKpiWeek(raw({ checkout: null }))).toThrow("checkout");
    expect(() => parseKpiWeek(raw({ visits: { all: 1 } }))).toThrow("visits.by_arm");
    expect(() => parseKpiWeek({})).toThrow();
  });

  it("takes an empty week's missing minutes as no number", () => {
    const w = parseKpiWeek(raw({ survey_minutes: { n: 0, median: null, p90: null } }));
    expect(w.surveyMinutes).toEqual({ n: 0, median: null, p90: null });
  });
});

describe("the KPIs, from one week", () => {
  const w = parseKpiWeek(raw());

  it("follows each KPI's own formula in 📊 KPI", () => {
    const v = (id: string, c = ctx()) => kpi(id).values(w, c)[0]!.value;
    expect(v("visitors")).toBe(2049);
    expect(v("visit_to_start")).toBeCloseTo(288 / 2049, 6);
    expect(v("starts")).toBe(288);
    expect(v("start_to_finish")).toBeCloseTo(144 / 303, 6);
    expect(v("finished")).toBe(142);
    expect(v("cost_per_finished")).toBeCloseTo(302.95 / 129, 6); // ad spend / finished from ads
    expect(v("sales")).toBe(1); // money only; the coupon unlock is apart
    expect(v("finish_to_paid")).toBeCloseTo(1 / 142, 6);
    expect(v("revenue_per_finished")).toBeCloseTo(6.99 / 142, 6);
    expect(v("checkouts")).toBe(6);
    expect(v("checkout_to_paid")).toBeCloseTo(1 / 6, 6);
    expect(v("satisfaction")).toBeCloseTo(5 / 6, 6);
    expect(v("report_minutes")).toBe(1.7);
    expect(v("cppr")).toBeCloseTo(302.95 / 1, 6);
    expect(v("revenue")).toBe(6.99);
    expect(v("sales_per_day")).toBeCloseTo(1 / 7, 6);
    expect(v("finished_per_day")).toBeCloseTo(142 / 7, 6);
    expect(v("survey_minutes")).toBe(15.3);
  });

  it("splits by the source and landing page Marcus asked for, and the slices add up", () => {
    const finished = kpi("finished").values(w, ctx());
    expect(finished.map((x) => [x.segment, x.value])).toEqual([
      ["All traffic", 142],
      ["Google Ads", 129],
      ["Other sources", 13],
    ]);
    const arms = kpi("visit_to_start").values(w, ctx());
    expect(arms.map((x) => x.segment)).toEqual([
      "All traffic",
      "Landing: question card",
      "Landing: video",
    ]);
    expect(arms[2]!.value).toBeCloseTo(105 / 392, 6);
  });

  it("leaves a number out when its source is incomplete for the week", () => {
    expect(kpi("starts").values(w, ctx({ startsComplete: false }))).toEqual([]);
    expect(kpi("visit_to_start").values(w, ctx({ startsComplete: false }))).toEqual([]);
    expect(kpi("start_to_finish").values(w, ctx({ stepsComplete: false }))).toEqual([]);
    expect(kpi("cost_per_finished").values(w, ctx({ adCost: null }))[0]!.value).toBeNull();
    // Too few to say anything: under 5 ratings, under 20 starters in a slice.
    const few = parseKpiWeek(raw({ thumbs: { up: 3, down: 1 } }));
    expect(kpi("satisfaction").values(few, ctx())[0]!.value).toBeNull();
    expect(
      kpi("start_to_finish")
        .values(w, ctx())
        .find((x) => x.segment === "Other sources")!.value
    ).toBeCloseTo(15 / 32, 6); // 32 started: over the floor of 20
    const thin = parseKpiWeek(
      raw({
        start_cohort: {
          all: { started: 303, finished: 144 },
          google_ads: { started: 271, finished: 129 },
          other: { started: 12, finished: 5 },
          phone: { started: 0, finished: 0 },
          computer: { started: 0, finished: 0 },
        },
      })
    );
    const slices = kpi("start_to_finish").values(thin, ctx());
    expect(slices.find((x) => x.segment === "Other sources")!.value).toBeNull(); // 12: under it
    expect(slices.some((x) => x.segment === "Phone")).toBe(false); // nobody: no slice at all
  });
});

describe("formatting", () => {
  it("shows each unit the way the KPI reads", () => {
    expect(formatValue("count", 2049)).toBe("2,049");
    expect(formatValue("count", 20.29)).toBe("20.3");
    expect(formatValue("percent", 0.4752)).toBe("47.5%");
    expect(formatValue("euro", 2.348)).toBe("€2.35");
    expect(formatValue("euro", 11400)).toBe("€11,400.00");
    expect(formatValue("minutes", 15.25)).toBe("15.3 min");
  });

  it("says the change in the unit's own terms, points for percentages", () => {
    expect(formatChange("count", 142, 123)).toBe("▲ 19 (+15.4%)");
    expect(formatChange("count", 2049, 2745)).toBe("▼ 696 (−25.4%)");
    expect(formatChange("percent", 0.475, 0.428)).toBe("▲ 4.7 pts");
    expect(formatChange("euro", 2.35, 2.47)).toBe("▼ €0.12");
    expect(formatChange("count", 0, 0)).toBe("no change");
  });

  it("draws eight weeks as bars, a dot where a week has no number", () => {
    expect(sparkline([1, 2, 3, 4, 5, 6, 7, 8])).toBe("▁▂▃▄▅▆▇█");
    expect(sparkline([null, 5, 5])).toBe("·▄▄");
    expect(sparkline([null, null])).toBe("");
  });
});

describe("weeks", () => {
  const monday = new Date("2026-10-12T08:15:00Z");
  const tuesday = new Date("2026-10-13T08:15:00Z");

  it("shows eight complete weeks, and the week so far from Tuesday on", () => {
    expect(kpiWeeks(monday).map((w) => w.label)).toEqual([
      "17 Aug",
      "24 Aug",
      "31 Aug",
      "7 Sep",
      "14 Sep",
      "21 Sep",
      "28 Sep",
      "5 Oct",
    ]);
    const t = kpiWeeks(tuesday);
    expect(t.at(-1)).toMatchObject({ label: "12 Oct", partial: true });
    expect(weekDays(t.at(-1)!, "2026-10-13")).toEqual(["2026-10-12"]);
    expect(weekDays(t[0]!, "2026-10-13")).toHaveLength(7);
  });

  it("counts ad spend only when every day of the week is in", () => {
    const ad = {
      byDay: new Map([
        ["2026-10-05", 40],
        ["2026-10-06", 2.5],
      ]),
      from: "2026-10-05",
      to: "2026-10-11",
    };
    const days = Array.from({ length: 7 }, (_, i) => `2026-10-${String(5 + i).padStart(2, "0")}`);
    expect(adSpend(ad, days)).toBe(42.5);
    expect(adSpend({ ...ad, to: "2026-10-10" }, days)).toBeNull();
    expect(adSpend({ ...ad, from: null }, days)).toBeNull();
  });

  it("marks starts complete only within the drafts' four weeks, and survey steps from 21 Sep", () => {
    const weeks = kpiWeeks(monday);
    const c = weekContexts(weeks, { byDay: new Map(), from: null, to: null }, "2026-10-12");
    expect(c.filter((x) => x.startsComplete).map((x) => x.monday)).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
    ]);
    expect(c.filter((x) => x.stepsComplete).map((x) => x.monday)[0]).toBe("2026-09-21");
  });

  it("freezes a week two weeks after its Sunday", () => {
    expect(isFrozenWeek("2026-09-21", "2026-10-12")).toBe(true); // Sunday 27 Sep
    expect(isFrozenWeek("2026-09-28", "2026-10-12")).toBe(false); // Sunday 4 Oct
    expect(isFrozenWeek("2026-09-28", "2026-10-19")).toBe(true);
  });
});

describe("rows and summaries", () => {
  // Five complete weeks of 100 finished surveys, then 142, then the week so far.
  const weeks = [
    "2026-09-07",
    "2026-09-14",
    "2026-09-21",
    "2026-09-28",
    "2026-10-05",
    "2026-10-12",
  ];
  const contexts = weeks.map((monday, i) =>
    ctx({ monday, partial: i === weeks.length - 1, days: i === weeks.length - 1 ? 1 : 7 })
  );
  const data: KpiWeekData[] = weeks.map((_, i) =>
    parseKpiWeek(
      raw({
        finished: { all: i === 4 ? 142 : i === 5 ? 18 : 100, google_ads: i === 4 ? 129 : 80 },
      })
    )
  );
  const rows = buildKpiRows(data, contexts);
  const summaries = summarize(rows, data, contexts);
  const finished = summaries.find((s) => s.kpi.id === "finished")!;

  it("writes one row per KPI, week and slice, keyed so the sync finds it again", () => {
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(rows.find((r) => r.key === "finished · 2026-10-05 · Google Ads")?.value).toBe(129);
    expect(rows.find((r) => r.key === "visit_to_start · 2026-10-05 · All traffic")?.value).toBe(
      0.1406
    );
  });

  it("sums up last week against the week before and the usual level", () => {
    expect(finished.lastFull?.row.value).toBe(142);
    expect(finished.before?.value).toBe(100);
    expect(finished.usual).toBe(100);
    expect(finished.usualWeeks).toBe(4);
    expect(finished.soFar?.value).toBe(18);
    expect(kpiColumns(finished)).toEqual({
      lastFullWeek: "142 (5 to 11 Oct)",
      weekBefore: "100",
      change: "▲ 42 (+42.0%)",
      lastWeeks: "▁▁▁▁█",
      thisWeekSoFar: "18 (1 day)",
    });
  });

  it("raises the 8 Oct alert rule when it is broken, and says when it holds", () => {
    expect(finished.watch).toEqual({ ok: true, text: "within its usual range" });
    const low = data.map((w, i) =>
      i === 4 ? parseKpiWeek(raw({ finished: { all: 40, google_ads: 30 } })) : w
    );
    const s = summarize(buildKpiRows(low, contexts), low, contexts).find(
      (x) => x.kpi.id === "finished"
    )!;
    expect(s.watch).toEqual({ ok: false, text: "under half the usual (100)" });
    // A KPI with no rule says nothing about it.
    expect(summaries.find((x) => x.kpi.id === "sales")!.watch).toBeNull();
  });

  it("puts the numbers, the splits, the rule and the marker on the page, in plain lines", () => {
    const text = kpiCallout(finished, "2026-10-13", "kpi-weekly job")
      .map((l) => l.map((x) => x.text).join(""))
      .join("\n");
    expect(text).toContain(
      "Last full week, 5 to 11 Oct: 142. Week before: 100. Usual level (the 4 weeks before): 100."
    );
    expect(text).toContain("By source: Google Ads 129, other sources 13.");
    expect(text).toContain("This week so far (1 day): 18");
    expect(text).toContain(
      "Watch: within its usual range. The rule: under half the usual finished surveys in a week."
    );
    expect(text).toContain("kpi-weekly job");
    expect(text).not.toContain("—");
  });

  it("names what is missing instead of a blank", () => {
    const cppr = summaries.find((s) => s.kpi.id === "cppr")!;
    const none = { ...cppr, lastFull: null, before: null, soFar: null, trend: [] };
    expect(kpiColumns(none).lastFullWeek).toBe("no paid report from ads");
  });
});

describe("dropoffColumns", () => {
  const run = (leftAt: string | null): DropoffRun => ({
    sessionId: "s",
    startedAt: 0,
    reached: ["00001", "01002"],
    leftAt,
    source: "other",
    device: null,
  });
  it("shows the week's highest drop-off question and how the highest moved", () => {
    const weeks = dropoffWeeks(new Date("2026-10-13T08:15:00Z"), 2);
    const week = (left: number) =>
      tallyRuns([
        ...Array.from({ length: left }, () => run("00001")),
        ...Array.from({ length: 100 - left }, () => run(null)),
      ]);
    const c = dropoffColumns(weeks, [week(10), week(5), week(2)], "2026-10-13");
    expect(c.lastFullWeek).toBe("Q1 5.0%, the highest (5 to 11 Oct)");
    expect(c.weekBefore).toBe("Q1 10.0%");
    expect(c.change).toBe("▼ 5.0 pts (highest question)");
    expect(c.thisWeekSoFar).toBe("Q1 2.0% (1 day)");
  });
});
