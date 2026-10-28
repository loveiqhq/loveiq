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
  ourClaims: new Set(),
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
const NO_NOTICES = { refunded: new Set<string>(), disputed: new Set<string>() };

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
  const week = (over: Partial<PtsInput> = {}) =>
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
        ...over,
      })
    );

  it("counts refunds among those who paid, and pay to start's paying buyers who then finished", () => {
    // Refunds not read: no refund rate, never 0%.
    expect(funnel(week(), "after").refunds).toBeUndefined();
    expect(funnel(week(), "full").refunds).toBeUndefined();
    // 3 took the free survey and was refunded in full (no sale left); 502 (€1.99) in part.
    const p = week({ refundedSubs: new Set([3, 502]), refundNotices: NO_NOTICES });
    expect(funnel(p, "after").refunds).toEqual({ payers: 2, refunded: 1 });
    expect(funnel(p, "full").refunds).toEqual({ payers: 1, refunded: 0 });
    expect(funnel(p, "pre").refunds).toEqual({ payers: 2, refunded: 1 });
    expect(funnel(p, "full").paidFinished).toBe(1);
    // 4 paid and hasn't finished the survey yet.
    expect(funnel(p, "pre").paidFinished).toBe(1);
  });

  it("finishes only the paying buyers: a 100% code's and a refunded one's surveys aren't theirs", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ id: 1, consumed_submission_id: 601 }),
          ent({ id: 2, amount_cents: 0, consumed_submission_id: 602 }),
          ent({ id: 3, status: "refunded", consumed_submission_id: 603 }),
        ],
        boughtFirst: new Set([601, 602, 603]),
        refundedSubs: new Set([603]),
        refundNotices: NO_NOTICES,
      })
    );
    const full = funnel(p, "full");
    expect(full.steps.find((s) => s.label === "Paid €29.99")!.n).toBe(1);
    expect(full.steps.find((s) => s.label === "Survey finished")!.n).toBe(3);
    expect(full.paidFinished).toBe(1);
    // The 100% code took no money: not among those who paid. The refunded buyer is.
    expect(full.refunds).toEqual({ payers: 2, refunded: 1 });
  });

  it("leaves a chargeback out of pay to start's refund rate, as the free funnels do; a part refund before the survey counts", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ id: 1, consumed_submission_id: 701, stripe_payment_intent_id: "pi_1" }),
          // A chargeback, open or lost, voids the purchase as a full refund would.
          ent({ id: 2, status: "refunded", stripe_payment_intent_id: "pi_2" }),
          // A chargeback won back: paid again.
          ent({ id: 3, stripe_payment_intent_id: "pi_3" }),
          // Refunded in part before a survey claimed it: still paid, on no payment row.
          ent({ id: 4, stripe_payment_intent_id: "pi_4" }),
          // Refunded in full before its survey.
          ent({ id: 5, status: "refunded", stripe_payment_intent_id: "pi_5" }),
        ],
        boughtFirst: new Set([701]),
        refundedSubs: new Set(),
        refundNotices: {
          refunded: new Set(["pi_4", "pi_5"]),
          disputed: new Set(["pi_2", "pi_3"]),
        },
      })
    );
    expect(funnel(p, "full").refunds).toEqual({ payers: 4, refunded: 2 });
    // Stripe's notices not read: no rate, rather than one that takes a chargeback for a refund.
    expect(
      funnel(
        buildPayToStart(input({ entitlements: [ent({ id: 1 })], refundedSubs: new Set() })),
        "full"
      ).refunds
    ).toBeUndefined();
  });

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
    const member = (
      id: number,
      seen: boolean,
      gapMs = 5_000,
      taps?: { card: boolean; bar: boolean; notReady: boolean; exit?: boolean }
    ) => {
      const s = subs.find((x) => x.id === id)!;
      return {
        sid: id,
        cohortAt: later(s.at, gapMs),
        seenAt: seen ? later(s.at, 60_000) : null,
        ...(taps && { taps }),
      };
    };
    const tap = (card: boolean, bar: boolean, notReady = false, exit = false) => ({
      card,
      bar,
      notReady,
      exit,
    });
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
          // The page's buttons and its way out: 3 pressed the card, 4 both, 8 the bar and
          // didn't pay, 7 pressed "Not ready to unlock yet" and then Unlock on its exit page.
          member(3, true, 5_000, tap(true, false)),
          member(4, true, 5_000, tap(true, true)),
          member(7, true, 5_000, tap(false, false, true, true)),
          member(8, true, 5_000, tap(false, true)),
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
      ["Pressed Unlock", 4, false],
      ["Paid €1.99", 2, true],
      ["Report opened", 2, false],
      ["Bought the full report", 1, true],
    ]);
    expect(gate.steps.find((s) => s.label === "Saw the €1.99 page")?.detail).toBe(
      "1 pressed “Not ready to unlock yet”"
    );
    expect(gate.steps.find((s) => s.label === "Pressed Unlock")?.detail).toBe(
      "on the card 2 · on the bar 2 · on the exit page 1"
    );
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
    const early = buildPayToStart(input({ from: "2026-10-01", to: "2026-10-06" }));
    expect(early.weeks[0]).toMatchObject({ from: "2026-10-01", to: "2026-10-04", label: "1 Oct" });
    // Its pages went live on 22 Oct: a range ending before reads them off, never 0 visitors.
    const live = (x: ReturnType<typeof buildPayToStart>) =>
      Object.fromEntries(x.funnels.map((f) => [f.key, f.live]));
    expect(live(early)).toMatchObject({ full: false, pre: false, after: true });
    expect(live(p)).toMatchObject({ full: true, pre: true });
    // The visit log is whole from 15 Jun 2026: the free survey's visits before are blank.
    const june = buildPayToStart(input({ from: "2026-06-01", to: "2026-06-30" }));
    const after = june.funnels.find((f) => f.key === "after")!;
    expect(after.all.visits).toBeNull();
    expect(after.steps[0]).toMatchObject({ label: "Visits", n: null });
    expect(june.notes.join(" ")).toMatch(/every visitor from 15 Jun 2026/);
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

