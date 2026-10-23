/**
 * AP-Analytics, Assessment A · Pay to start: every funnel that sells the report, counted the
 * same way and side by side (Marcus's board "Funnel metrics compared", 23.10: "reduce clutter
 * & interpretations and focus on hard KPI that matter such as ROAS, Visit to paying CVR and
 * Revenue per visitor").
 *
 * - `after`  pay after the report: the free survey, its report, then a purchase.
 * - `full`   pay to start, the full report on /sexual-archetype: the payment, then the survey.
 * - `pre`    pay to start, the EUR 1.99 initial report on /sexual-archetype/initial.
 * - `gate`   EUR 1.99 after the survey (docs/runbooks/PRE_UNLOCK.md): the free survey, then the
 *            EUR 1.99 page instead of the report. Off until it is switched on.
 *
 * Each funnel's ads are those landing on its page (Google Ads' landing_page_view): the two
 * pay-to-start pages, and every other page for the free survey. `after` and `gate` share the
 * free landing, and the gate takes every survey submitted while it is on, so a day belongs to
 * the funnel its finished surveys went to; on the day the switch moves, the landing's visits,
 * ads and survey starts are split by the gate's share of that day's finished surveys.
 *
 * Counted alike for every funnel, among the people who came in during the range (finished the
 * free survey, or paid to start):
 * - Visits: unique visitors per day (funnel_event). The free survey's are every visit not
 *   labelled `pay_to_start`; pay to start's carry that label and their page's `offer`.
 * - Paying customers: those who kept a payment that took money (refunds and EUR 0 left out).
 * - Revenue: everything they paid on their report, upgrades included, refunds left out.
 * - A survey is pay to start's only when a paid purchase claimed it. A browser that opened a
 *   checkout and never paid (its row still gets bound to the survey) takes the free survey
 *   like anyone, and counts with the free funnels.
 * - Paid traffic only: the visits are the ad clicks, the people those whose survey (free) or
 *   purchase (pay to start) carries a Google Ads click (classifySource), as on the Traffic page.
 * Staff and test buys are left out, as on every AP page.
 */
import { googleAdsSearch } from "@shared/http/google-ads";
import { isStaffEmail } from "@shared/env/staff-email";
import logger from "@shared/observability/logger";
import { reportingDay } from "@shared/time/reporting-day";
import { isInitialUnlockGateEnabled } from "@features/report/server/initialGateState";

import { fetchAllRows } from "../supabase";
import { shortDate } from "./days";
import { FULL_PLANS, classifySource, preBuysOf, type Facts, type SubFact } from "./facts";
import { buckets, windowOf, type ApFilters } from "./filters";

export type PtsOffer = "full" | "pre";
export type FunnelKey = "after" | PtsOffer | "gate";

export interface EntitlementRow {
  id: number;
  offer: string | null;
  status: string;
  amount_cents: number | null;
  list_price_cents: number | null;
  is_test: boolean | null;
  customer_email: string | null;
  created_at: string;
  paid_at: string | null;
  consumed_submission_id: number | null;
  /** The page's attribution snapshot at checkout (utm tags, the Google Ads click id). */
  utm_tracker: string | null;
}

export interface AdsLanding {
  url: string;
  day: string;
  cost: number;
  clicks: number;
  impressions: number;
}

export type AdsLandingResult = { ok: true; value: AdsLanding[] } | { ok: false; error: string };

export interface GateMember {
  sid: number;
  cohortAt: string;
  seenAt: string | null;
}

/** A sale on a pay-to-start buyer's report after the purchase itself (an upgrade). */
export interface LaterPay {
  amount: number;
  plan: string | null;
}

export interface PtsRecords {
  entitlements: EntitlementRow[];
  /**
   * Pay to start's visits per Berlin day, page (offer null: recorded before 20261023150000) and
   * utm_source (to leave our own checks out); null when unreadable.
   */
  ptsVisits: Array<{ day: string; offer: string | null; src: string | null; n: number }> | null;
  /** Submissions a paid pay-to-start purchase claimed (charged, refunded or not): that journey's. */
  boughtFirst: ReadonlySet<number>;
  /** Pay-to-start buyers' survey starts per Berlin day: ap_facts counts them among its starts. */
  boughtFirstStarts: Readonly<Record<string, number>>;
  /** Pay-to-start buyers' submissions whose report was opened. */
  openedSubmissions: ReadonlySet<number>;
  /** Per pay-to-start buyer's submission: what they bought on the report after the purchase. */
  laterPays: ReadonlyMap<number, LaterPay[]>;
  /** Reports in the gate's cohort, stamped in the range. */
  gateMembers: GateMember[];
  /** The gate's switch as it is now. */
  gateOn: boolean;
}

