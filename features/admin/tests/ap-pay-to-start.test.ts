import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import type { Facts } from "@features/admin/server/ap/facts";
import {
  buildPayToStart,
  gateShares,
  measuresOf,
  offerOfLanding,
  taggedOf,
  type EntitlementRow,
  type FunnelKey,
  type PtsInput,
  type PtsPayload,
} from "@features/admin/server/ap/pay-to-start";

import { sub } from "./ap-fixtures";

/**
 * The pay-to-start page as Marcus drew it on 23.10 ("Funnel metrics compared"): every funnel
 * that sells the report counted alike, its ads from the page they land on.
 */
const ent = (over: Partial<EntitlementRow>): EntitlementRow => ({
  id: 1,
  offer: "full",
  status: "succeeded",
  amount_cents: 2999,
  list_price_cents: 2999,
  is_test: false,
  customer_email: "reader@example.com",
  // 10:00 UTC is noon in Berlin: the same reporting day.
  created_at: "2026-10-20T10:00:00Z",
  paid_at: "2026-10-20T10:02:00Z",
  consumed_submission_id: null,
  utm_tracker: null,
  ...over,
});

const start = (day: string, n: number, over: Partial<Facts["starts"][number]> = {}) => ({
  day,
  known: true,
  src: "google",
  med: "cpc",
  ads: true,
  arm: "white_card",
  device: "iOS",
  finished: false,
  camp: null,
  term: null,
  cq: null,
  email: false,
  n,
  ...over,
});

const visit = (day: string, n: number, src: string | null = null) => ({
  day,
  arm: "white_card",
  src,
  n,
});

const FREE_PAGE = "https://www.loveiq.org/%7Bignore%7D";
const FULL_PAGE = "https://www.loveiq.org/sexual-archetype";
const PRE_PAGE = "https://www.loveiq.org/sexual-archetype/initial";
const ad = (url: string, day: string, cost: number, clicks: number) => ({
  url,
  day,
  cost,
  clicks,
  impressions: clicks * 10,
});

const input = (over: Partial<PtsInput> = {}): PtsInput => ({
  facts: { visits: [], starts: [], subs: [] },
  entitlements: [],
  ptsVisits: [],
  boughtFirst: new Set(),
  boughtFirstStarts: {},
  openedSubmissions: new Set(),
  laterPays: new Map(),
  gateMembers: [],
  gateOn: false,
  ads: { ok: true, value: [] },
  from: "2026-10-19",
  to: "2026-10-25",
  today: "2026-10-30",
  prices: { full: 2999, pre: 199, gate: 199 },
  ...over,
});

const funnel = (p: PtsPayload, key: FunnelKey) => p.funnels.find((f) => f.key === key)!;
const step = (p: PtsPayload, key: FunnelKey, label: string) =>
  funnel(p, key).steps.find((s) => s.label === label)?.n;