describe("buildPayToStart, the edges", () => {
  it("keeps a refunded buyer who kept an upgrade as a customer, with the upgrade's money only", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({
            id: 1,
            offer: "pre",
            status: "refunded",
            amount_cents: 199,
            consumed_submission_id: 900,
          }),
          ent({ id: 2, offer: "pre", status: "refunded", amount_cents: 199 }),
        ],
        laterPays: new Map([[900, [{ amount: 19.99, plan: "full_report" }]]]),
      })
    );
    const pre = funnel(p, "pre");
    // Both paid first; one kept the full report, the other has nothing left.
    expect(pre.all).toMatchObject({ paid: 1, revenue: 19.99, finished: 1 });
    // Neither EUR 1.99 stands.
    expect(step(p, "pre", "Paid €1.99")).toBe(0);
    expect(step(p, "pre", "Bought the full report")).toBe(1);
  });

  it("counts a checkout reopened and paid in the range, though its row is older", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ created_at: "2026-10-10T10:00:00Z", paid_at: "2026-10-20T10:00:00Z" }),
        ],
      })
    );
    expect(step(p, "full", "Checkout started")).toBe(1);
    expect(step(p, "full", "Paid €29.99")).toBe(1);
  });

  it("reads an ad click → paying customer as the ads' own customers, in both views", () => {
    const p = buildPayToStart(
      input({
        facts: {
          visits: [visit("2026-10-20", 100)],
          starts: [],
          subs: [
            sub({ id: 1, day: "2026-10-20", paidAt: "2026-10-20T11:00:00Z", sales: 1, revenue: 9 }),
            // Organic: never an ad click's customer.
            sub({
              id: 2,
              day: "2026-10-20",
              src: null,
              med: null,
              ads: false,
              paidAt: "2026-10-20T11:00:00Z",
              sales: 1,
              revenue: 9,
            }),
          ],
        },
        ads: { ok: true, value: [ad(FREE_PAGE, "2026-10-20", 10, 4)] },
      })
    );
    const after = funnel(p, "after");
    expect(after.all.paid).toBe(2);
    expect(after.all.m.clickCvr).toBeCloseTo(1 / 4);
    expect(after.ads.m.clickCvr).toBeCloseTo(1 / 4);
  });

  it("leaves an offer's rates per visit blank when it sold on a day its visits can't be counted", () => {
    const p = buildPayToStart(
      input({
        from: "2026-10-19",
        to: "2026-10-25",
        ptsVisits: [
          // The 23rd: before the pages were counted apart.
          { day: "2026-10-23", offer: null, src: null, n: 6 },
          { day: "2026-10-24", offer: "full", src: null, n: 50 },
          { day: "2026-10-24", offer: "pre", src: null, n: 40 },
        ],
        entitlements: [
          ent({ id: 1, created_at: "2026-10-23T10:00:00Z", paid_at: "2026-10-23T10:05:00Z" }),
          ent({
            id: 2,
            offer: "pre",
            amount_cents: 199,
            created_at: "2026-10-24T10:00:00Z",
            paid_at: "2026-10-24T10:05:00Z",
          }),
        ],
      })
    );
    const full = funnel(p, "full");
    expect(full.all.visits).toBeNull();
    expect(full.all.m).toMatchObject({ cvr: null, rpv: null, finishRate: null });
    expect(full.all.paid).toBe(1);
    // The EUR 1.99 offer sold only on a counted day: its rates stand.
    expect(funnel(p, "pre").all.visits).toBe(40);
    expect(funnel(p, "pre").all.m.cvr).toBeCloseTo(1 / 40);
    expect(p.notes).toContain(
      "Pay to start · €29.99 sold on a day its visits can't be told apart from the other page's, so its rates per visit are left blank for this range."
    );
    expect(p.weeks[0]!.funnels.full.cvr).toBeNull();
  });
});

