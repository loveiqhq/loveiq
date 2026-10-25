// @vitest-environment jsdom
/**
 * The Dashboard's design sync (Marcus's canvas, 21 Oct 2026): the funnel comparison, the charts'
 * own Daily / Weekly / Monthly windows (his comment of 15 Oct 2026), the design's wording and
 * formats, and an info icon on every figure.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Facts } from "@features/admin/server/ap/facts";
import { parseFilters, type ApFilters } from "@features/admin/server/ap/filters";
import { buildFocus, chartWindows, type FocusPayload } from "@features/admin/server/ap/focus";
import {
  measuresOf,
  type PtsFunnel,
  type PtsPayload,
} from "@features/admin/server/ap/pay-to-start";

import { factsFixture, sub } from "./ap-fixtures";

const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import ApFocus from "@features/admin/ui/ap/ApFocus";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const range = (over: Record<string, string> = {}) =>
  parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07", ...over }, TODAY);
const ad = {
  byDay: new Map([
    ["2026-06-10", 25],
    ["2026-10-02", 40],
    ["2026-10-03", 60],
  ]),
  from: "2026-04-24",
  to: TODAY,
};
const facts = factsFixture();
/** The range's facts and, from May 2026, one finisher on 10 Jun who paid €9.99 that day. */
const wide = factsFixture({
  from: "2026-05-01",
  subs: [...facts.subs, sub({ id: 10, day: "2026-06-10", at: "2026-06-10T10:00:00Z" })],
  money: [...facts.money, { ...facts.money[0]!, sid: 10, day: "2026-06-10", amount: 9.99 }],
});
const focus = (over: Partial<Parameters<typeof buildFocus>[0]> = {}): FocusPayload =>
  buildFocus({
    facts,
    wide,
    previous: null,
    ad,
    filters: range(),
    today: TODAY,
    now,
    ratings: null,
    ...over,
  });
const chartOf = (p: FocusPayload, key: string) => p.charts.find((c) => c.key === key)!;

/** One funnel as the Pay to start page reads it: its visits, paying customers, revenue, spend. */
const ptsFunnel = (
  key: PtsFunnel["key"],
  label: string,
  live: boolean,
  spend: number | null,
  visits: number | null,
  paid: number,
  revenue: number
): PtsFunnel => {
  const v = { visits, finished: paid, paid, revenue, revenueFinished: revenue };
  const all = { ...v, m: measuresOf(spend, null, v) };
  return { key, label, live, spend, clicks: null, all, ads: all, steps: [] };
};
/** The Pay to start page's figures for the range: what the comparison shows, as they are. */
const pts: PtsPayload = {
  range: { from: "2026-10-01", to: "2026-10-07" },
  funnels: [
    ptsFunnel("after", "Pay after the report", true, 100, 220, 1, 6.99),
    ptsFunnel("full", "Pay to start · €29.99", true, 50, 400, 8, 239.92),
    ptsFunnel("pre", "Pay to start · €1.99", true, 0, 0, 0, 0),
    ptsFunnel("gate", "€1.99 after the survey", false, 0, 0, 0, 0),
  ],
  weeks: [],
  notes: ["Google Ads by landing page: read live."],
};

afterEach(() => cleanup());