export interface PtsInput extends PtsRecords {
  facts: Pick<Facts, "visits" | "starts" | "subs">;
  ads: AdsLandingResult;
  from: string;
  to: string;
  today: string;
  /** Each offer's price in cents, for the funnels' names. */
  prices: { full: number; pre: number; gate: number };
}

/** A funnel's counts in one traffic view: what its measures are worked out from. */
export interface PtsView {
  /** Unique visitors per day; in the paid view, the ad clicks. Null when unreadable. */
  visits: number | null;
  finished: number;
  paid: number;
  revenue: number;
}

/** The board's measures. Rates are 0..1; each is null when what it divides by is missing or 0. */
export interface PtsMeasures {
  cpc: number | null;
  /** Finished surveys ÷ visits. */
  finishRate: number | null;
  /** Paying customers ÷ visits (a core KPI). */
  cvr: number | null;
  clickCvr: number | null;
  /** Revenue ÷ visits (a core KPI). */
  rpv: number | null;
  /** Revenue ÷ finished surveys. */
  rpf: number | null;
  cac: number | null;
  /** Ad spend ÷ finished surveys. */
  cpf: number | null;
  /** Revenue ÷ ad spend (a core KPI). */
  roas: number | null;
  /** Revenue − ad spend. */
  net: number | null;
}

export interface PtsStep {
  label: string;
  n: number | null;
  /** A step that takes money. */
  pays: boolean;
}

export interface PtsFunnel {
  key: FunnelKey;
  label: string;
  /** False only for the gate while it is switched off and met nobody in the range. */
  live: boolean;
  /** Ad spend (EUR) and clicks on the funnel's pages; null when Google Ads is unreadable. */
  spend: number | null;
  clicks: number | null;
  all: PtsView & { m: PtsMeasures };
  ads: PtsView & { m: PtsMeasures };
  steps: PtsStep[];
}

export interface PtsWeek {
  /** Monday-to-Sunday, cut at the range's ends. */
  from: string;
  to: string;
  /** Its first day in the range ("20 Oct"): the Monday, unless the range starts later. */
  label: string;
  /** All traffic, by the week each customer came in. */
  funnels: Record<FunnelKey, { cac: number | null; cvr: number | null; roas: number | null }>;
}

export interface PtsPayload {
  range: { from: string; to: string };
  funnels: PtsFunnel[];
  weeks: PtsWeek[];
  notes: string[];
}

/** Which offer an ad's landing page sells, from its path; null for every other page. */
export function offerOfLanding(url: string): PtsOffer | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  // ValueTrack placeholders stay in an unexpanded URL ("/{ignore}" is live on our account),
  // percent-encoded: decode, drop them, then match the page.
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/\{[^}]*\}/g, "").replace(/\/+$/, "");
  if (path === "/sexual-archetype/initial") return "pre";
  if (path === "/sexual-archetype") return "full";
  return null;
}

const ratio = (a: number | null, b: number | null): number | null =>
  a !== null && b !== null && b > 0 ? a / b : null;
const cents = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string) => reportingDay(new Date(iso));
const euros = (priceCents: number) => `€${(priceCents / 100).toFixed(2)}`;

/**
 * The measures of one view. A cost per customer or survey, ROAS and the return on ad spend need
 * ad spend: with none they are blank, not EUR 0 (a funnel no ad sent anyone to did not get its
 * customers for free, nor earn its ads back).
 */
export function measuresOf(spend: number | null, clicks: number | null, v: PtsView): PtsMeasures {
  const paidFor = spend !== null && spend > 0 ? spend : null;
  return {
    cpc: ratio(spend, clicks),
    finishRate: ratio(v.finished, v.visits),
    cvr: ratio(v.paid, v.visits),
    clickCvr: ratio(v.paid, clicks),
    rpv: ratio(v.revenue, v.visits),
    rpf: ratio(v.revenue, v.finished),
    cac: ratio(paidFor, v.paid),
    cpf: ratio(paidFor, v.finished),
    roas: ratio(v.revenue, paidFor),
    net: paidFor === null ? null : cents(v.revenue - paidFor),
  };
}

