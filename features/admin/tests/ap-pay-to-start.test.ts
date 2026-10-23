import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  buildPayToStart,
  offerOfLanding,
  type EntitlementRow,
  type PtsInput,
} from "@features/admin/server/ap/pay-to-start";

/**
 * The pay-to-start page (22.10 sync: "a separate custom report … cost per click and cost per
 * conversion"): each offer's ads by the page they land on, its buyers from our records.
 */
const row = (over: Partial<EntitlementRow>): EntitlementRow => ({
  id: 1,
  offer: "full",
  status: "succeeded",
  amount_cents: 2999,
  list_price_cents: 2999,
  is_test: false,
  customer_email: "reader@example.com",
  // 10:00 UTC is noon in Berlin: the same reporting day.
  created_at: "2026-10-23T10:00:00Z",
  paid_at: "2026-10-23T10:02:00Z",
  consumed_submission_id: null,
  ...over,
});

const input = (over: Partial<PtsInput>): PtsInput => ({
  entitlements: [],
  visitsByDay: { "2026-10-23": 40 },
  openedSubmissions: new Set(),
  upgrades: new Map(),
  ads: { ok: true, value: [] },
  from: "2026-10-23",
  to: "2026-10-23",
  today: "2026-10-30",
  ...over,
});

const arm = (p: ReturnType<typeof buildPayToStart>, offer: string) =>
  p.arms.find((a) => a.offer === offer)!;

describe("offerOfLanding", () => {
  it("names the offer by the ad's landing page, and nothing else", () => {
    expect(offerOfLanding("https://www.loveiq.org/sexual-archetype")).toBe("full");
    expect(offerOfLanding("https://www.loveiq.org/sexual-archetype/")).toBe("full");
    expect(offerOfLanding("https://loveiq.org/sexual-archetype?utm_source=google")).toBe("full");
    expect(offerOfLanding("https://www.loveiq.org/sexual-archetype/initial")).toBe("pre");
    expect(offerOfLanding("https://www.loveiq.org/")).toBeNull();
    expect(offerOfLanding("https://www.loveiq.org/survey")).toBeNull();
    expect(offerOfLanding("not a url")).toBeNull();
    // An unexpanded final URL keeps its ValueTrack placeholders, percent-encoded.
    expect(offerOfLanding("https://www.loveiq.org/sexual-archetype%7Bignore%7D")).toBe("full");
    expect(offerOfLanding("https://www.loveiq.org/sexual-archetype/initial%7Bignore%7D")).toBe(
      "pre"
    );
    expect(offerOfLanding("https://www.loveiq.org/%7Bignore%7D")).toBeNull();
  });
});

