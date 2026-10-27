import { describe, expect, it } from "vitest";

import type { CheckoutFact, MoneyFact } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildPayment,
  CHECKOUT_FROM,
  fitElasticity,
  welch,
} from "@features/admin/server/ap/payment";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");

const money = (over: Partial<MoneyFact>): MoneyFact => ({
  day: "2026-10-02",
  sid: 1,
  amount: 9.99,
  plan: "full_report",
  arm: "white_card",
  device: "iOS",
  tier: "tier_1",
  ph: null,
  uid: 1001,
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

const checkout = (over: Partial<CheckoutFact>): CheckoutFact => ({
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
  ...over,
});

const payment = (from: string, to: string, over: Parameters<typeof factsFixture>[0] = {}) =>
  buildPayment({
    facts: factsFixture({ from, to, ...over }),
    filters: parseFilters({ period: "custom", from, to }, TODAY),
    today: TODAY,
    now,
    uplift: { enabled: false, updatedAt: "2026-08-03T18:28:00Z" },
  });

describe("Payment page builder", () => {
  it("checkouts count from the day paid checkout went live; earlier ones were tests", () => {
    expect(CHECKOUT_FROM).toBe("2026-05-01");
    const p = payment("2026-04-01", "2026-05-31", {
      money: [],
      checkouts: [
        // The team's tests in April: 44 sessions from one report.
        checkout({ day: "2026-04-14", n: 44 }),
        checkout({ day: "2026-05-03", n: 3 }),
        checkout({ day: "2026-05-04", attempted: true, n: 2 }),
        checkout({ day: "2026-05-05", status: "succeeded", attempted: true, n: 1 }),
      ],
    });
    expect(p.checkout).toMatchObject({ reached: 6, attempted: 3, paid: 1 });
    // An abandoned checkout is written when Stripe closes it, a day after it was opened.
    const late =
      "A checkout counts on the day the payment page was reached. One left unpaid is recorded when Stripe closes it, a day later, so the last day's can still come in.";
    expect(p.checkout.note).toBe(
      `Checkouts count from 1 May 2026, when paid checkout went live: the earlier ones were the team's tests. ${late}`
    );
    expect(p.tiles.find((t) => t.key === "checkout")).toMatchObject({
      value: 1 / 6,
      note: "1 of 6 reached the payment page",
      noteTone: "bad",
    });
    expect(payment("2026-10-01", "2026-10-07").checkout.note).toBe(late);
  });

  it("a refunded or disputed checkout was paid; under the new/returning filter a checkout goes with its finisher's visit", () => {
    const facts = {
      money: [],
      checkouts: [
        checkout({ n: 2, visitorNew: true }),
        checkout({ status: "succeeded", attempted: true, n: 1, visitorNew: true }),
        checkout({ status: "refunded", attempted: true, n: 1, visitorNew: false }),
        // PostHog never saw this finisher's visit: in neither group.
        checkout({ status: "disputed", attempted: true, n: 1, visitorNew: null }),
      ],
    };
    expect(payment("2026-10-01", "2026-10-07", facts).checkout).toMatchObject({
      reached: 5,
      attempted: 3,
      paid: 3,
    });
    const p = buildPayment({
      facts: factsFixture({ from: "2026-10-01", to: "2026-10-07", ...facts }),
      filters: {
        ...parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY),
        visitor: "new",
      },
      today: TODAY,
      now,
      uplift: null,
    });
    expect(p.checkout).toMatchObject({ reached: 3, attempted: 1, paid: 1, why: null });
    expect(p.tiles.find((t) => t.key === "checkout")).toMatchObject({
      value: 1 / 3,
      blocked: null,
    });
  });

  it("pricing tests: each stretch's own readers, on the list they were dealt, and what they did on it", () => {
    const at = (iso: string) => Date.parse(iso) / 1000;
    const p = payment("2026-08-01", "2026-10-20", {
      subs: [
        // Pricing 2.0, arm A: bought the €9.99 single in the stretch.
        sub({
          id: 1,
          day: "2026-08-10",
          at: "2026-08-10T10:00:00Z",
          quotedAt: "2026-08-10T10:01:00Z",
          priceArm: "A",
          paidAt: "2026-08-10T11:00:00Z",
          pays: [[at("2026-08-10T11:00:00Z"), 9.99, "full_report"]],
        }),
        // Pricing 2.0, arm B: bought after A was raised, so outside 2.0's stretch.
        sub({
          id: 2,
          day: "2026-08-20",
          at: "2026-08-20T10:00:00Z",
          quotedAt: "2026-08-20T10:01:00Z",
          priceArm: "B",
          paidAt: "2026-08-25T11:00:00Z",
          pays: [[at("2026-08-25T11:00:00Z"), 29, "full_report"]],
        }),
        // Pricing 2.1, arm A.
        sub({
          id: 3,
          day: "2026-08-26",
          at: "2026-08-26T10:00:00Z",
          quotedAt: "2026-08-26T10:01:00Z",
          priceArm: "A",
        }),
        // Finished in 2.0's stretch but first quoted after it ended: priced by 2.1, in neither.
        sub({
          id: 5,
          day: "2026-08-23",
          at: "2026-08-23T20:00:00Z",
          quotedAt: "2026-08-25T09:00:00Z",
          priceArm: "B",
        }),
        // Pricing 3.0, arm B3: finished after its restart, saw the paywall, checked out.
        sub({
          id: 4,
          day: "2026-10-12",
          at: "2026-10-12T10:00:00Z",
          quotedAt: "2026-10-12T10:01:00Z",
          priceArm: "B3",
          paywallAt: "2026-10-12T10:05:00Z",
        }),
      ],
      money: [],
      checkouts: [checkout({ day: "2026-10-12", sid: 4, priceArm: "B3" })],
    });
    const arm = (test: string, a: string) =>
      p.pricing.arms.find((r) => r.test === test && r.arm === a)!;
    expect(p.pricing.arms.map((r) => `${r.test} ${r.arm}`)).toEqual([
      "Pricing 2.0 A",
      "Pricing 2.0 B",
      "Pricing 2.1 A",
      "Pricing 2.1 B",
      "Pricing 3.0 A3",
      "Pricing 3.0 B3",
    ]);
    expect(arm("Pricing 2.0", "A")).toMatchObject({
      basePrice: "€9.99 full · €19.99 core · €29.99 all",
      finishers: 1,
      paidSales: 1,
      revenue: 9.99,
      // The seen stamp starts on 6 Sep 2026: no paywall views to show for August.
      paywallViews: null,
    });
    // B's buyer paid after the stretch ended: not 2.0's sale.
    expect(arm("Pricing 2.0", "B")).toMatchObject({ finishers: 1, paidSales: 0 });
    expect(arm("Pricing 2.1", "A")).toMatchObject({
      basePrice: "€39.99 full · €49.99 core · €59.00 all",
      finishers: 1,
    });
    expect(arm("Pricing 3.0", "B3")).toMatchObject({ finishers: 1, paywallViews: 1, checkouts: 1 });
    expect(arm("Pricing 2.0", "A").note).toMatch(/· ended$/);
    expect(arm("Pricing 3.0", "A3").note).toMatch(/^Live · from 8 Oct/);
  });

  it("who pays: a segment's full-unlock average counts its full unlocks only", () => {
    const p = payment("2026-10-01", "2026-10-07", {
      subs: [
        // Essentials first (€4.99), then the Full upgrade (€19.99): one full unlock, €19.99.
        sub({
          id: 1,
          gender: "Woman",
          paidAt: "2026-10-02T10:00:00Z",
          sales: 2,
          revenue: 24.98,
          plan: "essentials",
          full: true,
          fullSales: 1,
          fullRevenue: 19.99,
        }),
        sub({
          id: 2,
          gender: "Woman",
          paidAt: "2026-10-03T10:00:00Z",
          sales: 1,
          revenue: 9.99,
          plan: "full_report",
          full: true,
          fullSales: 1,
          fullRevenue: 9.99,
        }),
        sub({ id: 3, gender: "Woman" }),
      ],
    });
    const women = p.segments.find((s) => s.key === "gender")!.rows[0]!;
    expect(women).toMatchObject({
      finishers: 3,
      sales: 3,
      fullCvr: 2 / 3,
      // (€19.99 + €9.99) / 2, the €4.99 Essentials left out.
      fullAvg: 14.99,
      revenue: 34.97,
      fullBuyers: 2,
      fullSales: 2,
      fullRevenue: 29.98,
    });
  });

  it("who pays: a segment's pre-unlock rate and average, from each finisher's paid sales", () => {
    // Pre-unlocks went on sale on 23 Oct 2026: a week after.
    const at = Date.parse("2026-10-25T10:00:00Z") / 1000;
    const subs = [
      sub({
        id: 1,
        day: "2026-10-25",
        at: "2026-10-25T09:00:00Z",
        gender: "Woman",
        sales: 1,
        revenue: 1.99,
        pays: [[at, 1.99, "initial"]],
      }),
      // The Core Archetype, then the full report: one pre-unlock, one full unlock.
      sub({
        id: 2,
        day: "2026-10-25",
        at: "2026-10-25T09:00:00Z",
        gender: "Woman",
        sales: 2,
        revenue: 31.98,
        pays: [
          [at, 1.99, "initial"],
          [at + 60, 29.99, "full_report"],
        ],
        full: true,
        fullSales: 1,
        fullRevenue: 29.99,
      }),
      // E07's day-4 gift: a EUR 0 Initial row, never a sale.
      sub({
        id: 3,
        day: "2026-10-25",
        at: "2026-10-25T09:00:00Z",
        gender: "Woman",
        gifted: true,
        pays: [[at, 0, "initial"]],
      }),
      sub({ id: 4, day: "2026-10-25", at: "2026-10-25T09:00:00Z", gender: "Woman" }),
    ];
    const p = payment("2026-10-24", "2026-10-30", { subs });
    const women = p.segments.find((s) => s.key === "gender")!.rows[0]!;
    expect(women).toMatchObject({
      finishers: 4,
      preCvr: 0.5,
      preAvg: 1.99,
      preBuyers: 2,
      preSales: 2,
      preRevenue: 3.98,
    });
    // A range starting before it was on sale: nobody could pre-unlock its first days, so blank.
    const early = payment("2026-10-20", "2026-10-30", { subs });
    expect(early.segments.find((s) => s.key === "gender")!.rows[0]!.preCvr).toBeNull();
    // ...and the table says why, as the tile does.
    const why =
      "Pre CVR counts from 23 Oct 2026, the first whole day the €1.99 was on sale: pick a range from then.";
    for (const t of early.segments) expect(t.note).toContain(why);
    for (const t of p.segments) expect(t.note).not.toContain(why);
  });

  it("the headline figures: revenue, paid sales and free unlocks, full-unlock and payment CVR", () => {
    const p = payment("2026-10-01", "2026-10-07", {
      money: [
        money({ sid: 1, amount: 19.99 }),
        money({ sid: 2, amount: 9.99, plan: "all_reports", method: "link" }),
        // A free unlock: not a sale.
        money({ sid: 3, amount: 0, method: null }),
      ],
      subs: [
        sub({ id: 1, paidAt: "2026-10-02T10:00:00Z", full: true }),
        sub({ id: 2, paidAt: "2026-10-02T11:00:00Z", full: true }),
        sub({ id: 3, gifted: true }),
        sub({ id: 4 }),
      ],
    });
    const tile = (k: string) => p.tiles.find((t) => t.key === k)!;
    expect(tile("revenue").value).toBe(29.98);
    expect(tile("sales")).toMatchObject({ value: 2, note: "+ 1 free unlock" });
    expect(tile("full")).toMatchObject({ value: 2 });
    expect(tile("full-cvr").value).toBe(2 / 4);
    expect(tile("pay-cvr")).toMatchObject({ value: 2 / 4, note: "2 of 4 finishers" });
    expect(tile("aov").value).toBe(14.99);
    // The Initial plan went on sale on 23 Oct 2026: a range wholly before is blank, never 0.
    expect(tile("pre")).toMatchObject({
      value: null,
      note: "Initial plan · counted from 23 Oct 2026, its first whole day on sale",
    });
    expect(p.checkout.methods.map((m) => [m.name, m.sales, m.revenue])).toEqual([
      ["Visa", 1, 19.99],
      ["Stripe Link", 1, 9.99],
    ]);
    // The per-visitor price switch is off: the page says the multipliers are not applied.
    expect(p.pricing.factors).toMatchObject({ on: false, since: "2026-08-03T18:28:00Z" });
    const traffic = p.pricing.factors.groups.find((g) => g.label === "Traffic source")!;
    expect(traffic.items.map((i) => i.key)).toContain("TikTok");
  });

  it("the elasticity model: a straight line in logs, and only with three months", () => {
    // cvr = 2 · price^-1, exactly.
    const fit = fitElasticity([
      { price: 10, cvr: 0.2 },
      { price: 20, cvr: 0.1 },
      { price: 40, cvr: 0.05 },
    ])!;
    expect(fit.e).toBeCloseTo(-1);
    expect(Math.exp(fit.a)).toBeCloseTo(2);
    expect(fitElasticity([{ price: 10, cvr: 0.2 }])).toBeNull();
  });

  it("the AOV comparison: B's mean over A's, with a two-sided confidence", () => {
    const t = welch([10, 10, 12, 12], [20, 20, 22, 22]);
    expect(t.lift).toBeCloseTo(21 / 11 - 1);
    expect(t.confidence).toBeGreaterThan(0.99);
    expect(welch([10], [20, 21])).toEqual({ lift: null, confidence: null });
  });
  it("a filter the records can't follow blanks every section about people, never zeros", () => {
    // A source filter before sources were recorded (19 Jul 2026).
    const p = buildPayment({
      facts: factsFixture({ from: "2026-07-01", to: "2026-07-31" }),
      filters: parseFilters(
        { period: "custom", from: "2026-07-01", to: "2026-07-31", source: "google_ads" },
        TODAY
      ),
      today: TODAY,
      now,
      uplift: null,
    });
    expect(p.blocked).toMatch(/^Sources are recorded from 19 Jul 2026/);
    expect(p.tiles.every((t) => t.value === null && t.blocked === p.blocked)).toBe(true);
    expect(p.overTime.rows).toEqual([]);
    expect(p.segments).toEqual([]);
    expect(p.pricing.arms).toEqual([]);
    expect(p.elasticity.why).toBe(p.blocked);
    expect(p.checkout.why).toBe(p.blocked);
  });

  it("an AOV lift's confidence is Welch's t-test, not the normal curve, on a handful of sales", () => {
    // p = 0.0030094339 by numerically integrating Student's t (df 3.909, t 6.570).
    expect(1 - welch([10, 12, 9], [20, 25, 30, 28]).confidence!).toBeCloseTo(0.0030094339, 9);
  });
});