/** A tracker's tags as ap_facts reads them from SQL, for classifySource. */
export function taggedOf(tracker: string | null): Parameters<typeof classifySource>[0] {
  let j: Record<string, unknown> = {};
  try {
    const v: unknown = tracker ? JSON.parse(tracker) : null;
    if (v && typeof v === "object" && !Array.isArray(v)) j = v as Record<string, unknown>;
  } catch {
    // Not JSON: no tags.
  }
  const s = (k: string) => (typeof j[k] === "string" && j[k] !== "" ? (j[k] as string) : null);
  return {
    src: s("utm_source"),
    med: s("utm_medium"),
    ads: Boolean(s("gclid") || s("gbraid") || s("wbraid")),
    ref: s("referrer_host"),
    fb: Boolean(s("fbclid")),
  };
}

/** Money was taken for it: charged, and refunded since or not. */
const isPaid = (e: EntitlementRow) =>
  (e.amount_cents ?? 0) > 0 &&
  e.paid_at !== null &&
  (e.status === "succeeded" || e.status === "refunded");

/** Our own probes and verification runs, never counted (classifySource "test"). */
const isOurTest = (t: Parameters<typeof classifySource>[0], known = true) =>
  known && classifySource(t) === "test";

/** A pay-to-start buyer's row: an offer, not a test, not one of us. */
function counts(e: EntitlementRow): e is EntitlementRow & { offer: PtsOffer } {
  return (
    (e.offer === "full" || e.offer === "pre") &&
    e.is_test !== true &&
    !isStaffEmail(e.customer_email) &&
    !isOurTest(taggedOf(e.utm_tracker))
  );
}

/**
 * A cohort stamp made by the survey's own submit, within the hour. The old-user campaign
 * stamps reports long after their survey (PRE_UNLOCK.md): those readers came in through
 * pay after the report, and stay in it.
 */
const STAMPED_AT_SUBMIT_MS = 60 * 60_000;

/**
 * The gate's share of each day's free landing: the share of that day's finished free surveys
 * in its cohort. A day without one keeps the day before's share (the switch stays as it was),
 * or the first one after; a range without any has the switch as it is now.
 */
export function gateShares(
  days: string[],
  free: Array<Pick<SubFact, "id" | "day">>,
  gate: ReadonlySet<number>,
  gateOn: boolean
): Map<string, number> {
  const per = new Map<string, { all: number; gate: number }>();
  for (const s of free) {
    const e = per.get(s.day) ?? { all: 0, gate: 0 };
    e.all += 1;
    if (gate.has(s.id)) e.gate += 1;
    per.set(s.day, e);
  }
  const known = days.map((d) => {
    const e = per.get(d);
    return e && e.all > 0 ? e.gate / e.all : null;
  });
  const firstKnown = known.find((k) => k !== null) ?? null;
  const out = new Map<string, number>();
  let last: number | null = null;
  days.forEach((d, i) => {
    last = known[i] ?? last;
    out.set(d, last ?? firstKnown ?? (gateOn ? 1 : 0));
  });
  return out;
}

function daysOf(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDay(d)) out.push(d);
  return out;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const sumBy = <T>(xs: T[], f: (x: T) => number) => xs.reduce((sum, x) => sum + f(x), 0);