describe("buildPayToStart, round two", () => {
  it("keeps a 100% code's buyer in pay to start, with what they buy later as its money", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({
            offer: "pre",
            amount_cents: 0,
            list_price_cents: 199,
            consumed_submission_id: 900,
          }),
        ],
        laterPays: new Map([[900, [{ amount: 29.99, plan: "full_report" }]]]),
      })
    );
    const pre = funnel(p, "pre");
    expect(pre.all).toMatchObject({ finished: 1, paid: 1, revenue: 29.99 });
    // Its EUR 0 is no sale.
    expect(step(p, "pre", "Paid €1.99")).toBe(0);
    expect(step(p, "pre", "Bought the full report")).toBe(1);
  });

  it("reads revenue per survey completion from the finishers' money only", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ id: 1, consumed_submission_id: 901 }),
          ent({ id: 2, consumed_submission_id: 902 }),
          // Paid, survey not taken yet: no completion's money.
          ent({ id: 3 }),
          ent({ id: 4 }),
        ],
      })
    );
    const full = funnel(p, "full");
    expect(full.all).toMatchObject({ finished: 2, revenue: 119.96, revenueFinished: 59.98 });
    expect(full.all.m.rpf).toBeCloseTo(29.99);
  });

  it("blanks an offer's rates only for a sale on such a day, never for a EUR 0 one", () => {
    const p = buildPayToStart(
      input({
        ptsVisits: [
          { day: "2026-10-23", offer: null, src: null, n: 4 },
          { day: "2026-10-24", offer: "full", src: null, n: 20 },
        ],
        entitlements: [
          ent({
            amount_cents: 0,
            created_at: "2026-10-23T09:00:00Z",
            paid_at: "2026-10-23T09:01:00Z",
          }),
        ],
      })
    );
    expect(funnel(p, "full").all.visits).toBe(20);
  });

  it("says pay after the report's last days still grow when the range ends near today", () => {
    const note = (today: string) =>
      buildPayToStart(input({ to: "2026-10-25", today })).notes.some((n) =>
        n.startsWith("Pay after the report is paid after the survey")
      );
    expect(note("2026-10-29")).toBe(true);
    expect(note("2026-10-30")).toBe(false);
  });
});