const GCLID = JSON.stringify({ utm_source: "google", utm_medium: "cpc", gclid: "Cj0" });

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
  // One week, three funnels running, the gate off.
  const week = () =>
    buildPayToStart(
      input({
        facts: {
          visits: [visit("2026-10-20", 1000)],
          starts: [start("2026-10-20", 100)],
          subs: [
            sub({
              id: 1,
              day: "2026-10-20",
              at: "2026-10-20T10:00:00Z",
              paidAt: "2026-10-22T09:00:00Z",
              sales: 1,
              revenue: 29.99,
              checkoutAt: "2026-10-22T08:58:00Z",
            }),
            sub({ id: 2, day: "2026-10-20", src: null, med: null, ads: false }),
            sub({ id: 3, day: "2026-10-21", openedAt: null }),
            // A pay-to-start buyer's survey: that funnel's, never the free survey's.
            sub({ id: 501, day: "2026-10-20", paidAt: "2026-10-20T10:02:00Z", sales: 1 }),
          ],
        },
        boughtFirst: new Set([501, 502]),
        boughtFirstStarts: { "2026-10-20": 3 },
        ads: {
          ok: true,
          value: [
            ad(FREE_PAGE, "2026-10-20", 100, 200),
            ad(FULL_PAGE, "2026-10-20", 30, 20),
            ad(PRE_PAGE, "2026-10-21", 25, 50),
          ],
        },
        ptsVisits: [
          { day: "2026-10-20", offer: "full", src: "google", n: 18 },
          { day: "2026-10-21", offer: "pre", src: "google", n: 45 },
        ],
        entitlements: [
          ent({ id: 1, consumed_submission_id: 501, utm_tracker: GCLID }),
          ent({ id: 2, status: "pending", amount_cents: null, paid_at: null }),
          ent({
            id: 3,
            offer: "pre",
            amount_cents: 199,
            list_price_cents: 199,
            created_at: "2026-10-21T10:00:00Z",
            paid_at: "2026-10-21T10:01:00Z",
            consumed_submission_id: 502,
          }),
          ent({
            id: 4,
            offer: "pre",
            amount_cents: 199,
            list_price_cents: 199,
            created_at: "2026-10-21T11:00:00Z",
            paid_at: "2026-10-21T11:01:00Z",
            utm_tracker: GCLID,
          }),
        ],
        openedSubmissions: new Set([501, 502]),
        laterPays: new Map([[502, [{ amount: 19.99, plan: "full_report" }]]]),
      })
    );

  it("counts pay after the report from the free survey, its ads from every other page", () => {
    const after = funnel(week(), "after");
    expect(after).toMatchObject({ label: "Pay after the report", live: true, spend: 100 });
    expect(after.clicks).toBe(200);
    expect(after.all).toMatchObject({ visits: 1000, finished: 3, paid: 1, revenue: 29.99 });
    const m = after.all.m;
    expect(m.cpc).toBeCloseTo(0.5);
    expect(m.finishRate).toBeCloseTo(0.003);
    expect(m.cvr).toBeCloseTo(0.001);
    expect(m.clickCvr).toBeCloseTo(0.005);
    expect(m.rpv).toBeCloseTo(0.02999);
    expect(m.rpf).toBeCloseTo(9.9967, 3);
    expect(m.cac).toBeCloseTo(100);
    expect(m.cpf).toBeCloseTo(33.333, 2);
    expect(m.roas).toBeCloseTo(0.2999);
    expect(m.net).toBeCloseTo(-70.01);
  });

  it("walks pay after the report in its own order, buyers' survey starts left out", () => {
    const p = week();
    expect(funnel(p, "after").steps.map((s) => [s.label, s.n, s.pays])).toEqual([
      ["Visits", 1000, false],
      // 100 starts, 3 of them by people who paid to start.
      ["Survey started", 97, false],
      ["Survey finished", 3, false],
      ["Report opened", 2, false],
      ["Checkout started", 1, false],
      ["Paid", 1, true],
    ]);
  });

  it("counts each pay-to-start offer from its own page, upgrades in its revenue", () => {
    const p = week();
    const full = funnel(p, "full");
    expect(full).toMatchObject({ label: "Pay to start · €29.99", live: true, spend: 30 });
    expect(full.clicks).toBe(20);
    expect(full.all).toMatchObject({ visits: 18, finished: 1, paid: 1, revenue: 29.99 });
    expect(full.all.m.cvr).toBeCloseTo(1 / 18);
    expect(full.all.m.cac).toBeCloseTo(30);
    expect(full.all.m.roas).toBeCloseTo(29.99 / 30);
    expect(full.steps.map((s) => [s.label, s.n, s.pays])).toEqual([
      ["Visits", 18, false],
      // The pending checkout started too.
      ["Checkout started", 2, false],
      ["Paid €29.99", 1, true],
      ["Survey finished", 1, false],
      ["Report opened", 1, false],
    ]);

    const pre = funnel(p, "pre");
    expect(pre.label).toBe("Pay to start · €1.99");
    // Two EUR 1.99 sales and the full report one of them bought later.
    expect(pre.all).toMatchObject({ visits: 45, finished: 1, paid: 2, revenue: 23.97 });
    expect(pre.all.m.roas).toBeCloseTo(23.97 / 25);
    expect(pre.all.m.rpv).toBeCloseTo(23.97 / 45);
    expect(step(p, "pre", "Bought the full report")).toBe(1);
    expect(pre.steps.at(-1)!.pays).toBe(true);
  });

  it("reads paid traffic as the ad clicks and the people an ad brought, spend unchanged", () => {
    const p = week();
    const after = funnel(p, "after");
    // Subs 1 and 3 came through an ad; sub 2 did not.
    expect(after.ads).toMatchObject({ visits: 200, finished: 2, paid: 1, revenue: 29.99 });
    expect(after.ads.m.cvr).toBeCloseTo(1 / 200);
    expect(after.spend).toBe(100);
    // Pay to start: the purchase's own tracker says whether an ad brought the buyer.
    expect(funnel(p, "full").ads).toMatchObject({ visits: 20, paid: 1, finished: 1 });
    expect(funnel(p, "pre").ads).toMatchObject({
      visits: 50,
      paid: 1,
      finished: 0,
      revenue: 1.99,
    });
  });

  it("shows the gate off while it is switched off and met nobody", () => {
    const gate = funnel(week(), "gate");
    expect(gate.label).toBe("€1.99 after the survey");
    expect(gate.live).toBe(false);
    expect(gate.all.finished).toBe(0);
    expect(week().weeks[0]!.funnels.gate).toEqual({ cac: null, cvr: null, roas: null });
  });

  it("never counts staff, test buys, EUR 0, refunds or our own checks as paying customers", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ id: 1 }),
          ent({ id: 2, customer_email: "ec@loveiq.org" }),
          ent({ id: 3, is_test: true }),
          ent({ id: 4, amount_cents: 0 }),
          ent({ id: 5, status: "refunded" }),
          // June's prepaid rows carry no offer: not this journey.
          ent({ id: 6, offer: null }),
          ent({ id: 7, utm_tracker: JSON.stringify({ utm_source: "prod-verification" }) }),
        ],
      })
    );
    const full = funnel(p, "full");
    expect(full.all).toMatchObject({ paid: 1, revenue: 29.99 });
    // Their checkouts: 1, 4 and 5; staff, tests, June's rows and our checks are no one's.
    expect(step(p, "full", "Checkout started")).toBe(3);
  });

  it("leaves our own checks out of the free survey's visits, starts and finishers", () => {
    const p = buildPayToStart(
      input({
        facts: {
          visits: [visit("2026-10-20", 50), visit("2026-10-20", 5, "prod-verification")],
          starts: [
            start("2026-10-20", 10),
            start("2026-10-20", 2, { src: "verify", med: null, ads: false }),
            // A start no tracker names is never taken for a check.
            start("2026-10-20", 4, { known: false, src: null, med: null, ads: false }),
          ],
          subs: [
            sub({ id: 1, day: "2026-10-20" }),
            sub({ id: 2, day: "2026-10-20", src: "prod-e2e-check", med: null, ads: false }),
          ],
        },
        ptsVisits: [
          { day: "2026-10-20", offer: "full", src: null, n: 7 },
          { day: "2026-10-20", offer: "full", src: "prod-verification", n: 2 },
        ],
      })
    );
    expect(funnel(p, "after").all).toMatchObject({ visits: 50, finished: 1 });
    expect(step(p, "after", "Survey started")).toBe(14);
    expect(funnel(p, "full").all.visits).toBe(7);
  });

  it("splits the free landing with the EUR 1.99 page by the days it was on", () => {
    const at = (day: string, h = 10) => `${day}T${String(h).padStart(2, "0")}:00:00Z`;
    const later = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
    const subs = [
      sub({ id: 1, day: "2026-10-20", at: at("2026-10-20") }),
      sub({ id: 2, day: "2026-10-20", at: at("2026-10-20", 11) }),
      // Stamped days after the survey: the old-user campaign's, still pay after the report.
      sub({ id: 6, day: "2026-10-20", at: at("2026-10-20", 12) }),
      // The 21st: switched on after the first survey of the day.
      sub({ id: 10, day: "2026-10-21", at: at("2026-10-21", 6) }),
      sub({
        id: 3,
        day: "2026-10-21",
        at: at("2026-10-21", 9),
        paidAt: at("2026-10-21", 10),
        sales: 1,
        revenue: 1.99,
        pays: [[1, 1.99, "initial"]],
        plan: "initial",
        visits: 1,
      }),
      sub({
        id: 4,
        day: "2026-10-21",
        at: at("2026-10-21", 10),
        paidAt: at("2026-10-21", 11),
        sales: 2,
        revenue: 21.98,
        pays: [
          [1, 1.99, "initial"],
          [2, 19.99, "full_report"],
        ],
        plan: "initial",
        full: true,
        visits: 2,
      }),
      sub({ id: 7, day: "2026-10-21", at: at("2026-10-21", 11), visits: 0 }),
      sub({ id: 8, day: "2026-10-22", at: at("2026-10-22"), visits: 0 }),
      sub({ id: 9, day: "2026-10-22", at: at("2026-10-22", 11), visits: 0 }),
    ];
    const member = (id: number, seen: boolean, gapMs = 5_000) => {
      const s = subs.find((x) => x.id === id)!;
      return {
        sid: id,
        cohortAt: later(s.at, gapMs),
        seenAt: seen ? later(s.at, 60_000) : null,
      };
    };
    const p = buildPayToStart(
      input({
        facts: {
          visits: [
            visit("2026-10-20", 100),
            visit("2026-10-21", 80),
            visit("2026-10-22", 60),
            visit("2026-10-23", 40),
          ],
          starts: [start("2026-10-20", 10), start("2026-10-21", 8), start("2026-10-22", 6)],
          subs,
        },
        gateMembers: [
          member(3, true),
          member(4, true),
          member(7, true),
          member(8, true),
          member(9, false),
          member(6, true, 3 * 86_400_000),
        ],
        ads: {
          ok: true,
          value: [
            ad(FREE_PAGE, "2026-10-20", 20, 40),
            ad(FREE_PAGE, "2026-10-21", 16, 32),
            ad(FREE_PAGE, "2026-10-22", 12, 24),
            ad(FREE_PAGE, "2026-10-23", 8, 16),
          ],
        },
      })
    );
    const gate = funnel(p, "gate");
    const after = funnel(p, "after");
    // On without the switch read as on: it met people in the range.
    expect(gate.live).toBe(true);
    // The 21st is 3 of 4 the gate's; the 22nd all; the 23rd (no survey) stays as the 22nd.
    expect(gate.all.visits).toBe(80 * 0.75 + 60 + 40);
    expect(after.all.visits).toBe(100 + 80 * 0.25);
    expect(gate.spend).toBeCloseTo(16 * 0.75 + 12 + 8);
    expect(after.spend).toBeCloseTo(20 + 16 * 0.25);
    expect(gate.clicks).toBe(32 * 0.75 + 24 + 16);
    expect(after.clicks).toBe(40 + 32 * 0.25);
    expect(gate.steps.map((s) => [s.label, s.n, s.pays])).toEqual([
      ["Visits", 160, false],
      ["Survey started", 8 * 0.75 + 6, false],
      ["Survey finished", 5, false],
      ["Saw the €1.99 page", 4, false],
      ["Paid €1.99", 2, true],
      ["Report opened", 2, false],
      ["Bought the full report", 1, true],
    ]);
    expect(gate.all).toMatchObject({ finished: 5, paid: 2, revenue: 23.97 });
    // 1, 2, 6 (the campaign's stamp) and 10 (before the switch).
    expect(after.all.finished).toBe(4);
    expect(p.notes.some((n) => n.includes("on for part of a day"))).toBe(true);
  });

  it("counts each week's customers in the week they came in", () => {
    const p = buildPayToStart(
      input({
        from: "2026-10-12",
        to: "2026-10-22",
        facts: {
          visits: [visit("2026-10-13", 500), visit("2026-10-20", 500)],
          starts: [],
          // Finished in the first week, paid in the second: the first week's customer.
          subs: [
            sub({
              id: 1,
              day: "2026-10-13",
              at: "2026-10-13T10:00:00Z",
              paidAt: "2026-10-20T10:00:00Z",
              sales: 1,
              revenue: 29.99,
            }),
          ],
        },
        ads: {
          ok: true,
          value: [
            ad(FREE_PAGE, "2026-10-13", 50, 100),
            ad(FREE_PAGE, "2026-10-20", 50, 100),
            ad(FULL_PAGE, "2026-10-21", 30, 20),
          ],
        },
        ptsVisits: [{ day: "2026-10-21", offer: "full", src: null, n: 10 }],
        entitlements: [
          ent({ paid_at: "2026-10-21T10:00:00Z", created_at: "2026-10-21T09:59:00Z" }),
        ],
      })
    );
    expect(p.weeks.map((w) => [w.from, w.to, w.label])).toEqual([
      ["2026-10-12", "2026-10-18", "12 Oct"],
      ["2026-10-19", "2026-10-22", "19 Oct"],
    ]);
    // A range starting mid-week names its first week by its first day, not the Monday before.
    expect(buildPayToStart(input({ from: "2026-10-01", to: "2026-10-06" })).weeks[0]).toMatchObject(
      { from: "2026-10-01", to: "2026-10-04", label: "1 Oct" }
    );
    const [w1, w2] = p.weeks;
    expect(w1!.funnels.after.cac).toBeCloseTo(50);
    expect(w1!.funnels.after.cvr).toBeCloseTo(1 / 500);
    expect(w1!.funnels.after.roas).toBeCloseTo(29.99 / 50);
    // No customer came in that week: no cost per customer, nothing back.
    expect(w2!.funnels.after).toEqual({ cac: null, cvr: 0, roas: 0 });
    expect(w2!.funnels.full.cac).toBeCloseTo(30);
    expect(w2!.funnels.full.cvr).toBeCloseTo(0.1);
    // No ad and no visit for the full offer in the first week: nothing to divide.
    expect(w1!.funnels.full).toEqual({ cac: null, cvr: null, roas: null });
  });

  it("never prints a cost it cannot read: no ads, no spend, and says why", () => {
    const p = buildPayToStart(
      input({
        entitlements: [ent({ id: 1 })],
        ads: { ok: false, error: "Google Ads could not be read just now." },
        ptsVisits: null,
      })
    );
    const full = funnel(p, "full");
    expect(full.spend).toBeNull();
    expect(full.clicks).toBeNull();
    expect(full.all.m).toMatchObject({ cpc: null, cac: null, roas: null, net: null, cvr: null });
    expect(full.ads.visits).toBeNull();
    expect(full.all.paid).toBe(1);
    expect(full.all.visits).toBeNull();
    expect(p.notes).toContain("Google Ads could not be read just now.");
    expect(p.notes).toContain("Pay to start's visits could not be read just now.");
  });

  it("says when no ad lands on a pay-to-start page, and when its visits can't be told apart", () => {
    const p = buildPayToStart(
      input({
        ads: { ok: true, value: [ad(FREE_PAGE, "2026-10-20", 10, 5)] },
        ptsVisits: [
          { day: "2026-10-20", offer: null, src: null, n: 4 },
          { day: "2026-10-21", offer: "pre", src: null, n: 3 },
        ],
        today: "2026-10-25",
      })
    );
    expect(funnel(p, "full").spend).toBe(0);
    expect(funnel(p, "full").all.m.cpc).toBeNull();
    // Recorded before the pages were counted apart: in neither offer.
    expect(funnel(p, "full").all.visits).toBe(0);
    expect(funnel(p, "pre").all.visits).toBe(3);
    expect(p.notes).toContain("No ad in this range lands on a pay-to-start page yet.");
    expect(p.notes.find((n) => n.startsWith("4 visits"))).toBeDefined();
    expect(p.notes).toContain(
      "Today is still running: its figures are so far, and the ads lag a few hours."
    );
  });
});