export function buildPayToStart(input: PtsInput): PtsPayload {
  const { from, to } = input;
  const days = daysOf(from, to);
  const inRange = (iso: string | null) => {
    if (!iso) return false;
    const day = dayOf(iso);
    return day >= from && day <= to;
  };

  // Ads per page and day: the two pay-to-start pages, and the free survey's (every other).
  type Ads = { cost: number; clicks: number };
  const adsDay: Record<"free" | PtsOffer, Map<string, Ads>> = {
    free: new Map(),
    full: new Map(),
    pre: new Map(),
  };
  if (input.ads.ok) {
    for (const line of input.ads.value) {
      const m = adsDay[offerOfLanding(line.url) ?? "free"];
      const a = m.get(line.day) ?? { cost: 0, clicks: 0 };
      a.cost += line.cost;
      a.clicks += line.clicks;
      m.set(line.day, a);
    }
  }

  // The free survey's finishers, and which of them met the EUR 1.99 page.
  const free = input.facts.subs.filter((s) => !input.boughtFirst.has(s.id) && !isOurTest(s));
  const atOf = new Map(free.map((s) => [s.id, Date.parse(s.at)]));
  const gateIds = new Set(
    input.gateMembers
      .filter((g) => {
        const at = atOf.get(g.sid);
        const gap = at === undefined ? NaN : Date.parse(g.cohortAt) - at;
        return gap >= -60_000 && gap < STAMPED_AT_SUBMIT_MS;
      })
      .map((g) => g.sid)
  );
  const seenAt = new Map(input.gateMembers.map((g) => [g.sid, g.seenAt]));
  const subsOf: Record<"after" | "gate", SubFact[]> = {
    after: free.filter((s) => !gateIds.has(s.id)),
    gate: free.filter((s) => gateIds.has(s.id)),
  };
  const gateLive = input.gateOn || subsOf.gate.length > 0;
  const share = gateShares(days, free, gateIds, input.gateOn);
  const partOf = (part: "after" | "gate", day: string) => {
    const s = share.get(day) ?? 0;
    return part === "gate" ? s : 1 - s;
  };

  const perDay = <T>(rows: T[], day: (r: T) => string, n: (r: T) => number) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(day(r), (m.get(day(r)) ?? 0) + n(r));
    return m;
  };
  const freeVisits = perDay(
    input.facts.visits.filter((v) => !isOurTest({ src: v.src, med: null, ads: false })),
    (v) => v.day,
    (v) => v.n
  );
  const ptsStarts = input.boughtFirstStarts;
  const freeStarts = perDay(
    input.facts.starts.filter((s) => !isOurTest(s, s.known)),
    (s) => s.day,
    (s) => s.n
  );
  for (const [day, n] of freeStarts) freeStarts.set(day, Math.max(0, n - (ptsStarts[day] ?? 0)));

  /** A free-landing count over some days, the part of each day that went to `part`. */
  const freePart = (m: Map<string, number>, part: "after" | "gate", ds: string[] = days) =>
    sumBy(ds, (d) => (m.get(d) ?? 0) * partOf(part, d));
  const adsOf = (key: FunnelKey, ds: string[] = days): Ads | null => {
    if (!input.ads.ok) return null;
    const m = key === "after" || key === "gate" ? adsDay.free : adsDay[key];
    const w = (d: string) => (key === "after" || key === "gate" ? partOf(key, d) : 1);
    return {
      cost: cents(sumBy(ds, (d) => (m.get(d)?.cost ?? 0) * w(d))),
      clicks: Math.round(sumBy(ds, (d) => (m.get(d)?.clicks ?? 0) * w(d))),
    };
  };

  const isAd = (t: Parameters<typeof classifySource>[0]) => classifySource(t) === "google_ads";
  const paidSub = (s: SubFact) => s.paidAt !== null && s.sales > 0;

  // Pay to start's buyers: who paid in the range (refunded since or not), and what they kept
  // of it and of what they bought on the report after.
  const rows = input.entitlements.filter(counts);
  const bought = rows.filter((e) => isPaid(e) && inRange(e.paid_at));
  const later = (e: EntitlementRow) =>
    e.consumed_submission_id === null ? [] : (input.laterPays.get(e.consumed_submission_id) ?? []);
  const kept = (e: EntitlementRow) => e.status === "succeeded";
  const moneyOf = (e: EntitlementRow) =>
    (kept(e) ? (e.amount_cents ?? 0) / 100 : 0) + sumBy(later(e), (p) => p.amount);
  const customers = (xs: EntitlementRow[]) => xs.filter((e) => moneyOf(e) > 0);
  // Days with pay-to-start visits recorded before the two pages were counted apart: an offer
  // that sold on one of them has visits missing for its own buyers, so no rate per visit.
  const unsplitDays = new Set(
    (input.ptsVisits ?? [])
      .filter(
        (v) =>
          v.offer !== "full" &&
          v.offer !== "pre" &&
          !isOurTest({ src: v.src, med: null, ads: false })
      )
      .map((v) => v.day)
  );
  const soldUnsplit = (offer: PtsOffer, ds: string[] = days) =>
    bought.some(
      (e) =>
        e.offer === offer &&
        unsplitDays.has(dayOf(e.paid_at as string)) &&
        ds.includes(dayOf(e.paid_at as string))
    );
  const ptsVisitsOf = (offer: PtsOffer, ds: string[] = days): number | null => {
    if (!input.ptsVisits || soldUnsplit(offer, ds)) return null;
    const set = new Set(ds);
    return sumBy(
      input.ptsVisits.filter(
        (v) =>
          v.offer === offer && set.has(v.day) && !isOurTest({ src: v.src, med: null, ads: false })
      ),
      (v) => v.n
    );
  };

  const view = (visits: number | null, finished: number, paid: number, revenue: number) => ({
    visits,
    finished,
    paid,
    revenue: cents(revenue),
  });
  const withMeasures = (a: Ads | null, v: PtsView) => ({
    ...v,
    m: measuresOf(a ? a.cost : null, a ? a.clicks : null, v),
  });
  /** Both views. An ad click → paying customer is the ad's customers per click in each. */
  const views = (a: Ads | null, all: PtsView, paid: PtsView) => {
    const ads = withMeasures(a, paid);
    const both = withMeasures(a, all);
    return { all: { ...both, m: { ...both.m, clickCvr: ads.m.clickCvr } }, ads };
  };

  const freeFunnel = (key: "after" | "gate"): PtsFunnel => {
    const subs = subsOf[key];
    const ads = adsOf(key);
    const adSubs = subs.filter(isAd);
    const visits = Math.round(freePart(freeVisits, key));
    const paid = subs.filter(paidSub);
    const all = view(
      visits,
      subs.length,
      paid.length,
      sumBy(subs, (s) => s.revenue)
    );
    const paidView = view(
      ads ? ads.clicks : null,
      adSubs.length,
      adSubs.filter(paidSub).length,
      sumBy(adSubs, (s) => s.revenue)
    );
    const started = Math.round(freePart(freeStarts, key));
    const steps: PtsStep[] =
      key === "after"
        ? [
            { label: "Visits", n: visits, pays: false },
            { label: "Survey started", n: started, pays: false },
            { label: "Survey finished", n: subs.length, pays: false },
            { label: "Report opened", n: subs.filter((s) => s.openedAt).length, pays: false },
            { label: "Checkout started", n: subs.filter((s) => s.checkoutAt).length, pays: false },
            { label: "Paid", n: paid.length, pays: true },
          ]
        : [
            { label: "Visits", n: visits, pays: false },
            { label: "Survey started", n: started, pays: false },
            { label: "Survey finished", n: subs.length, pays: false },
            {
              label: `Saw the ${euros(input.prices.gate)} page`,
              n: subs.filter((s) => seenAt.get(s.id)).length,
              pays: false,
            },
            {
              label: `Paid ${euros(input.prices.gate)}`,
              n: subs.filter((s) => preBuysOf(s).length > 0).length,
              pays: true,
            },
            // A view of the gate is no report session (PRE_UNLOCK.md): a session is the report.
            { label: "Report opened", n: subs.filter((s) => s.visits > 0).length, pays: false },
            { label: "Bought the full report", n: subs.filter((s) => s.full).length, pays: true },
          ];
    return {
      key,
      label:
        key === "after" ? "Pay after the report" : `${euros(input.prices.gate)} after the survey`,
      live: key === "after" || gateLive,
      spend: ads ? ads.cost : null,
      clicks: ads ? ads.clicks : null,
      ...views(ads, all, paidView),
      steps,
    };
  };

  const ptsFunnel = (offer: PtsOffer): PtsFunnel => {
    const ads = adsOf(offer);
    const mine = bought.filter((e) => e.offer === offer);
    const adBuyers = mine.filter((e) => isAd(taggedOf(e.utm_tracker)));
    const finished = (xs: EntitlementRow[]) => xs.filter((e) => e.consumed_submission_id !== null);
    const visits = ptsVisitsOf(offer);
    const all = view(visits, finished(mine).length, customers(mine).length, sumBy(mine, moneyOf));
    const paidView = view(
      ads ? ads.clicks : null,
      finished(adBuyers).length,
      customers(adBuyers).length,
      sumBy(adBuyers, moneyOf)
    );
    const price = euros(input.prices[offer]);
    const steps: PtsStep[] = [
      { label: "Visits", n: visits, pays: false },
      {
        // A checkout reopened later keeps its row's first day: one paid in the range started
        // its checkout by then too.
        label: "Checkout started",
        n: rows.filter((e) => e.offer === offer && (inRange(e.created_at) || inRange(e.paid_at)))
          .length,
        pays: false,
      },
      { label: `Paid ${price}`, n: mine.filter(kept).length, pays: true },
      { label: "Survey finished", n: finished(mine).length, pays: false },
      {
        label: "Report opened",
        n: finished(mine).filter((e) =>
          input.openedSubmissions.has(e.consumed_submission_id as number)
        ).length,
        pays: false,
      },
    ];
    if (offer === "pre") {
      steps.push({
        label: "Bought the full report",
        n: mine.filter((e) => later(e).some((p) => FULL_PLANS.has(p.plan ?? ""))).length,
        pays: true,
      });
    }
    return {
      key: offer,
      label: `Pay to start · ${price}`,
      live: true,
      spend: ads ? ads.cost : null,
      clicks: ads ? ads.clicks : null,
      ...views(ads, all, paidView),
      steps,
    };
  };

  const funnels = [freeFunnel("after"), ptsFunnel("full"), ptsFunnel("pre"), freeFunnel("gate")];

  // Week by week, all traffic, each customer in the week they came in.
  const weeks: PtsWeek[] = buckets(from, to, "week").map((b) => {
    const ds = days.filter((d) => d >= b.from && d <= b.to);
    const inWeek = (day: string) => day >= b.from && day <= b.to;
    const point = (spend: number | null, visits: number | null, paid: number, revenue: number) => {
      const paidFor = spend !== null && spend > 0 ? spend : null;
      return {
        cac: ratio(paidFor, paid),
        cvr: ratio(paid, visits),
        roas: ratio(revenue, paidFor),
      };
    };
    const freePoint = (key: "after" | "gate") => {
      const subs = subsOf[key].filter((s) => inWeek(s.day));
      const ads = adsOf(key, ds);
      return point(
        ads ? ads.cost : null,
        freePart(freeVisits, key, ds),
        subs.filter(paidSub).length,
        sumBy(subs, (s) => s.revenue)
      );
    };
    const ptsPoint = (offer: PtsOffer) => {
      const mine = bought.filter((e) => e.offer === offer && inWeek(dayOf(e.paid_at as string)));
      const ads = adsOf(offer, ds);
      return point(
        ads ? ads.cost : null,
        ptsVisitsOf(offer, ds),
        customers(mine).length,
        sumBy(mine, moneyOf)
      );
    };
    const none = { cac: null, cvr: null, roas: null };
    return {
      from: b.from,
      to: b.to,
      label: shortDate(b.from),
      funnels: {
        after: freePoint("after"),
        full: ptsPoint("full"),
        pre: ptsPoint("pre"),
        gate: gateLive ? freePoint("gate") : none,
      },
    };
  });

  const notes: string[] = [];
  if (!input.ads.ok) notes.push(input.ads.error);
  else if (adsDay.full.size + adsDay.pre.size === 0)
    notes.push("No ad in this range lands on a pay-to-start page yet.");
  if (input.ptsVisits === null) notes.push("Pay to start's visits could not be read just now.");
  else {
    const unsplit = sumBy(
      input.ptsVisits.filter(
        (v) =>
          v.offer !== "full" &&
          v.offer !== "pre" &&
          !isOurTest({ src: v.src, med: null, ads: false })
      ),
      (v) => v.n
    );
    if (unsplit > 0)
      notes.push(
        `${unsplit} ${unsplit === 1 ? "visit" : "visits"} to the pay-to-start pages came before the two pages were counted apart, so neither offer's visits include ${unsplit === 1 ? "it" : "them"}.`
      );
    for (const offer of ["full", "pre"] as const)
      if (soldUnsplit(offer))
        notes.push(
          `Pay to start · ${euros(input.prices[offer])} sold on a day its visits can't be told apart from the other page's, so its rates per visit are left blank for this range.`
        );
  }
  if (days.some((d) => (share.get(d) ?? 0) > 0 && (share.get(d) ?? 0) < 1))
    notes.push(
      `The ${euros(input.prices.gate)} page after the survey was on for part of a day here: that day's free-landing visits, ads and survey starts are split by its share of the day's finished surveys.`
    );
  if (to >= input.today)
    notes.push("Today is still running: its figures are so far, and the ads lag a few hours.");

  return { range: { from, to }, funnels, weeks, notes };
}