describe("buildPayToStart", () => {
  it("prices a click and a paying customer per offer, from the ads on its own page", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          row({ id: 1, consumed_submission_id: 501 }),
          row({ id: 2, status: "pending", amount_cents: null, paid_at: null }),
          row({
            id: 3,
            offer: "pre",
            amount_cents: 199,
            list_price_cents: 199,
            consumed_submission_id: 502,
          }),
          row({ id: 4, offer: "pre", amount_cents: 199, list_price_cents: 199 }),
        ],
        openedSubmissions: new Set([501, 502]),
        upgrades: new Map([[502, 19.99]]),
        ads: {
          ok: true,
          value: [
            {
              url: "https://www.loveiq.org/sexual-archetype",
              cost: 30,
              clicks: 20,
              impressions: 400,
            },
            {
              url: "https://www.loveiq.org/sexual-archetype/initial",
              cost: 25,
              clicks: 50,
              impressions: 500,
            },
            // The free funnel's ads are not this page's.
            { url: "https://www.loveiq.org/", cost: 100, clicks: 90, impressions: 900 },
          ],
        },
      })
    );
    const full = arm(p, "full");
    expect(full).toMatchObject({ spend: 30, clicks: 20, checkouts: 2, paid: 1, revenue: 29.99 });
    expect(full.cpc).toBeCloseTo(1.5);
    expect(full.costPerPaid).toBeCloseTo(30);
    expect(full.ctr).toBeCloseTo(0.05);
    expect(full.clickToPaid).toBeCloseTo(0.05);
    expect(full.finished).toBe(1);
    expect(full.opened).toBe(1);
    expect(full.upgrades).toBe(0);
    const pre = arm(p, "pre");
    expect(pre).toMatchObject({ spend: 25, clicks: 50, checkouts: 2, paid: 2, revenue: 3.98 });
    expect(pre.cpc).toBeCloseTo(0.5);
    expect(pre.costPerPaid).toBeCloseTo(12.5);
    expect(pre.costPerFinished).toBeCloseTo(25);
    expect(pre).toMatchObject({ upgrades: 1, upgradeRevenue: 19.99 });
    // ROAS counts the €1.99 sales and the upgrades they led to.
    expect(pre.roas).toBeCloseTo((3.98 + 19.99) / 25);
    const all = arm(p, "all");
    expect(all).toMatchObject({ spend: 55, clicks: 70, checkouts: 4, paid: 3 });
    expect(all.costPerPaid).toBeCloseTo(55 / 3);
    expect(p.ads.unmatched).toBe(1);
    expect(p.visits).toBe(40);
  });

  it("leaves out staff, test buys and money not taken, and keeps refunds out of revenue", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          row({ id: 1 }),
          row({ id: 2, customer_email: "ec@loveiq.org" }),
          row({ id: 3, is_test: true }),
          row({ id: 4, amount_cents: 0 }),
          row({ id: 5, status: "refunded" }),
          // June's prepaid rows carry no offer: not this journey.
          row({ id: 6, offer: null }),
        ],
      })
    );
    const all = arm(p, "all");
    // 1 and 5 paid; 2 (staff), 3 (test) and 6 (no offer) are not counted at all; 4 took nothing.
    expect(all.checkouts).toBe(3);
    expect(all.paid).toBe(2);
    expect(all.refunded).toBe(1);
    expect(all.revenue).toBe(29.99);
  });

  it("counts a payment on the day it was charged and a checkout on the day it started", () => {
    const p = buildPayToStart(
      input({
        from: "2026-10-23",
        to: "2026-10-24",
        visitsByDay: {},
        entitlements: [
          // Started late on the 23rd in Berlin (21:30 UTC is 23:30), paid after midnight there.
          row({ id: 1, created_at: "2026-10-23T21:30:00Z", paid_at: "2026-10-23T22:30:00Z" }),
        ],
      })
    );
    const day = (d: string) => p.days.find((x) => x.day === d)!;
    expect(day("2026-10-23").checkouts.full).toBe(1);
    expect(day("2026-10-23").paid.full).toBe(0);
    expect(day("2026-10-24").paid.full).toBe(1);
  });

  it("never prints a cost it cannot read: no ads, no spend, and says why", () => {
    const p = buildPayToStart(
      input({
        entitlements: [row({ id: 1 })],
        ads: { ok: false, error: "Google Ads could not be read just now." },
        visitsByDay: null,
      })
    );
    const all = arm(p, "all");
    expect(all.spend).toBeNull();
    expect(all.cpc).toBeNull();
    expect(all.costPerPaid).toBeNull();
    expect(all.roas).toBeNull();
    expect(all.paid).toBe(1);
    expect(p.visits).toBeNull();
    expect(p.notes).toContain("Google Ads could not be read just now.");
    expect(p.notes).toContain("Visits could not be read just now.");
  });

  it("says so when no ad lands on a pay-to-start page yet", () => {
    const p = buildPayToStart(
      input({
        ads: {
          ok: true,
          value: [{ url: "https://www.loveiq.org/", cost: 10, clicks: 5, impressions: 50 }],
        },
      })
    );
    expect(arm(p, "all").spend).toBe(0);
    expect(arm(p, "all").cpc).toBeNull();
    expect(p.notes).toContain("No ad in this range lands on a pay-to-start page yet.");
  });
});