describe("buildPayToStart, round three", () => {
  it("leaves out a purchase whose survey was staff's or our own check, whatever address paid", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ id: 1, consumed_submission_id: 901 }),
          ent({ id: 2, consumed_submission_id: 902 }),
        ],
        ourClaims: new Set([902]),
      })
    );
    expect(funnel(p, "full").all).toMatchObject({ paid: 1, finished: 1, revenue: 29.99 });
    expect(step(p, "full", "Checkout started")).toBe(1);
  });

  it("counts a checkout only when it started or was paid in the range", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({
            id: 1,
            status: "expired",
            amount_cents: null,
            created_at: "2026-10-10T10:00:00Z",
            paid_at: null,
          }),
          ent({ id: 2, created_at: "2026-10-10T10:00:00Z", paid_at: "2026-10-12T10:00:00Z" }),
        ],
      })
    );
    expect(step(p, "full", "Checkout started")).toBe(0);
  });

  it("counts a report opened only when it was, and a full report only as one", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ id: 1, offer: "pre", amount_cents: 199, consumed_submission_id: 901 }),
          ent({ id: 2, offer: "pre", amount_cents: 199, consumed_submission_id: 902 }),
        ],
        openedSubmissions: new Set([901]),
        laterPays: new Map([
          [901, [{ amount: 19.99, plan: "full_report" }]],
          // Not a full report: no "Bought the full report", though it is money.
          [902, [{ amount: 4.99, plan: "essentials" }]],
        ]),
      })
    );
    expect(step(p, "pre", "Survey finished")).toBe(2);
    expect(step(p, "pre", "Report opened")).toBe(1);
    expect(step(p, "pre", "Bought the full report")).toBe(1);
    expect(funnel(p, "pre").all.revenue).toBeCloseTo(1.99 * 2 + 19.99 + 4.99);
  });

  it("never takes our own check's visit for a missing visitor", () => {
    const p = buildPayToStart(
      input({
        ptsVisits: [
          { day: "2026-10-20", offer: null, src: "prod-verification", n: 1 },
          { day: "2026-10-20", offer: "full", src: null, n: 10 },
        ],
        entitlements: [ent({ id: 1 })],
      })
    );
    expect(funnel(p, "full").all.visits).toBe(10);
    expect(p.notes.some((n) => n.includes("counted apart"))).toBe(false);
  });

  it("blanks only the weeks and visits it must: our checks' visits never do", () => {
    const p = buildPayToStart(
      input({
        from: "2026-10-12",
        to: "2026-10-25",
        ptsVisits: [
          // A check of ours before the split, on the day of a sale: not a missing visitor.
          { day: "2026-10-14", offer: null, src: "prod-verification", n: 1 },
          { day: "2026-10-14", offer: "full", src: null, n: 10 },
          // A real one before the split, with a sale: the first week only.
          { day: "2026-10-16", offer: null, src: null, n: 3 },
          { day: "2026-10-21", offer: "full", src: null, n: 10 },
        ],
        entitlements: [
          ent({ id: 1, created_at: "2026-10-14T10:00:00Z", paid_at: "2026-10-14T10:01:00Z" }),
          ent({ id: 2, created_at: "2026-10-16T10:00:00Z", paid_at: "2026-10-16T10:01:00Z" }),
          ent({ id: 3, created_at: "2026-10-21T10:00:00Z", paid_at: "2026-10-21T10:01:00Z" }),
        ],
      })
    );
    expect(p.weeks[0]!.funnels.full.cvr).toBeNull();
    expect(p.weeks[1]!.funnels.full.cvr).toBeCloseTo(0.1);
    expect(funnel(p, "full").all.visits).toBeNull();
    expect(p.notes.find((n) => n.startsWith("3 visits"))).toBeDefined();
  });
});

describe("measuresOf", () => {
  it("blanks a cost and ROAS without ad spend, and a rate without its divisor", () => {
    const m = measuresOf(0, 0, {
      visits: null,
      finished: 2,
      paid: 1,
      revenue: 29.99,
      revenueFinished: 29.99,
    });
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
    expect(
      measuresOf(10, 4, { visits: 4, finished: 1, paid: 1, revenue: 1.99, revenueFinished: 0 }).net
    ).toBe(-8.01);
    expect(m.rpf).toBeCloseTo(14.995);
  });
});