const UNREADABLE = "Google Ads could not be read just now.";

/** Cost, clicks and impressions per landing page and day over [from, to] (the account's days). */
export async function fetchAdsByLanding(
  from: string,
  to: string,
  oidcToken?: string | null
): Promise<AdsLandingResult> {
  try {
    const rows = await googleAdsSearch<{
      landingPageView?: { unexpandedFinalUrl?: string };
      segments?: { date?: string };
      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
    }>(
      "SELECT landing_page_view.unexpanded_final_url, segments.date, metrics.impressions, " +
        "metrics.clicks, metrics.cost_micros FROM landing_page_view " +
        `WHERE segments.date BETWEEN '${from}' AND '${to}'`,
      { oidcToken, timeoutMs: 15_000 }
    );
    if (!rows) return { ok: false, error: UNREADABLE };
    const num = (v: unknown) => {
      const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
      return Number.isFinite(n) ? n : 0;
    };
    return {
      ok: true,
      value: rows
        .map((r) => ({
          url: r.landingPageView?.unexpandedFinalUrl ?? "",
          day: r.segments?.date ?? "",
          cost: num(r.metrics?.costMicros) / 1_000_000,
          clicks: num(r.metrics?.clicks),
          impressions: num(r.metrics?.impressions),
        }))
        .filter((l) => l.url && l.day && (l.cost || l.clicks || l.impressions)),
    };
  } catch (err) {
    logger.warn({ err }, "AP pay to start: Google Ads read failed");
    return { ok: false, error: UNREADABLE };
  }
}

