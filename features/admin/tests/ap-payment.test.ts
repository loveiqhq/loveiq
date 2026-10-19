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
    expect(p.checkout.note).toBe(
      "Checkouts count from 1 May 2026, when paid checkout went live: the earlier ones were the team's tests."
    );
    expect(p.tiles.find((t) => t.key === "checkout")).toMatchObject({
      value: 1 / 6,
      note: "1 of 6 reached the payment page",
      noteTone: "bad",
    });
    expect(payment("2026-10-01", "2026-10-07").checkout.note).toBeNull();
  });

  it("a refunded or disputed checkout was paid; under the new/returning filter checkouts are blank", () => {
    const facts = {
      money: [],
      checkouts: [
        checkout({ n: 2 }),
        checkout({ status: "succeeded", attempted: true, n: 1 }),
        checkout({ status: "refunded", attempted: true, n: 1 }),
        checkout({ status: "disputed", attempted: true, n: 1 }),
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
    const why =
      "Checkouts can't be split into new and returning visitors: a checkout isn't linked to the visit PostHog saw.";
    expect(p.checkout).toMatchObject({ reached: 0, why });
    expect(p.tiles.find((t) => t.key === "checkout")).toMatchObject({ value: null, blocked: why });
    expect(p.pricing.arms.every((a) => a.checkouts === null)).toBe(true);
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
    // The Initial plan is on sale (19.10); the fixture sold none.
    expect(tile("pre")).toMatchObject({ value: 0, note: "Initial plan" });
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
});
