// @vitest-environment jsdom
/** The Payment page as synced to Marcus's design on 21 Oct 2026 (builder and page). */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table } from "@features/admin/server/ap/common";
import type { Facts, MoneyFact, RefundFact } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import { buildPayment, people, type PaymentPayload } from "@features/admin/server/ap/payment";
import { FIELDS } from "@features/admin/ui/ap/fields";

import { factsFixture, sub } from "./ap-fixtures";

const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import ApPayment from "@features/admin/ui/ap/ApPayment";

const TODAY = "2026-10-21";
const now = new Date("2026-10-21T10:00:00Z");

const money = (over: Partial<MoneyFact>): MoneyFact => ({
  day: "2026-10-06",
  sid: 2,
  amount: 9.99,
  plan: "full_report",
  arm: "white_card",
  device: "iOS",
  tier: "tier_1",
  ph: null,
  uid: 7,
  method: "visa",
  net: null,
  priceArm: "A3",
  src: "google",
  med: "cpc",
  ads: true,
  camp: null,
  term: null,
  ...over,
});

const refund = (over: Partial<RefundFact>): RefundFact => ({
  day: "2026-10-06",
  sid: 2,
  plan: "full_report",
  amount: 9.99,
  refund: 9.99,
  full: true,
  ...over,
});

const payment = (
  from: string,
  to: string,
  over: Partial<Facts> = {},
  f: Record<string, string> = {},
  gateOn: boolean | null = false
) =>
  buildPayment({
    facts: factsFixture({ from, to, subs: [], money: [], checkouts: [], ...over }),
    filters: parseFilters({ period: "custom", from, to, ...f }, TODAY),
    today: TODAY,
    now,
    gateOn,
  });

/** Person 7 finished twice and paid on the second; a survey without a person; person 9 twice. */
const twice = [
  sub({ id: 1, uid: 7, day: "2026-10-05", at: "2026-10-05T10:00:00Z", gender: "Woman" }),
  sub({
    id: 2,
    uid: 7,
    day: "2026-10-06",
    at: "2026-10-06T10:00:00Z",
    gender: "Woman",
    paidAt: "2026-10-06T11:00:00Z",
    sales: 1,
    revenue: 9.99,
    plan: "full_report",
    full: true,
    fullSales: 1,
    fullRevenue: 9.99,
  }),
  sub({ id: 3, uid: null, day: "2026-10-07", at: "2026-10-07T10:00:00Z", gender: "Man" }),
  sub({ id: 4, uid: 9, day: "2026-10-08", at: "2026-10-08T10:00:00Z", gender: "Man" }),
  // Person 9 answered differently the second time: counted under each answer.
  sub({ id: 5, uid: 9, day: "2026-10-09", at: "2026-10-09T10:00:00Z", gender: "Woman" }),
];