/** One query's rows, or the page stops: a part read as empty would read as zero. */
async function must<T>(path: string, what: string): Promise<T[]> {
  const rows = await fetchAllRows<T>(path);
  if (!rows) throw new Error(`${what} could not be read`);
  return rows;
}

/** Ids in chunks of 100, to keep the URLs short. */
function chunks<T>(xs: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

interface SubmissionRow {
  id: number;
  user_id: number | null;
  start_date_time: string | null;
  created_date_time: string;
  utm_tracker: string | null;
}

/** Everything the page reads from our database for [from, to], besides ap_facts. */
export async function fetchPayToStartRecords(
  filters: Pick<ApFilters, "from" | "to">
): Promise<PtsRecords> {
  const { since, until } = windowOf(filters);
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  const [entitlements, visitRows, cohort, gateOn] = await Promise.all([
    must<EntitlementRow>(
      "/rest/v1/prepaid_report_access?offer=not.is.null" +
        `&created_at=lt.${untilIso}` +
        "&select=id,offer,status,amount_cents,list_price_cents,is_test,customer_email,created_at,paid_at,consumed_submission_id,utm_tracker" +
        "&order=id.asc",
      "prepaid_report_access"
    ),
    fetchAllRows<{ day: string; offer: string | null; utm_source: string | null }>(
      "/rest/v1/funnel_event?event_type=eq.unique_visitor&landing_variant=eq.pay_to_start" +
        `&day=gte.${filters.from}&day=lte.${filters.to}` +
        "&select=day,offer,utm_source&order=day.asc,visitor_id.asc"
    ),
    must<{
      survey_submission_id: number;
      initial_gate_cohort_at: string;
      initial_gate_seen_at: string | null;
    }>(
      `/rest/v1/personal_report?initial_gate_cohort_at=gte.${sinceIso}` +
        `&initial_gate_cohort_at=lt.${new Date(until.getTime() + STAMPED_AT_SUBMIT_MS).toISOString()}` +
        "&select=survey_submission_id,initial_gate_cohort_at,initial_gate_seen_at&order=id.asc",
      "personal_report"
    ),
    isInitialUnlockGateEnabled(),
  ]);

  const visitCount = new Map<
    string,
    { day: string; offer: string | null; src: string | null; n: number }
  >();
  for (const r of visitRows ?? []) {
    const key = `${r.day}|${r.offer ?? ""}|${r.utm_source ?? ""}`;
    const v = visitCount.get(key) ?? {
      day: r.day,
      offer: r.offer ?? null,
      src: r.utm_source ?? null,
      n: 0,
    };
    v.n += 1;
    visitCount.set(key, v);
  }

  // Bought first: claimed by a purchase that was paid. A checkout left unpaid is bound to the
  // survey too (claim.ts binds a pending row), and its browser took the free survey like anyone.
  const claimedBy = new Map<number, EntitlementRow>();
  for (const e of entitlements)
    if (e.consumed_submission_id !== null && isPaid(e)) claimedBy.set(e.consumed_submission_id, e);
  const boughtFirst = new Set(claimedBy.keys());

  // Their survey starts, which ap_facts counts among the free survey's: a finished survey's
  // start, unless ap_facts left it out (a staff member's by app_user's address, our own checks).
  // ponytail: a buyer's unfinished start (no submission to tie it to the purchase) stays in.
  const claimedSubs: SubmissionRow[] = [];
  for (const ids of chunks([...boughtFirst])) {
    claimedSubs.push(
      ...(await must<SubmissionRow>(
        `/rest/v1/survey_submission?id=in.(${ids.join(",")})&status=eq.completed` +
          "&select=id,user_id,start_date_time,created_date_time,utm_tracker&order=id.asc",
        "survey_submission"
      ))
    );
  }
  const users = [
    ...new Set(claimedSubs.map((x) => x.user_id).filter((u): u is number => typeof u === "number")),
  ];
  const staff = new Set<number>();
  for (const ids of chunks(users)) {
    const people = await must<{ id: number; email: string | null }>(
      `/rest/v1/app_user?id=in.(${ids.join(",")})&select=id,email&order=id.asc`,
      "app_user"
    );
    for (const u of people) if (isStaffEmail(u.email)) staff.add(u.id);
  }
  const boughtFirstStarts: Record<string, number> = {};
  for (const x of claimedSubs) {
    // A day outside the range matches none of ap_facts' starts, so it takes nothing off.
    if ((x.user_id !== null && staff.has(x.user_id)) || isOurTest(taggedOf(x.utm_tracker)))
      continue;
    const day = reportingDay(new Date(x.start_date_time ?? x.created_date_time));
    boughtFirstStarts[day] = (boughtFirstStarts[day] ?? 0) + 1;
  }

  // Each buyer's report: opened, and what they bought on it after the purchase itself.
  const openedSubmissions = new Set<number>();
  const laterPays = new Map<number, LaterPay[]>();
  for (const subs of chunks([...claimedBy.keys()])) {
    const reports = await must<{ id: number; survey_submission_id: number }>(
      `/rest/v1/personal_report?survey_submission_id=in.(${subs.join(",")})` +
        "&select=id,survey_submission_id&order=id.asc",
      "personal_report"
    );
    const subOfReport = new Map(reports.map((r) => [r.id, r.survey_submission_id]));
    const ids = [...subOfReport.keys()];
    if (ids.length === 0) continue;
    const [sessionRows, payments] = await Promise.all([
      must<{ personal_report_id: number }>(
        `/rest/v1/report_session?personal_report_id=in.(${ids.join(",")})` +
          "&select=personal_report_id&order=personal_report_id.asc",
        "report_session"
      ),
      must<{
        personal_report_id: number;
        amount: number | string | null;
        plan: string | null;
        journey: string | null;
      }>(
        `/rest/v1/payment?is_test=is.false&status=eq.succeeded&amount=gt.0&personal_report_id=in.(${ids.join(",")})` +
          "&select=personal_report_id,amount,plan:metadata->>plan,journey:metadata->>journey&order=id.asc",
        "payment"
      ),
    ]);
    for (const s of sessionRows) {
      const sub = subOfReport.get(s.personal_report_id);
      if (sub !== undefined) openedSubmissions.add(sub);
    }
    for (const p of payments) {
      const sub = subOfReport.get(p.personal_report_id);
      const amount = Number(p.amount ?? 0);
      // The purchase itself is written on the report at the claim, labelled with the journey.
      if (sub === undefined || p.journey || !Number.isFinite(amount) || amount <= 0) continue;
      laterPays.set(sub, [...(laterPays.get(sub) ?? []), { amount, plan: p.plan }]);
    }
  }

  return {
    entitlements,
    ptsVisits: visitRows ? [...visitCount.values()] : null,
    boughtFirst,
    boughtFirstStarts,
    openedSubmissions,
    laterPays,
    gateMembers: cohort.map((c) => ({
      sid: c.survey_submission_id,
      cohortAt: c.initial_gate_cohort_at,
      seenAt: c.initial_gate_seen_at,
    })),
    gateOn,
  };
}