describe("paying buyers who started the survey (Landing's Started survey)", () => {
  // A week around the stamp's first day (28 Oct 2026).
  const started = (entitlements: EntitlementRow[]) =>
    funnel(
      buildPayToStart(
        input({ entitlements, from: "2026-10-24", to: "2026-10-30", today: "2026-10-31" })
      ),
      "full"
    ).paidStarted;
  it("a saved answer stamped the purchase, or a finished survey claimed it", () => {
    expect(
      started([
        // Paid on 28 Oct: stamped, finished, and one that never started.
        ent({ id: 1, paid_at: "2026-10-28T09:00:00Z", survey_started_at: "2026-10-28T09:05:00Z" }),
        ent({ id: 2, paid_at: "2026-10-28T10:00:00Z", consumed_submission_id: 602 }),
        ent({ id: 3, paid_at: "2026-10-28T11:00:00Z" }),
        // A 100% code's buyer is no paying buyer.
        ent({
          id: 4,
          paid_at: "2026-10-28T12:00:00Z",
          amount_cents: 0,
          survey_started_at: "2026-10-28T12:01:00Z",
        }),
      ])
    ).toBe(2);
  });
  it("is blank while a paying buyer from before the stamp hasn't finished", () => {
    expect(started([ent({ id: 1, paid_at: "2026-10-25T09:00:00Z" })])).toBeNull();
    // Finished: started, whenever it was paid.
    expect(
      started([ent({ id: 1, paid_at: "2026-10-25T09:00:00Z", consumed_submission_id: 601 })])
    ).toBe(1);
  });
});

describe("profit (contribution), as the Traffic page counts it (Mark, 23 Oct)", () => {
  it("takes card fees per payment, each report's running cost and the ads off the revenue", () => {
    const m = measuresOf(10, 4, {
      visits: 100,
      finished: 2,
      paid: 1,
      revenue: 29.99,
      revenueFinished: 29.99,
      sales: 1,
    });
    // 29.99 − (2.9% of 29.99 + €0.25) − 2 × €0.05 − €10 = €18.77
    expect(m.profit).toBe(18.77);
    expect(m.ppc).toBeCloseTo(18.77);
    expect(m.ppf).toBeCloseTo(9.385);
    // No ad spend read: no profit, as no contribution on Traffic.
    expect(
      measuresOf(null, null, { visits: 1, finished: 1, paid: 1, revenue: 9, revenueFinished: 9 })
        .profit
    ).toBeNull();
    // Nobody paid or finished: nothing to divide by.
    const none = measuresOf(5, 1, {
      visits: 9,
      finished: 0,
      paid: 0,
      revenue: 0,
      revenueFinished: 0,
    });
    expect([none.profit, none.ppc, none.ppf]).toEqual([-5, null, null]);
  });

  it("works profit per completion out of the finishers' own money, as revenue per completion", () => {
    // Pay to start: 10 paid €29.99 first, 2 of them have finished the survey; €100 of ads.
    const m = measuresOf(100, 50, {
      visits: 500,
      finished: 2,
      paid: 10,
      revenue: 299.9,
      revenueFinished: 59.98,
      sales: 10,
      salesFinished: 2,
    });
    // 59.98 − (2.9% of 59.98 + 2 × €0.25) − 2 × €0.05 − €100 = −€42.36, over 2 completions.
    expect(m.ppf).toBeCloseTo(-21.18);
    expect(m.ppf!).toBeLessThan(m.rpf!);
    // Per paying customer, everyone's money: 299.90 − (8.70 + 2.50) − 0.10 − 100 = €188.60.
    expect(m.ppc).toBeCloseTo(18.86);
  });

  it("counts each payment for the fee: a purchase and every later buy", () => {
    const p = buildPayToStart(
      input({
        entitlements: [
          ent({ id: 1, offer: "pre", amount_cents: 199, consumed_submission_id: 701 }),
          ent({ id: 2, offer: "pre", amount_cents: 199 }),
          // A 100% code's purchase took no money: only its later buy is a payment.
          ent({ id: 3, offer: "pre", amount_cents: 0, consumed_submission_id: 703 }),
        ],
        boughtFirst: new Set([701, 703]),
        laterPays: new Map([
          [701, [{ amount: 19.99, plan: "full_report" }]],
          [703, [{ amount: 19.99, plan: "full_report" }]],
        ]),
      })
    );
    expect(funnel(p, "pre").all.sales).toBe(4);
    // The finishers' (701 and 703): their profit per completion pays only their fees.
    expect(funnel(p, "pre").all.salesFinished).toBe(3);
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