describe("measuresOf", () => {
  it("blanks a cost and ROAS without ad spend, and a rate without its divisor", () => {
    const m = measuresOf(0, 0, { visits: null, finished: 2, paid: 1, revenue: 29.99 });
    expect(m).toMatchObject({
      cpc: null,
      cac: null,
      cpf: null,
      roas: null,
      cvr: null,
      rpv: null,
      finishRate: null,
      clickCvr: null,
    });
    // Nor a return on ad spend: no ad ran.
    expect(m.net).toBeNull();
    expect(measuresOf(10, 4, { visits: 4, finished: 1, paid: 1, revenue: 1.99 }).net).toBe(-8.01);
    expect(m.rpf).toBeCloseTo(14.995);
  });
});

describe("gateShares", () => {
  const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"];
  it("keeps the day before's share over a day without a survey, the first one before it", () => {
    const s = gateShares(
      days,
      [
        { id: 1, day: "2026-10-20" },
        { id: 2, day: "2026-10-20" },
        { id: 3, day: "2026-10-22" },
      ],
      new Set([2, 3]),
      false
    );
    expect([...s.values()]).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it("reads a range with no survey at all by the switch as it is now", () => {
    expect([...gateShares(days, [], new Set(), true).values()]).toEqual([1, 1, 1, 1]);
    expect([...gateShares(days, [], new Set(), false).values()]).toEqual([0, 0, 0, 0]);
  });
});

describe("taggedOf", () => {
  it("reads a purchase's tracker as the facts read a survey's", () => {
    expect(taggedOf(GCLID)).toMatchObject({ src: "google", med: "cpc", ads: true });
    expect(taggedOf(JSON.stringify({ gbraid: "x" })).ads).toBe(true);
    expect(taggedOf(JSON.stringify({ fbclid: "x", referrer_host: "m.facebook.com" }))).toEqual({
      src: null,
      med: null,
      ads: false,
      ref: "m.facebook.com",
      fb: true,
    });
    expect(taggedOf("not json")).toEqual({
      src: null,
      med: null,
      ads: false,
      ref: null,
      fb: false,
    });
    expect(taggedOf(null).ads).toBe(false);
  });
});