describe("the charts' windows (Marcus, 15 Oct 2026)", () => {
  it("Daily is the range, Weekly the 15 whole weeks to its end, Monthly every month from May 2026", () => {
    // 20 Oct 2026 is a Tuesday: the last whole week ended on Sunday 18 Oct, the first of 15
    // began on 6 Jul. A cut week reads as a fall, so it isn't drawn.
    expect(chartWindows("2026-09-21", "2026-10-20")).toEqual({
      day: { from: "2026-09-21", to: "2026-10-20" },
      week: { from: "2026-07-06", to: "2026-10-18" },
      month: { from: "2026-05-01", to: "2026-10-20" },
    });
    // A range ending on a Sunday: its own week is whole and counted.
    expect(chartWindows("2026-10-12", "2026-10-18").week).toEqual({
      from: "2026-07-06",
      to: "2026-10-18",
    });
    // A longer range is shown whole, from its first whole week and month.
    expect(chartWindows("2026-03-21", "2026-10-20")).toMatchObject({
      week: { from: "2026-03-23", to: "2026-10-18" },
      month: { from: "2026-04-01" },
    });
  });

  it("each grouping covers its own window, with its own totals and the parts of each", () => {
    const subs = chartOf(focus(), "submissions");
    expect(subs.views.day.window).toEqual({ from: "2026-10-01", to: "2026-10-07" });
    expect(subs.views.day.labels).toHaveLength(7);
    // 15 whole Monday-to-Sunday weeks to Sun 4 Oct: the range ends on Wed 7 Oct, and its cut
    // week isn't drawn (it would read as a fall).
    expect(subs.views.week.window).toEqual({ from: "2026-06-22", to: "2026-10-04" });
    expect(subs.views.week.labels).toHaveLength(15);
    expect(subs.views.week.labels.at(-1)).toBe("28 Sep");
    // Every month from May, the one in progress labelled by the shared buckets.
    expect(subs.views.month.labels).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct (to 7th)"]);
    // The June finisher is in the monthly window only (it starts before the weekly one).
    const total = (g: "day" | "week" | "month", i: number) => subs.views[g].series[i]!.total;
    expect([total("day", 0), total("week", 0), total("month", 0)]).toEqual([2, 2, 3]);
    // Revenue per submission follows the window: €6.99 over 2, then €16.98 over 3.
    expect(total("day", 2)).toBeCloseTo(6.99 / 2);
    expect(total("month", 2)).toBeCloseTo((6.99 + 9.99) / 3);
    expect(subs.views.month.series[2]!.worked).toEqual({ num: "€16.98", den: "3" });
    // Spend per submission: €125 of spend (June's €25 too) over 3.
    expect(total("month", 1)).toBeCloseTo(125 / 3);
    // The monthly-only chart reads its months the same way.
    const perUser = chartOf(focus(), "per-user");
    expect(perUser.grains).toEqual(["month"]);
    expect(perUser.views.month.series[0]!.worked).toEqual({ num: "3", den: "3" });
  });

  it("without the wider read, every grouping covers the range: never a false zero", () => {
    const subs = chartOf(focus({ wide: null }), "submissions");
    expect(subs.views.week.window).toEqual({ from: "2026-10-01", to: "2026-10-07" });
    expect(subs.views.month.labels).toEqual(["Oct (to 7th)"]);
  });

  it("a filter followed only from a later day blanks the earlier points and says why", () => {
    const google = focus({ filters: range({ source: "google_ads" }) });
    const subs = chartOf(google, "submissions");
    // The range itself can be split by source: Daily draws, as before.
    expect(subs.blocked).toBeNull();
    // Sources are recorded from 19 Jul 2026: the weeks of 22 Jun to 13 Jul are blank.
    const week = subs.views.week;
    expect(week.blocked).toBeNull();
    expect(week.series[0]!.values.slice(0, 5)).toEqual([null, null, null, null, 0]);
    expect(week.note).toBe(
      "Sources are recorded from 19 Jul 2026: before, most people's source is unknown."
    );
    // The totals cover the points drawn, from the first with a figure.
    expect(week.series[0]!.total).toBe(2);
  });

  it("tablets count only in facts read from the day they were told apart", () => {
    const today = "2026-10-26";
    // A range ending on a Sunday, so its own week is the last whole one drawn.
    const late = parseFilters(
      { period: "custom", from: "2026-10-19", to: "2026-10-25", device: "tablet" },
      today
    );
    const tablet = sub({ id: 50, day: "2026-10-20", at: "2026-10-20T10:00:00Z", device: "Tablet" });
    const own = factsFixture({ from: late.from, to: late.to, asOf: today, subs: [tablet] });
    // The wider read starts before 17 Oct, so it marks nobody as a tablet.
    const older = factsFixture({
      from: "2026-05-01",
      to: late.to,
      asOf: today,
      subs: [{ ...tablet, device: "iOS" }],
    });
    const p = buildFocus({
      facts: own,
      wide: older,
      previous: null,
      ad,
      filters: late,
      today,
      now: new Date("2026-10-26T10:00:00Z"),
      ratings: null,
    });
    const week = chartOf(p, "submissions").views.week;
    // The last week (19 to 25 Oct) is the range's own read: one tablet finisher.
    expect(week.series[0]!.values.at(-1)).toBe(1);
    expect(week.series[0]!.values.slice(0, -1).every((v) => v === null)).toBe(true);
    expect(week.note).toBe("Tablets are told apart from 17 Oct 2026.");
  });

  it("Daily keeps the range's own blank, as the tiles do", () => {
    const tablets = focus({ filters: range({ device: "tablet" }) });
    const reason = "Tablets are told apart from 17 Oct 2026: pick a range from that day on.";
    expect(chartOf(tablets, "submissions").blocked).toBe(reason);
    expect(chartOf(tablets, "submissions").views.day.blocked).toBe(reason);
    // Its longer groupings reach back further still: blank too, with the same reason.
    expect(chartOf(tablets, "submissions").views.week.blocked).toBe(reason);
  });
});