describe("Payment builder (design sync, 21 Oct 2026)", () => {
  it("counts people once in the Payment CVR, Over time and Who pays; the full-unlock CVR stays on submissions", () => {
    const p = payment("2026-09-21", "2026-10-20", { subs: twice, money: [money({})] });
    expect(people(twice)).toHaveLength(3);
    const tile = (k: string) => p.tiles.find((t) => t.key === k)!;
    expect(tile("pay-cvr")).toMatchObject({ value: 1 / 3, note: "1 of 3 finishers" });
    expect(tile("full-cvr")).toMatchObject({ value: 1 / 5, note: "1 of 5 submissions so far" });
    expect(p.counts).toEqual({ submissions: 5, fullSubmissions: 1, finishers: 3, payers: 1 });
    const week = p.overTime.rows.find((r) => r.label === "5 Oct")!;
    expect(week).toMatchObject({ submissions: 5, finishers: 3, payers: 1, fullSales: 1 });
    const gender = p.segments.find((s) => s.key === "gender")!.rows;
    expect(gender.map((r) => [r.label, r.finishers, r.fullBuyers])).toEqual([
      ["Woman", 2, 1],
      ["Man", 2, 0],
    ]);
  });

  it("payment types: the live rows add up to the paid sales, the rest are blank, refunds as read", () => {
    const sales = [
      money({ sid: 2, amount: 9.99 }),
      money({ sid: 3, amount: 29.99, plan: "all_reports" }),
      money({ sid: 4, amount: 4.99, plan: "essentials" }),
      money({ sid: 5, amount: 0, method: null }),
    ];
    const p = payment("2026-09-21", "2026-10-20", {
      money: sales,
      refunds: [refund({ sid: 6 }), refund({ sid: 2, refund: 2, full: false })],
    });
    const rows = p.types.rows;
    // Before the free survey's EUR 1.99 page (27 Oct) and the price test: blank, never 0.
    expect(rows.map((r) => [r.key, r.live, r.sales, r.revenue, r.refunds, r.fullRefunds])).toEqual([
      ["pre-fixed", false, null, null, null, null],
      ["pre-choose", false, null, null, null, null],
      ["full", true, 2, 39.98, 2, 1],
      ["upgrade", false, null, null, null, null],
      ["plan-essentials", true, 1, 4.99, 0, 0],
    ]);
    expect(rows.map((r) => [r.name, r.line])).toEqual([
      ["Pre-unlock · fixed €1.99", "On sale from 27 Oct 2026"],
      ["Pre-unlock · choose your price", "On sale with the price test, from 26 Nov 2026"],
      ["Full report on the report", ""],
      ["Full report after a pre-unlock", "On sale from 27 Oct 2026"],
      ["Essentials (retired)", ""],
    ]);
    const live = rows.filter((r) => r.live).reduce((n, r) => n + (r.sales ?? 0), 0);
    expect(live).toBe(p.tiles.find((t) => t.key === "sales")!.value);
    expect(p.types.refundsWhy).toBeNull();
    // No pay-to-start sale in the range: no retired row.
    expect(rows.some((r) => r.key === "pay-to-start")).toBe(false);
    // A switch that couldn't be read is never read as off.
    const fixedLine = (gate: boolean | null) =>
      payment("2026-10-22", "2026-10-28", { money: sales }, {}, gate).types.rows.find(
        (r) => r.key === "pre-fixed"
      )!.line;
    expect(fixedLine(null)).toBe("The €1.99 gate's switch couldn't be read");
    expect(fixedLine(false)).toBe("The €1.99 gate is switched off");
    expect(fixedLine(true)).toBe("");
    // Not read (an older reader): blank, never 0.
    const unread = payment("2026-09-21", "2026-10-20", { money: sales });
    expect(unread.types.rows.find((r) => r.key === "full")).toMatchObject({
      sales: 2,
      refunds: null,
    });
    expect(unread.types.refundsWhy).toBe("Refunds were not read for this range.");
    // Refunds carry no source: blank under a filter.
    const filtered = payment(
      "2026-09-21",
      "2026-10-20",
      { money: sales, refunds: [] },
      { source: "google_ads" }
    );
    expect(filtered.types.rows.find((r) => r.key === "full")!.refunds).toBeNull();
    expect(filtered.types.refundsWhy).toMatch(/filter leaves them blank/);
  });

  it("payment types: the EUR 1.99 page counts from its switch-on, the choosing page from the test's", () => {
    const subs = [
      sub({ id: 1, day: "2026-10-26", at: "2026-10-26T12:00:00Z" }),
      // The free survey's EUR 1.99 page went on at 14:38 UTC on 27 Oct: before it, no gate.
      sub({ id: 2, day: "2026-10-27", at: "2026-10-27T10:00:00Z" }),
      sub({ id: 3, day: "2026-10-27", at: "2026-10-27T15:00:00Z" }),
    ];
    const build = (to: string, gateSeen: ReadonlySet<number> | null = new Set([3])) =>
      buildPayment({
        facts: factsFixture({
          from: "2026-10-26",
          to,
          subs,
          money: [],
          checkouts: [],
          refunds: [],
        }),
        filters: parseFilters({ period: "custom", from: "2026-10-26", to }, TODAY),
        today: TODAY,
        now,
        gateOn: true,
        priceOn: true,
        gateSeen,
      }).types.rows;
    const row = (rows: ReturnType<typeof build>, k: string) => rows.find((r) => r.key === k)!;
    // A range that ends before the switch-on: neither the page nor its upgrade was on sale.
    const before = build("2026-10-26");
    const onSale = "On sale from 27 Oct 2026";
    expect(row(before, "pre-fixed")).toMatchObject({ live: false, line: onSale });
    expect(row(before, "upgrade")).toMatchObject({ live: false, line: onSale });
    // Through it: only who finished after the switch-on met the page.
    const through = build("2026-10-27");
    expect(row(through, "pre-fixed")).toMatchObject({
      live: true,
      line: "",
      shown: 1,
      shownUnread: false,
      base: 1,
    });
    expect(row(through, "upgrade")).toMatchObject({ live: true, line: "" });
    // Who saw the page couldn't be read: Paywall shown is blank and says so, never 0. Before the
    // switch-on nothing was read, and the full report's paywall isn't counted (Marcus's board).
    const unread = build("2026-10-27", null);
    expect(row(unread, "pre-fixed")).toMatchObject({ shown: null, shownUnread: true, base: 1 });
    expect(row(unread, "full")).toMatchObject({ shown: null, shownUnread: false });
    expect(row(build("2026-10-26", null), "pre-fixed")).toMatchObject({
      live: false,
      shownUnread: false,
    });
    // The price test's switch, on today, doesn't put the choosing page on sale before the test.
    expect(row(through, "pre-choose")).toMatchObject({
      live: false,
      line: "On sale with the price test, from 26 Nov 2026",
    });
  });

  it("payment types: the page that sold a pre-unlock decides its row, the price test's half who could buy it", () => {
    const tracker = (arm: string) => JSON.stringify({ gate_reveal_arm: arm });
    const t = (iso: string) => Date.parse(iso) / 1000;
    const subs = [
      sub({
        id: 10,
        day: "2026-11-26",
        at: "2026-11-26T20:30:00Z",
        pays: [[t("2026-11-26T20:40:00Z"), 1.99, "initial"]],
      }),
      sub({ id: 11, day: "2026-11-26", at: "2026-11-26T20:31:00Z" }),
      sub({
        id: 12,
        day: "2026-11-26",
        at: "2026-11-26T20:52:00Z",
        pays: [[t("2026-11-26T21:00:00Z"), 6.99, "initial"]],
      }),
      sub({ id: 13, day: "2026-11-27", at: "2026-11-27T01:00:00Z" }),
      // A survey bought before it was taken: it never meets a EUR 1.99 page.
      sub({ id: 14, day: "2026-11-27", at: "2026-11-27T02:00:00Z", pts: true }),
    ];
    const pre = [
      money({ sid: 10, day: "2026-11-26", amount: 1.99, plan: "initial" }),
      money({ sid: 12, day: "2026-11-26", amount: 6.99, plan: "initial" }),
      // A reader who finished before the switch, unstamped, paid a chosen price after it.
      money({ sid: 9, day: "2026-11-27", amount: 4.5, plan: "initial" }),
      // An upgrade, bought after the pre-unlock.
      money({ sid: 10, day: "2026-11-27", amount: 19.99, upgrade: true }),
    ];
    const build = (
      priceRows: Array<{ id: number; utm_tracker: string | null }> | null,
      priceChoices: Map<number, "fair" | "support" | "custom" | "free"> | null
    ) =>
      buildPayment({
        facts: factsFixture({
          from: "2026-11-26",
          to: "2026-11-27",
          subs,
          checkouts: [],
          refunds: [],
          money: pre,
        }),
        filters: parseFilters(
          { period: "custom", from: "2026-11-26", to: "2026-11-27" },
          "2026-11-27"
        ),
        today: "2026-11-27",
        now: new Date("2026-11-27T10:00:00Z"),
        gateOn: true,
        priceOn: true,
        gateSeen: new Set([10, 11, 12]),
        priceRows,
        priceChoices,
      });
    const stamps = [
      { id: 10, utm_tracker: tracker("fixed") },
      { id: 11, utm_tracker: tracker("fixed") },
      { id: 12, utm_tracker: tracker("choose") },
      { id: 13, utm_tracker: tracker("choose") },
    ];
    const picks = new Map<number, "fair" | "support" | "custom" | "free">([
      [12, "fair"],
      [9, "custom"],
    ]);
    const p = build(stamps, picks);
    const row = (k: string) => p.types.rows.find((r) => r.key === k)!;
    expect(row("pre-fixed")).toMatchObject({
      live: true,
      sales: 1,
      revenue: 1.99,
      shown: 2,
      base: 2,
      baseOf: "finishers",
      line: "",
    });
    expect(row("pre-choose")).toMatchObject({
      live: true,
      sales: 2,
      revenue: 11.49,
      shown: 1,
      base: 2,
      baseOf: "finishers",
      line: "",
    });
    expect(row("full")).toMatchObject({
      live: true,
      sales: 0,
      shown: null,
      base: 4,
      baseOf: "finishers",
    });
    expect(row("upgrade")).toMatchObject({
      live: true,
      sales: 1,
      revenue: 19.99,
      shown: 2,
      base: 2,
      baseOf: "pre-unlock buyers",
    });
    const added = (q: typeof p) => q.types.rows.reduce((n, r) => n + (r.sales ?? 0), 0);
    expect(added(p)).toBe(p.tiles.find((x) => x.key === "sales")!.value);
    // Without the halves: the sales still split by their page, the bases blank, and why.
    const why = "Who is in which half of the price test could not be read just now.";
    const noHalves = build(null, picks).types.rows;
    expect(noHalves.find((r) => r.key === "pre-choose")).toMatchObject({
      live: true,
      sales: 2,
      base: null,
      shown: null,
      line: why,
    });
    // Without the picks: one Pre-unlock row holds every pre-unlock, so the rows still add up.
    const noPicks = build(stamps, null);
    expect(noPicks.types.rows.map((r) => r.key)).toEqual(["pre", "full", "upgrade"]);
    expect(noPicks.types.rows[0]).toMatchObject({
      name: "Pre-unlock",
      live: true,
      sales: 3,
      line: "Who chose a price could not be read just now.",
    });
    expect(added(noPicks)).toBe(noPicks.tiles.find((x) => x.key === "sales")!.value);
    // An unreadable price switch is never read as off.
    const priceLine = (priceOn: boolean | null) =>
      buildPayment({
        facts: factsFixture({
          from: "2026-11-26",
          to: "2026-11-27",
          subs: [],
          checkouts: [],
          refunds: [],
          money: [],
        }),
        filters: parseFilters(
          { period: "custom", from: "2026-11-26", to: "2026-11-27" },
          "2026-11-27"
        ),
        today: "2026-11-27",
        now: new Date("2026-11-27T10:00:00Z"),
        gateOn: true,
        priceOn,
        priceRows: [],
        priceChoices: new Map(),
      }).types.rows.find((r) => r.key === "pre-choose")!.line;
    expect(priceLine(null)).toBe("The price test's switch couldn't be read");
    expect(priceLine(false)).toBe("The price test is switched off");
    expect(priceLine(true)).toBe("");
  });

  it("pay to start is retired: its purchases and its readers' later ones share one row, only where the range has them", () => {
    const pts = { journey: "pay_to_start", pts: true };
    const sales = [
      money({ sid: 2, day: "2026-10-24", amount: 19.99 }),
      // Pay to start's own purchases: the report in full and the EUR 1.99 first.
      money({ sid: 4, day: "2026-10-24", amount: 29.99, ...pts }),
      money({ sid: 5, day: "2026-10-26", amount: 1.99, plan: "initial", ...pts }),
      // A 100% code's EUR 0 purchase is no sale.
      money({ sid: 6, day: "2026-10-26", amount: 0, method: null, ...pts }),
      // What a pay-to-start reader bought on the report after, an upgrade from their EUR 1.99 too.
      money({ sid: 4, day: "2026-10-27", amount: 9.99, plan: "all_reports", pts: true }),
      money({ sid: 5, day: "2026-10-28", amount: 19.99, pts: true, upgrade: true }),
    ];
    const refunds = [refund({ sid: 7, day: "2026-10-24", amount: 29.99, ...pts })];
    const p = payment("2026-10-22", "2026-10-28", { money: sales, refunds }, {}, true);
    const rows = p.types.rows;
    expect(rows.at(-1)).toMatchObject({
      key: "pay-to-start",
      name: "Pay to start (retired)",
      live: true,
      sales: 4,
      revenue: 61.96,
      refunds: 1,
      fullRefunds: 1,
      shown: null,
      base: null,
    });
    expect(rows.find((r) => r.key === "full")).toMatchObject({ sales: 1, revenue: 19.99 });
    // Not the free survey's upgrade: that row is for the pre-unlocks sold after the survey.
    expect(rows.find((r) => r.key === "upgrade")).toMatchObject({ sales: 0 });
    expect(rows.reduce((n, r) => n + (r.sales ?? 0), 0)).toBe(
      p.tiles.find((t) => t.key === "sales")!.value
    );
    // "Free survey" leaves pay to start out: no retired row, and the rows still add up.
    const free = payment(
      "2026-10-22",
      "2026-10-28",
      { money: sales, refunds },
      { funnel: "free" },
      true
    );
    expect(free.types.rows.some((r) => r.key === "pay-to-start")).toBe(false);
    expect(free.types.rows.reduce((n, r) => n + (r.sales ?? 0), 0)).toBe(
      free.tiles.find((t) => t.key === "sales")!.value
    );
  });

  it("checkout success says how many reached the payment page", () => {
    const p = payment("2026-09-21", "2026-10-20", {
      checkouts: [
        { ...sampleCheckout, n: 3 },
        { ...sampleCheckout, status: "succeeded", attempted: true, n: 1 },
      ],
    });
    expect(p.tiles.find((t) => t.key === "checkout")!.note).toBe("1 of 4 reached the payment page");
  });

  it("over time and checkouts start at paid checkout's start, labelled as the shared buckets", () => {
    const p = payment("2026-03-21", "2026-10-20");
    const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct (to 20th)"];
    expect(p.overTime.grain).toBe("month");
    expect(p.overTime.rows.map((r) => r.label)).toEqual(months);
    expect(p.checkout.points.map((r) => r.label)).toEqual(months);
    expect(p.overTime.note).toBe(
      "From 1 May 2026, when paid checkout began: nothing was sold before."
    );
    expect(payment("2026-06-01", "2026-10-20").overTime.note).toBeNull();
  });

  it("leaves out the notes about visits and unfinished starts, which concern other pages", () => {
    const notes = payment("2026-03-21", "2026-10-20").notes;
    expect(notes.some((n) => /visit log/i.test(n))).toBe(false);
    expect(notes.some((n) => /Unfinished survey starts/.test(n))).toBe(false);
    expect(notes.some((n) => /^A person's source is recorded/.test(n))).toBe(true);
  });

  it("orders the device rows by paid sales, Not recorded last", () => {
    const p = payment("2026-09-21", "2026-10-20", {
      subs: [
        sub({ id: 1, device: "Android" }),
        sub({ id: 2, device: "Desktop", sales: 2, revenue: 20, paidAt: "2026-10-01T11:00:00Z" }),
        sub({ id: 3, device: "iOS", sales: 1, revenue: 10, paidAt: "2026-10-01T11:00:00Z" }),
        sub({ id: 4, device: null, sales: 3, revenue: 30, paidAt: "2026-10-01T11:00:00Z" }),
      ],
    });
    expect(p.segments.find((s) => s.key === "device")!.rows.map((r) => r.label)).toEqual([
      "Desktop",
      "iOS",
      "Android",
      "Not recorded",
    ]);
  });
});

const sampleCheckout = {
  day: "2026-10-02",
  sid: null,
  ph: null,
  status: "canceled",
  attempted: false,
  plan: "full_report",
  priceArm: "A3",
  arm: "white_card",
  device: "iOS",
  tier: "tier_1",
  src: "google",
  med: "cpc",
  ads: true,
  n: 1,
};

/** A page from the builder itself: two sales. */
function built(): PaymentPayload {
  return payment("2026-09-21", "2026-10-20", {
    subs: twice,
    money: [
      money({ sid: 2, amount: 9.99 }),
      money({ sid: 3, amount: 29.99, plan: "all_reports", method: "link" }),
    ],
    refunds: [],
    checkouts: [{ ...sampleCheckout, status: "succeeded", attempted: true, n: 2 }],
  });
}

afterEach(() => cleanup());

describe("Payment page (design sync, 21 Oct 2026)", () => {
  it("puts an info icon, defined, on every figure", () => {
    view.payload = built();
    render(<ApPayment />);
    const icons = screen.getAllByRole("button", { name: /^About / });
    // Nothing undefined: a missing key shows "Not defined yet.".
    expect(icons.filter((b) => b.getAttribute("title") === "Not defined yet.")).toEqual([]);
    const names = new Set(icons.map((b) => b.getAttribute("aria-label")));
    for (const label of [
      "Revenue",
      "Paid sales",
      "Pre-unlocks",
      "Pre-unlock CVR",
      "Full unlocks",
      "Full-unlock CVR",
      "Avg. order value",
      "Payment CVR",
      "Checkout success",
      "Sales",
      "Average price",
      "Share of revenue",
      "Refunds",
      "Refund rate",
      "Pre-unlock and full-unlock payments over time",
      "Pre-unlock sales",
      "Full-unlock avg.",
      "Finishers",
      "a) Reached payment page",
      "b) Filled in and attempted",
      "c) Payment succeeded",
      "Payment methods",
      "AOV",
      "Share of sales",
      "Full CVR",
      "Rev. / finisher",
      "Paywall shown",
      "CVR",
    ]) {
      // Named as the page names the figure, which may add its value ("At the price tested · €15").
      expect(
        [...names].some((n) => n === `About ${label}` || n.startsWith(`About ${label}`)),
        label
      ).toBe(true);
    }
    // Every numeric column of every table has one.
    for (const t of screen.getAllByRole("table")) {
      const heads = within(t).getAllByRole("columnheader").slice(1);
      const numeric = heads.filter((h) => h.textContent !== "Arm" && h.textContent !== "Month");
      for (const h of numeric)
        expect(within(h).queryByRole("button"), h.textContent!).not.toBeNull();
    }
  });

  it("blanks the free survey's €1.99 figures, with why, while its gate is off and none was sold in it", () => {
    // Pay to start's €1.99 sold; nothing went through the report's own gate.
    const pts = { journey: "pay_to_start", pts: true };
    const noGateSale = {
      money: [
        money({ sid: 2, day: "2026-10-24", amount: 19.99 }),
        money({ sid: 5, day: "2026-10-26", amount: 1.99, plan: "initial", ...pts }),
      ],
    };
    const at = (gate: boolean | null, funnel = "free") =>
      payment("2026-10-22", "2026-10-28", noGateSale, { funnel }, gate);
    const tile = (p: ReturnType<typeof at>, k: string) => p.tiles.find((t) => t.key === k)!;
    const off = at(false);
    expect(tile(off, "pre")).toMatchObject({
      value: null,
      note: "Not sold in the free survey: the report's €1.99 gate is switched off.",
      spark: [],
    });
    expect(tile(off, "pre-cvr")).toMatchObject({ value: null, spark: [] });
    expect(off.overTime.preOnSale).toBe(false);
    expect(off.overTime.preWhy).toMatch(/gate is switched off/);
    // A switch that couldn't be read is said so, never read as off.
    expect(tile(at(null), "pre").note).toMatch(/switch couldn't be read/);
    // With the gate on, the free survey's 0 is a real 0.
    expect(tile(at(true), "pre").value).toBe(0);
    // All funnels: pay to start's €1.99 sale counts, as before.
    expect(tile(at(false, "all"), "pre").value).toBeGreaterThan(0);
  });

  it("draws the payment types first, then the price test, with who met each page and the CVR", () => {
    view.payload = built();
    render(<ApPayment />);
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(h2.slice(0, 5)).toEqual([
      "Payment types",
      "Pre-unlock price test: €1.99 vs choose your price",
      "Pre-unlock and full-unlock payments over time",
      "Who pays",
      "Checkout and payment methods",
    ]);
    // The sections that left with Marcus's board of 24 Nov are gone.
    for (const gone of ["Paygate exits", "Pricing tests", "Price elasticity prediction"])
      expect(h2).not.toContain(gone);
    const table = screen.getByRole("table", { name: "Payment types" });
    const cells = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) =>
        [...r.querySelectorAll('[role="rowheader"], [role="cell"]')].map((c) => c.textContent)
      );
    expect(cells[0]).toEqual([
      "Pre-unlock · fixed €1.99On sale from 27 Oct 2026",
      "—",
      "—",
      "—",
      "—",
      "—",
      "—",
      "—",
      "—",
    ]);
    expect(cells[2]).toEqual([
      "Full report on the report",
      "—",
      "2",
      "40.0%of 5 finishers",
      "€19.99",
      "€39.98",
      "100.0%",
      "0",
      "0.0%",
    ]);
    expect(
      screen.getByText(
        "Refunds come from the payment records (refunded in full or in part). The free survey's €1.99 page is on from 27 Oct 2026, the Choose your price page with the price test from 26 Nov 2026. CVR is of the range's finishers who could buy the type, or of the pre-unlock buyers for the full report after one. Pay to start is retired (27 Nov 2026): its sales keep a row only in a range that has them."
      )
    ).toBeTruthy();
    // The Revenue tile in whole euros.
    expect(
      screen.getAllByText("Revenue")[0]!.parentElement!.textContent!.replace(/\u00a0/g, " ")
    ).toBe("Revenue €4021 Sep – 20 Oct 2026");
    // The CSV carries the tables in the page's order, the payment types first.
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections.map((x) => x.name).slice(0, 3)).toEqual([
      "Payment types",
      "Pre-unlock price test",
      "Payments over time",
    ]);
    expect(exported.sections[0]!.table.rows[2]!.values).toEqual([
      "",
      null,
      2,
      0.4,
      5,
      "finishers",
      19.99,
      39.98,
      1,
      0,
      0,
    ]);
  });

  it("leaves relationships and countries under 15 finishers out, and says so", () => {
    const base = built();
    const row = (label: string, finishers: number) => ({
      ...base.segments[0]!.rows[0]!,
      label,
      finishers,
    });
    view.payload = {
      ...base,
      segments: base.segments.map((s) =>
        s.key === "country" ? { ...s, rows: [row("United States", 40), row("Malta", 3)] } : s
      ),
    };
    render(<ApPayment />);
    const card = screen.getByRole("region", { name: "Who pays" });
    fireEvent.change(within(card).getByLabelText("Segment by"), { target: { value: "country" } });
    const names = within(within(card).getByRole("table"))
      .getAllByRole("rowheader")
      .map((r) => r.textContent);
    expect(names).toEqual(["United States"]);
    expect(within(card).getByText(/Smaller groups are left out\./)).toBeTruthy();
    // Gender keeps every group.
    fireEvent.change(within(card).getByLabelText("Segment by"), { target: { value: "gender" } });
    expect(within(card).queryByText(/Smaller groups are left out/)).toBeNull();
  });

  it("writes every Payment query whole", () => {
    const keys = Object.keys(FIELDS).filter((x) => x.startsWith("payment."));
    expect(keys.length).toBeGreaterThanOrEqual(50);
    for (const k of keys) expect(FIELDS[k]!.query.text, k).not.toMatch(/undefined|\$\{/);
  });
});