describe("the funnel comparison", () => {
  it("shows the Pay to start page's own figures, each funnel read against the free survey", () => {
    const [free, full, pre, gate] = focus({ pts }).funnels.rows;
    expect(free).toMatchObject({
      key: "after",
      label: "Pay after the report",
      sub: "Free survey · pay after the report",
      live: true,
      visitors: 220,
      spend: 100,
      paying: 1,
      revenue: 6.99,
      cpp: 100,
      valid: "Reference",
    });
    expect(free!.v2p).toBeCloseTo(1 / 220);
    expect(free!.rpv).toBeCloseTo(6.99 / 220);
    expect(free!.roas).toBeCloseTo(0.0699);
    // 8 of 400 against 1 of 220: too few paying customers on either side to call it.
    expect(full).toMatchObject({ key: "full", visitors: 400, paying: 8, cpp: 6.25 });
    expect(full!.valid).toBe("Not yet");
    expect(full!.roas).toBeCloseTo(239.92 / 50);
    // No visitor yet: nothing to read; no spend, so no cost per customer or return on it.
    expect(pre).toMatchObject({ valid: "No visitors yet", cpp: null, roas: null });
    expect(gate).toMatchObject({ live: false, valid: "Off" });
    expect(focus({ pts }).funnels.notes).toEqual(["Google Ads by landing page: read live."]);
  });

  it("valid once enough paid on both sides for a 95% read; a small difference is not yet one", () => {
    const read = (paid: number) =>
      focus({
        pts: {
          ...pts,
          funnels: [
            ptsFunnel("after", "Pay after the report", true, 100, 1000, 10, 69.9),
            ptsFunnel("full", "Pay to start · €29.99", true, 50, 1000, paid, paid * 29.99),
          ],
        },
      }).funnels.rows[1]!.valid;
    expect(read(30)).toBe("Yes, 95%+");
    expect(read(12)).toMatch(/^Not yet, \d+%$/);
  });

  it("says so when Pay to start's figures couldn't be read, and that the funnels read all traffic", () => {
    expect(focus({ pts: null }).funnels).toEqual({
      rows: [],
      notes: ["Pay to start's figures could not be read just now. Try again in a minute."],
    });
    expect(focus({ pts, filters: range({ device: "phone" }) }).funnels.notes).toContain(
      "All traffic: the funnels are compared over every visitor, whatever the filters."
    );
  });

  it("Assessment B or C: no rows, with why", () => {
    const b = focus({ pts, filters: range({ assessment: "b" }) }).funnels;
    expect(b.rows).toEqual([]);
    expect(b.notes).toEqual(["Assessment B has not launched yet: nothing to show."]);
  });
});

describe("the design's wording and formats", () => {
  it("chart 1's line, 2 decimals where drawn, and the boxes' lines", () => {
    const p = focus();
    expect(chartOf(p, "submissions").sub).toEqual({
      day: "Per day, with what each submission cost in ads and earned in revenue",
      week: "Per week, with what each submission cost in ads and earned in revenue",
      month: "Per month, with what each submission cost in ads and earned in revenue",
    });
    expect(chartOf(p, "start-cvr").views.day.series[0]!.digits).toBe(2);
    expect(chartOf(p, "full-unlock").views.day.series[0]!.digits).toBe(2);
    expect(p.assessments.survey.sub).toBe("2 submissions since 1 Oct");
    // A range from 18 Sep 2026 on: every visit's reading is recorded.
    expect(p.assessments.rows[0]!.reportSub).toBe("live, since 18 Sep");
    // Earlier ranges keep their own wording.
    const sep = parseFilters({ period: "custom", from: "2026-09-10", to: "2026-09-20" }, TODAY);
    const early = buildFocus({
      facts: factsFixture({ from: sep.from, to: sep.to, subs: [], money: [] }),
      previous: null,
      ad,
      filters: sep,
      today: TODAY,
      now,
      ratings: null,
    });
    expect(early.assessments.rows[0]!.reportSub).toBe(
      "from 18 Sep 2026, when every visit was recorded"
    );
  });

  it("every chart and every legend figure names its info card", () => {
    for (const c of focus().charts) {
      expect(c.info, c.key).toMatch(/^focus\.chart-/);
      for (const s of c.views.day.series) expect(s.info, s.name).toMatch(/^focus\./);
    }
  });
});

describe("the page", () => {
  const show = (p: FocusPayload) => {
    view.payload = p;
    return render(<ApFocus />);
  };

  it("the funnel comparison between the tiles and the charts, scrolling sideways", () => {
    show(
      focus({
        pts: {
          ...pts,
          funnels: [
            {
              ...ptsFunnel("after", "Pay after the report", true, 100, 1000, 10, 69.9),
              refunds: { payers: 10, refunded: 1 },
            },
            {
              ...ptsFunnel("full", "Pay to start · €29.99", true, 50, 1000, 30, 899.7),
              refunds: { payers: 32, refunded: 2 },
            },
            ...pts.funnels.slice(2),
          ],
        },
      })
    );
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings.slice(0, 3)).toEqual(["Dashboard", "Funnel comparison", "Survey submissions"]);
    const card = document.getElementById("funnels")!;
    expect(card).toHaveAttribute("aria-labelledby", "h-funnels");
    expect(card).toHaveTextContent(
      "Free survey vs pay to start, compared per visitor and per euro of ad spend. Step rates are not comparable because payment happens at a different point."
    );
    // `relative`: the cells' sr-only words stay in the box, or they widen the page on a phone.
    expect(within(card).getByRole("region", { name: /scrolls sideways/ })).toHaveClass(
      "overflow-x-auto",
      "relative"
    );
    const table = within(card).getByRole("table", { name: "Funnel comparison" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual([
      "Funnel",
      "Visitors",
      "Ad spend",
      "Paying customers",
      "Visitor → paid",
      "Revenue / visitor",
      "Cost / paying customer",
      "ROAS",
      "Refund rate",
      "Valid yet",
    ]);
    const [, free, full, pre, gate] = within(table).getAllByRole("row");
    // What the eye reads: the cell less its screen-reader words.
    const seen = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((c) => {
          const copy = c.cloneNode(true) as HTMLElement;
          copy.querySelectorAll(".sr-only").forEach((x) => x.remove());
          return copy.textContent;
        });
    expect(seen(free!)).toEqual([
      "1,000",
      "€100",
      "10",
      "1.00%",
      "€0.070",
      "€10.00",
      "0.70×",
      "10.0%",
      "Reference",
    ]);
    expect(within(free!).getByRole("rowheader")).toHaveTextContent(
      "Pay after the reportFree survey · pay after the report"
    );
    expect(seen(full!)).toEqual([
      "1,000",
      "€50",
      "30",
      "3.00%",
      "€0.900",
      "€1.67",
      "17.99×",
      "6.3%",
      "Yes, 95%+",
    ]);
    expect(within(gate!).getAllByRole("cell").at(-1)!.textContent).toBe("Off");
    // As drawn: the running funnels' best green, worst red; a count, visitors and spend too.
    const tone = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((c) =>
          c.className.includes("bg-ap-good")
            ? "best"
            : c.className.includes("bg-ap-bad")
              ? "worst"
              : "plain"
        );
    expect(tone(free!)).toEqual([
      "plain",
      "plain",
      "plain",
      "worst",
      "worst",
      "worst",
      "worst",
      "worst",
      "plain",
    ]);
    expect(tone(full!)).toEqual([
      "plain",
      "plain",
      "best",
      "best",
      "best",
      "best",
      "best",
      "best",
      "plain",
    ]);
    // Pay to start · €1.99 sold nothing: fewest paying customers, nothing else to rank.
    expect(tone(pre!)).toEqual([
      "plain",
      "plain",
      "worst",
      "plain",
      "plain",
      "plain",
      "plain",
      "plain",
      "plain",
    ]);
    // The gate is off: never ranked.
    expect(tone(gate!).every((t) => t === "plain")).toBe(true);
    expect(within(full!).getAllByRole("cell")[3]).toHaveAttribute(
      "title",
      "best of the running funnels"
    );
    expect(card).toHaveTextContent(
      "The Pay to start page's figures for this range, all traffic: step by step and week by week there. Green is the best of the running funnels in a column, red the worst. Valid yet: enough paying customers for a 95% read against the free survey."
    );
    expect(card).toHaveTextContent("Google Ads by landing page: read live.");
  });

  it("ranks only the running funnels: an off one's empty figures never take the red", () => {
    show(
      focus({
        pts: {
          ...pts,
          funnels: [
            ptsFunnel("after", "Pay after the report", true, 100, 1000, 10, 69.9),
            ptsFunnel("full", "Pay to start · €29.99", true, 50, 1000, 30, 899.7),
            ptsFunnel("gate", "€1.99 after the survey", false, 0, 0, 0, 0),
          ],
        },
      })
    );
    const table = screen.getByRole("table", { name: "Funnel comparison" });
    const [, free, full] = within(table).getAllByRole("row");
    // Paying customers: 10 against 30, the off gate's 0 left out.
    expect(within(free!).getAllByRole("cell")[2]!.className).toContain("bg-ap-bad");
    expect(within(full!).getAllByRole("cell")[2]!.className).toContain("bg-ap-good");
  });

  it("money tiles in whole euros, and an info icon on every figure", () => {
    show(focus());
    // €6.99 of revenue reads €7.
    const tiles = screen.getByText("€7").parentElement!;
    expect(tiles).toHaveTextContent("Revenue");
    const about = screen.getAllByRole("button", { name: /^About / });
    // 3 tiles, 8 funnel columns, 6 chart titles, 8 legend figures (the pre-unlock chart's two
    // aren't drawn: the range is before it was on sale), 4 boxes, 8 table columns.
    expect(about).toHaveLength(37);
    for (const name of [
      "About Revenue",
      "About Ad spend",
      "About New users",
      "About Visitor → paid",
      "About ROAS",
      "About Visitor → survey start",
      "About Start CVR",
      "About Full-unlock rate",
      "About Best performing assessment",
      "About Median report time · A",
      "About Paid CVR",
      /^About Submissions trend/,
    ])
      expect(screen.getAllByRole("button", { name }).length, String(name)).toBeGreaterThan(0);
    // The chart is still named by its title alone.
    expect(screen.getByRole("region", { name: "Visitor → survey start" })).toBeTruthy();
  });

  it("Weekly and Monthly say which days they cover; their totals follow them", () => {
    show(focus());
    const card = screen.getByRole("region", { name: "Survey submissions" });
    // Daily is the range the filter bar shows: no dates of its own.
    expect(
      within(card).getByText(
        "Per day, with what each submission cost in ads and earned in revenue · thin dashed lines show the linear trend"
      )
    ).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("Group Survey submissions by"), {
      target: { value: "month" },
    });
    expect(
      within(card).getByText(
        "Per month, with what each submission cost in ads and earned in revenue · 1 May – 7 Oct 2026 · thin dashed lines show the linear trend"
      )
    ).toBeTruthy();
    const legend = within(card)
      .getAllByText("Survey submissions")
      .find((el) => el.tagName === "SPAN")!.nextElementSibling!;
    expect(legend.textContent).toMatch(/^3/);
  });

  it("a grouping can still be picked while Daily is blank for the range", () => {
    const p = focus();
    const c = chartOf(p, "submissions");
    // Daily blank, Weekly drawn (as under a filter followed from a day inside the window).
    const blankDay = {
      ...p,
      charts: [
        {
          ...c,
          blocked: "Only from 3 Oct.",
          views: { ...c.views, day: { ...c.views.day, blocked: "Only from 3 Oct." } },
        },
      ],
    };
    show(blankDay);
    const card = screen.getByRole("region", { name: "Survey submissions" });
    expect(within(card).getByText("Only from 3 Oct.")).toBeTruthy();
    fireEvent.change(within(card).getByLabelText("Group Survey submissions by"), {
      target: { value: "week" },
    });
    expect(within(card).queryByText("Only from 3 Oct.")).toBeNull();
    expect(card.querySelector('polyline[data-series="Survey submissions"]')).not.toBeNull();
  });

  it("a chart blank in every grouping offers no grouping", () => {
    // Before the EUR 1.99 was on sale (23 Oct), every point of the pre-unlock chart is blank.
    show(focus({ wide: null }));
    const card = screen.getByRole("region", { name: "Completion → pre-unlock" });
    expect(within(card).queryByRole("combobox")).toBeNull();
    expect(
      within(card).getByText(/start on 23 Oct 2026, its first whole day on sale/)
    ).toBeTruthy();
  });
});
