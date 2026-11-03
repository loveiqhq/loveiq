/**
 * Assessment A · Payment (Marcus's artboard, synced 21 Oct 2026): who pays, how, at what price,
 * and what each pricing test did. Nine headline figures, the payment types, paid sales over time
 * by unlock type, checkout success and payment methods, who pays by segment, the pricing tests
 * and the personal price factors, and a price-elasticity model fitted to every whole month since
 * paid checkout began.
 *
 * Money is the payment ledger (succeeded, not a test, staff out), by payment day; "who pays" and
 * the payment CVR are cohort figures (the range's finishers and what they bought so far), with
 * each person counted once (the design's "each person counted once").
 */
import {
  getPricingBucketsForPlan,
  personalPriceFactors,
} from "@features/pricing/logic/reportPricing";
import { PRICE_TEST_START_AT } from "@features/checkout/server/reportPurchase";
import { PAY_TO_START_JOURNEY } from "@features/pay-to-start/logic/journey";
import { reportingDateTime, reportingDayStart } from "@shared/time/reporting-day";

import { addDays, shortDate } from "./days";
import {
  classifySource,
  deviceClass,
  FULL_PLANS,
  PAY_TO_START_FROM,
  PRE_ON_SALE_FROM,
  PRE_PLANS,
  preBuysOf,
  type Facts,
  type MoneyFact,
  type SubFact,
} from "./facts";
import {
  activeNarrowing,
  buckets,
  dayCount,
  grainOf,
  rangeLabel,
  SOURCES,
  SURVEY_TRACKING_FROM,
  TIERS,
  trendBuckets,
  type ApFilters,
  type Grain,
} from "./filters";
import { freePreBlocked, head, type PageHead, type Tile } from "./common";
import { assessmentScope } from "./assessment";
import {
  inScope,
  launched,
  PAYWALL_SEEN_FROM,
  peopleBlocked,
  QUOTED_FROM,
  ratio,
  reachedPaywall,
  salesIn,
  SOURCE_FROM,
  STEP_DEVICE_FROM,
  subsIn,
  VISITOR_FROM,
  type Scope,
} from "./metrics";
import { genderShort, relationshipShort } from "./traffic";
import { buildPaygateExits, type ExitEventRow, type PaygateExitsBlock } from "./paygate-exits";

export interface OverTimeRow {
  label: string;
  /** Its first and last day, for the chart's read-out. */
  from?: string;
  to?: string;
  /** Cut short by the range (a part of a week or month). */
  partial: boolean;
  preSales: number;
  preRevenue: number;
  fullSales: number;
  fullRevenue: number;
  /** All paid sales' revenue (a retired plan's too). */
  revenue: number;
  /** Reaches the day pre-unlocks went on sale (PRE_ON_SALE_FROM): before, none could be bought. */
  preOn?: boolean;
  /** Finished surveys, each one (the chart's dotted line, "Survey submissions"). */
  submissions: number;
  /** The people who finished, each once (the table's Finishers). */
  finishers: number;
  /** Of those people, how many paid (so far): the row's payment CVR, as the tile counts it. */
  payers: number;
}

/**
 * One way a reader pays (the design's "Payment types"). Not live: not on sale yet, every figure
 * null. Refunds are null when they weren't read or can't follow the filters.
 */
export interface PaymentTypeRow {
  key: string;
  name: string;
  /** The grey line under the name: its funnel, and whether it is live. */
  line: string;
  live: boolean;
  sales: number | null;
  revenue: number | null;
  /** The range's sales of this type refunded, in full or in part, whenever the refund came. */
  refunds: number | null;
  /** Of them, those refunded in full: they left the sales, so the refund rate counts them back. */
  fullRefunds: number | null;
}

export interface CheckoutPoint {
  label: string;
  /** Its first and last day, for the chart's read-out. */
  from?: string;
  to?: string;
  partial: boolean;
  reached: number;
  attempted: number;
  paid: number;
}

export interface MethodRow {
  key: string;
  name: string;
  /** "saved details" (Link) or "card". */
  kind: string;
  sales: number;
  revenue: number;
}

export interface SegmentRow {
  label: string;
  finishers: number;
  /** The segment's paid sales (so far), and their share of all of them. */
  sales: number;
  preCvr: number | null;
  preAvg: number | null;
  fullCvr: number | null;
  fullAvg: number | null;
  revenue: number;
  /** The counts behind the rates, so rows can be added up exactly. */
  fullBuyers: number;
  fullSales: number;
  fullRevenue: number;
  preBuyers: number;
  preSales: number;
  preRevenue: number;
}

export interface SegmentTable {
  key: string;
  label: string;
  rows: SegmentRow[];
  note: string;
}

export interface PricingArmRow {
  test: string;
  /** "May – Aug 2026 · ended", "Live". */
  note: string;
  arm: string;
  control: boolean;
  /** "€29.99 full · €39.99 all": the arm's list in the stretch. */
  basePrice: string;
  /** The readers in the stretch dealt this arm: everything in the row is theirs. */
  finishers: number | null;
  paywallViews: number | null;
  /** Null when checkouts can't follow the filters (new or returning). */
  checkouts: number | null;
  /** Null when the test ran outside the range: nothing to count, not none sold. */
  paidSales: number | null;
  revenue: number | null;
  /** For the AOV test: each sale's amount. */
  aovLift: number | null;
  aovConfidence: number | null;
  /** Why the AOV comparison is blank. */
  aovWhy: string | null;
}

export interface Elasticity {
  /**
   * Every whole month since paid checkout began (CHECKOUT_FROM) up to the range's end, whatever
   * its start, whose finishers bought a full unlock: the average price they paid and their
   * payment CVR (people who bought one ÷ people who finished, each person once).
   */
  points: Array<{
    label: string;
    price: number;
    cvr: number;
    sales: number;
    finishers: number;
    /** The month's days in the range, for its read-out. */
    from?: string;
    to?: string;
    partial: boolean;
  }>;
  /** The months the points are, as the description names them: "May – Sep". */
  months: string | null;
  /** ln(cvr) = a + e · ln(price), or null under three points. */
  fit: { a: number; e: number } | null;
  /** The best month's CVR: the model is capped there. */
  cap: number | null;
  why: string | null;
  /** Today's single-report prices, to read the model at. */
  today: Array<{ arm: string; price: number }>;
}

export interface PaymentPayload extends PageHead {
  launched: boolean;
  /** Why every section about people is blank under these filters (peopleBlocked), or null. */
  blocked: string | null;
  tiles: Tile[];
  /** The counts behind the headline rates, for their info cards' worked line. */
  counts: {
    submissions: number;
    /** Finished surveys whose report got a full unlock (so far). */
    fullSubmissions: number;
    /** The people who finished, each once, and of them those who paid (so far). */
    finishers: number;
    payers: number;
  };
  types: { rows: PaymentTypeRow[]; refundsWhy: string | null };
  overTime: {
    grain: Grain;
    rows: OverTimeRow[];
    preOnSale: boolean;
    /** Why the pre-unlock columns are blank though on sale (the free survey without its gate). */
    preWhy?: string | null;
    /** Why the months start later than the range, when they do. */
    note: string | null;
  };
  checkout: {
    reached: number;
    attempted: number;
    paid: number;
    points: CheckoutPoint[];
    methods: MethodRow[];
    sales: number;
    why: string | null;
    /** Why checkouts before a day are left out, when the range reaches back to them. */
    note: string | null;
  };
  segments: SegmentTable[];
  pricing: {
    arms: PricingArmRow[];
    factors: {
      on: boolean | null;
      since: string | null;
      groups: Array<{ label: string; items: Array<{ key: string; multiplier: number }> }>;
    };
  };
  elasticity: Elasticity;
  /** The paygate's exit pages (paygate-exits.ts): reached, why not, pressed, paid after. */
  exits: PaygateExitsBlock;
}

/** The per-visitor price switch, as system_flags holds it; null when it couldn't be read. */
export interface UpliftFlag {
  enabled: boolean;
  updatedAt: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The pricing code's traffic sources, as their owners write them. */
const TRAFFIC_NAMES: Record<string, string> = {
  google: "Google",
  direct: "Direct",
  newsletter: "Newsletter",
  instagram: "Instagram",
  tiktok: "TikTok",
  other: "Other",
};

/**
 * A checkout that was paid: succeeded, or paid and later refunded or disputed (a refund or a
 * dispute rewrites the status, but the checkout did turn into a payment).
 */
const PAID: ReadonlySet<string> = new Set(["succeeded", "refunded", "disputed"]);

/** Paid checkout's first day: earlier checkout sessions were the team's tests. */
export const CHECKOUT_FROM = "2026-05-01";

/**
 * Finishers as people (the design's "each person counted once"): a person's finished surveys
 * together, by their person id; a finisher without one counts alone. A person paid, or bought a
 * full unlock, when any of those surveys' reports did (so far).
 */
export function people(subs: SubFact[]): SubFact[][] {
  const by = new Map<string, SubFact[]>();
  for (const s of subs) {
    const k = s.uid === null ? `s${s.id}` : `u${s.uid}`;
    const g = by.get(k);
    if (g) g.push(s);
    else by.set(k, [s]);
  }
  return [...by.values()];
}
const payingPeople = (ps: SubFact[][]) => ps.filter((p) => p.some((s) => s.paidAt)).length;
const fullPeople = (ps: SubFact[][]) => ps.filter((p) => p.some((s) => s.full)).length;

/**
 * The days the price-elasticity model is fitted on: every whole month from paid checkout's
 * start up to `to`, whatever the range's start (the design fits May – Sep under any range).
 * Null before the first whole month has ended.
 */
export function fitMonths(to: string): { from: string; to: string } | null {
  const whole = buckets(CHECKOUT_FROM, to, "month").filter((b) => b.full);
  return whole.length ? { from: whole[0]!.from, to: whole[whole.length - 1]!.to } : null;
}

/** "May – Sep" for months in a row, "May, Jun and Aug" with a gap. */
function monthsText(ms: Array<{ label: string; from: string; to: string }>): string | null {
  if (!ms.length) return null;
  const names = ms.map((m) => m.label.split(" (")[0]!);
  const inRow = ms.every((m, i) => i === 0 || m.from === addDays(ms[i - 1]!.to, 1));
  if (ms.length === 1) return names[0]!;
  return inRow
    ? `${names[0]} – ${names[names.length - 1]}`
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The notes of head() that concern other pages: nothing here reads visits or unfinished starts. */
const OTHER_PAGES = [/^The visit log counts every visitor/, /^Unfinished survey starts older than/];

/**
 * The pricing tests, one stretch of unchanged price lists each, as get_price_list_changes()
 * pins them and the experiment readouts split them: Pricing 2.0's A and B lists, A raised on
 * 24 Aug 2026 (2.1, a new comparison against the same B), A retired on 31 Aug; Pricing 3.0
 * from its restart with B3 lowered (PRICE_TEST_START_AT). "list": today's price list. Before
 * Pricing 2.0 the letters named earlier experiments with personal prices, not read here.
 */
const PRICE_TESTS: Array<{
  test: string;
  from: string;
  to: string | null;
  arms: Array<{ arm: string; price: string }>;
}> = [
  {
    test: "Pricing 2.0",
    from: "2026-08-03T20:09:45Z",
    to: "2026-08-24T02:43:12Z",
    arms: [
      { arm: "A", price: "€9.99 full · €19.99 core · €29.99 all" },
      { arm: "B", price: "€29.00 full · €39.00 core · €49.00 all" },
    ],
  },
  {
    test: "Pricing 2.1",
    from: "2026-08-24T02:43:12Z",
    to: "2026-08-31T10:09:20Z",
    arms: [
      { arm: "A", price: "€39.99 full · €49.99 core · €59.00 all" },
      { arm: "B", price: "€29.00 full · €39.00 core · €49.00 all" },
    ],
  },
  {
    test: "Pricing 3.0",
    from: PRICE_TEST_START_AT,
    to: null,
    arms: [
      { arm: "A3", price: "list" },
      { arm: "B3", price: "list" },
    ],
  },
];

const METHOD_NAMES: Record<string, string> = {
  link: "Stripe Link",
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  diners: "Diners",
  jcb: "JCB",
  unionpay: "UnionPay",
  card: "Card",
  paypal: "PayPal",
  apple_pay: "Apple Pay",
  google_pay: "Google Pay",
};

/** ln Γ(x), by Lanczos' approximation (g = 7). */
function lnGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const y = x - 1;
  let s = c[0]!;
  for (let i = 1; i < 9; i++) s += c[i]! / (y + i);
  const t = y + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (y + 0.5) * Math.log(t) - t + Math.log(s);
}

/** The regularized incomplete beta function I_x(a, b), by Lentz's continued fraction. */
function betaInc(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - betaInc(1 - x, b, a);
  const front =
    Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x)) / a;
  const TINY = 1e-30;
  let f = 1;
  let c = 1;
  let d = 0;
  for (let i = 0; i <= 300; i++) {
    const m = i >> 1;
    const num =
      i === 0
        ? 1
        : i % 2 === 0
          ? (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
          : -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    d = 1 / (Math.abs(d) < TINY ? TINY : d);
    c = 1 + num / c;
    if (Math.abs(c) < TINY) c = TINY;
    f *= c * d;
    if (Math.abs(1 - c * d) < 1e-12) break;
  }
  return front * (f - 1);
}

/**
 * Welch's t-test, B against A on their means, with the Welch-Satterthwaite degrees of freedom:
 * a handful of sales a side is far from the normal curve, which would read it near-certain.
 */
export function welch(
  a: number[],
  b: number[]
): { lift: number | null; confidence: number | null } {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  if (a.length < 2 || b.length < 2) return { lift: null, confidence: null };
  const ma = mean(a);
  const mb = mean(b);
  const sa = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1) / a.length;
  const sb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1) / b.length;
  const lift = ma > 0 ? mb / ma - 1 : null;
  if (sa + sb === 0) return { lift, confidence: null };
  const t = (mb - ma) / Math.sqrt(sa + sb);
  const df = (sa + sb) ** 2 / (sa ** 2 / (a.length - 1) + sb ** 2 / (b.length - 1));
  // Two-sided: 1 − p, where p = I_{df/(df+t²)}(df/2, 1/2).
  return { lift, confidence: 1 - betaInc(df / (df + t * t), df / 2, 0.5) };
}

/** Least squares of ln(cvr) on ln(price). */
export function fitElasticity(
  points: Array<{ price: number; cvr: number }>
): { a: number; e: number } | null {
  const ok = points.filter((p) => p.price > 0 && p.cvr > 0);
  if (ok.length < 3) return null;
  const lx = ok.map((p) => Math.log(p.price));
  const ly = ok.map((p) => Math.log(p.cvr));
  const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
  const my = ly.reduce((a, b) => a + b, 0) / ly.length;
  const sxx = lx.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const e = lx.reduce((a, x, i) => a + (x - mx) * (ly[i]! - my), 0) / sxx;
  return { a: my - e * mx, e };
}

export function buildPayment(input: {
  facts: Facts;
  filters: ApFilters;
  today: string;
  now: Date;
  /** pricing_uplift_enabled, or null when it couldn't be read. */
  uplift: UpliftFlag | null;
  /**
   * The facts of fitMonths(range end), when the range's own don't cover those months; without
   * them the model reads the range's facts.
   */
  fitFacts?: Facts | null;
  /** Whether the report's EUR 1.99 gate is switched on now; null when it couldn't be read. */
  gateOn?: boolean | null;
  /** The exit pages' events (readPaygateExitRows); null when they couldn't be read. */
  exitRows?: ExitEventRow[] | null;
}): PaymentPayload {
  const { facts, filters: f, today, now, uplift } = input;
  const scope: Scope = assessmentScope(f);
  const on = launched(scope);
  // A filter the records can't follow over this range: every figure about people is blank.
  const tablet = peopleBlocked(scope, facts.from);
  const subs = tablet ? [] : subsIn(facts, scope);
  const sales = tablet ? [] : salesIn(facts, scope);
  const gifts = tablet
    ? []
    : facts.money.filter((m) => m.amount <= 0 && inScope(m, scope) && classifySource(m) !== "test");
  const isFull = (m: { plan: string | null }) => FULL_PLANS.has(m.plan ?? "");
  const isPre = (m: { plan: string | null }) => PRE_PLANS.has(m.plan ?? "");
  // Pre-unlocks (the Initial plan) are on sale from PRE_ON_SALE_FROM: a range wholly before it
  // has none to count, blank rather than 0.
  const preOnSale = PRE_PLANS.size > 0 && facts.to >= PRE_ON_SALE_FROM;
  const sum = (ms: MoneyFact[]) => round2(ms.reduce((n, m) => n + m.amount, 0));
  const count = (n: number) => n.toLocaleString("en-US");
  // Payment CVR counts people (each once); the full-unlock CVR counts submissions, as drawn.
  const persons = people(subs);
  const payers = payingPeople(persons);
  const fullSubs = subs.filter((s) => s.full).length;
  // Paid checkout went live on 1 May 2026: April's checkouts were the team's tests (one
  // report opened 44 of them over two days), so they are left out, as the design counts. A
  // checkout is new or returning by its finisher's visit, as their payment is.
  const checkoutWhy = tablet;
  const checkouts = checkoutWhy
    ? []
    : facts.checkouts.filter(
        (c) => c.day >= CHECKOUT_FROM && inScope(c, scope) && classifySource(c) !== "test"
      );
  const reached = checkouts.reduce((n, c) => n + c.n, 0);
  const paidCheckouts = checkouts.filter((c) => PAID.has(c.status)).reduce((n, c) => n + c.n, 0);
  const sparkOf = (pick: (from: string, to: string) => number | null) =>
    trendBuckets(facts.from, facts.to).map((b) => (tablet ? null : pick(b.from, b.to)));
  const salesBetween = (from: string, to: string) =>
    sales.filter((m) => m.day >= from && m.day <= to);
  const subsBetween = (from: string, to: string) =>
    subs.filter((s) => s.day >= from && s.day <= to);
  const tile = (
    key: string,
    label: string,
    unit: Tile["unit"],
    value: number | null,
    note: string,
    spark: Array<number | null>,
    goodWhen: Tile["goodWhen"] = "up"
  ): Tile => ({
    key,
    label,
    unit,
    value: tablet ? null : value,
    prev: null,
    goodWhen,
    spark,
    foot: "",
    blocked: tablet,
    trend: "",
    note,
  });
  const full = sales.filter(isFull);
  const pre = sales.filter(isPre);
  const preSubs = (xs: SubFact[]) => xs.filter((x) => preBuysOf(x).length > 0).length;
  // "Free survey" sells the EUR 1.99 only through the report's own gate: with it off and none
  // sold, its pre-unlock figures are blank with why, as its payment type's row is, never 0.
  const preWhy =
    scope.funnel === "free"
      ? freePreBlocked(input.gateOn, pre.length > 0 || preSubs(subs) > 0)
      : null;
  const preLive = preOnSale && preWhy === null;
  const tiles: Tile[] = [
    tile(
      "revenue",
      "Revenue",
      "eur",
      sum(sales),
      rangeLabel(facts.from, facts.to),
      sparkOf((a, b) => sum(salesBetween(a, b)))
    ),
    tile(
      "sales",
      "Paid sales",
      "count",
      sales.length,
      gifts.length
        ? `+ ${count(gifts.length)} free unlock${gifts.length === 1 ? "" : "s"}`
        : "no free unlocks",
      sparkOf((a, b) => salesBetween(a, b).length)
    ),
    tile(
      "pre",
      "Pre-unlocks",
      "count",
      preLive ? pre.length : null,
      preWhy ??
        (preOnSale
          ? "Initial plan"
          : `Initial plan · counted from ${rangeLabel(PRE_ON_SALE_FROM, PRE_ON_SALE_FROM)}, its first whole day on sale`),
      // A point wholly before the sale began is blank, never 0.
      preLive
        ? sparkOf((a, b) => (b < PRE_ON_SALE_FROM ? null : salesBetween(a, b).filter(isPre).length))
        : []
    ),
    // As the full unlock's: of the range's submissions, those whose Core Archetype was
    // pre-unlocked (EUR 1.99) so far. Over days before it was on sale nobody could: blank.
    tile(
      "pre-cvr",
      "Pre-unlock CVR",
      "pct",
      preLive && facts.from >= PRE_ON_SALE_FROM ? ratio(preSubs(subs), subs.length) : null,
      preWhy ??
        (!preOnSale || facts.from < PRE_ON_SALE_FROM
          ? `Counted from ${rangeLabel(PRE_ON_SALE_FROM, PRE_ON_SALE_FROM)}, its first whole day on sale: pick a range from then`
          : `${count(preSubs(subs))} of ${count(subs.length)} submissions so far`),
      preLive
        ? sparkOf((a, b) =>
            a < PRE_ON_SALE_FROM
              ? null
              : ratio(preSubs(subsBetween(a, b)), subsBetween(a, b).length)
          )
        : []
    ),
    tile(
      "full",
      "Full unlocks",
      "count",
      full.length,
      "Full, Full All, Core",
      sparkOf((a, b) => salesBetween(a, b).filter(isFull).length)
    ),
    // Of the range's survey submissions, those whose report got a full unlock so far: the same
    // surveys on both sides (a sale in the range can be an earlier finisher's).
    tile(
      "full-cvr",
      "Full-unlock CVR",
      "pct",
      ratio(fullSubs, subs.length),
      `${count(fullSubs)} of ${count(subs.length)} submissions so far`,
      sparkOf((a, b) => {
        const xs = subsBetween(a, b);
        return ratio(xs.filter((s) => s.full).length, xs.length);
      })
    ),
    tile(
      "aov",
      "Avg. order value",
      "eur",
      ratio(sum(sales), sales.length),
      sales.length
        ? `over ${count(sales.length)} paid sale${sales.length === 1 ? "" : "s"}`
        : "no paid sale",
      sparkOf((a, b) => ratio(sum(salesBetween(a, b)), salesBetween(a, b).length))
    ),
    // Paying people ÷ people who finished, each person once.
    tile(
      "pay-cvr",
      "Payment CVR",
      "pct",
      ratio(payers, persons.length),
      `${count(payers)} of ${count(persons.length)} finishers`,
      sparkOf((a, b) => {
        const ps = people(subsBetween(a, b));
        return ratio(payingPeople(ps), ps.length);
      })
    ),
    tile(
      "checkout",
      "Checkout success",
      "pct",
      ratio(paidCheckouts, reached),
      checkoutWhy ? "" : `${count(paidCheckouts)} of ${count(reached)} reached the payment page`,
      sparkOf((a, b) => {
        const xs = checkouts.filter((c) => c.day >= a && c.day <= b);
        return ratio(
          xs.filter((c) => PAID.has(c.status)).reduce((n, c) => n + c.n, 0),
          xs.reduce((n, c) => n + c.n, 0)
        );
      })
    ),
  ];
  // Coloured as the design colours a month's success: green from 30%, red below.
  const success = ratio(paidCheckouts, reached);
  if (success !== null) tiles[8]!.noteTone = success >= 0.3 ? "good" : "bad";
  if (checkoutWhy) tiles[8] = { ...tiles[8]!, value: null, blocked: checkoutWhy };

  // ---- over time: whole months beyond four months, weeks below, days under two weeks, from
  // paid checkout's start (nothing was sold before), each labelled as the shared buckets write it
  const start = facts.from > CHECKOUT_FROM ? facts.from : CHECKOUT_FROM;
  const grain = grainOf(start, facts.to);
  const points = start <= facts.to ? buckets(start, facts.to, grain) : [];
  const overTime: OverTimeRow[] = points.map((b) => {
    const xs = salesBetween(b.from, b.to);
    const finished = subsBetween(b.from, b.to);
    const ps = people(finished);
    return {
      label: b.label,
      from: b.from,
      to: b.to,
      partial: !b.full,
      preSales: xs.filter(isPre).length,
      preRevenue: sum(xs.filter(isPre)),
      fullSales: xs.filter(isFull).length,
      fullRevenue: sum(xs.filter(isFull)),
      revenue: sum(xs),
      preOn: b.to >= PRE_ON_SALE_FROM,
      submissions: finished.length,
      finishers: ps.length,
      payers: payingPeople(ps),
    };
  });

  // ---- checkout and payment methods
  const checkoutPoints: CheckoutPoint[] = points.map((b) => {
    const xs = checkouts.filter((c) => c.day >= b.from && c.day <= b.to);
    return {
      label: b.label,
      from: b.from,
      to: b.to,
      partial: !b.full,
      reached: xs.reduce((n, c) => n + c.n, 0),
      attempted: xs.filter((c) => c.attempted).reduce((n, c) => n + c.n, 0),
      paid: xs.filter((c) => PAID.has(c.status)).reduce((n, c) => n + c.n, 0),
    };
  });
  const byMethod = new Map<string, MoneyFact[]>();
  for (const m of sales) {
    const k = m.method ?? "unknown";
    byMethod.set(k, [...(byMethod.get(k) ?? []), m]);
  }
  const methods: MethodRow[] = [...byMethod.entries()]
    .map(([key, ms]) => ({
      key,
      name: METHOD_NAMES[key] ?? (key === "unknown" ? "Not recorded" : key),
      kind: key === "link" ? "saved details" : key === "unknown" ? "" : "card",
      sales: ms.length,
      revenue: sum(ms),
    }))
    .sort((a, b) => b.sales - a.sales || b.revenue - a.revenue);

  // ---- who pays (the range's finishers, each person once in a row, what they bought so far)
  const segment = (
    key: string,
    label: string,
    valueOf: (s: SubFact) => string,
    /** The rows' order: as listed, by paid sales, or (unset) by finishers. */
    order?: string[] | "sales"
  ): SegmentTable => {
    const groups = new Map<string, SubFact[]>();
    for (const s of subs) {
      const v = valueOf(s);
      groups.set(v, [...(groups.get(v) ?? []), s]);
    }
    const rows: SegmentRow[] = [...groups].map(([k, xs]) => {
      const ps = people(xs);
      // Their full unlocks only: a buyer's other sale is no full-unlock price.
      const fullSalesN = xs.reduce((n, s) => n + s.fullSales, 0);
      const fullRevenue = round2(xs.reduce((n, s) => n + s.fullRevenue, 0));
      // And their pre-unlocks only, the same way: each buyer once, as the full unlock's.
      const preBuys = xs.flatMap(preBuysOf);
      const preBuyers = ps.filter((p) => p.some((s) => preBuysOf(s).length > 0)).length;
      const preRevenue = round2(preBuys.reduce((n, [, amount]) => n + amount, 0));
      return {
        label: k,
        finishers: ps.length,
        sales: xs.reduce((n, s) => n + s.sales, 0),
        // As the tile: over days before it was on sale (23 Oct 2026) nobody could, so blank.
        preCvr: preLive && facts.from >= PRE_ON_SALE_FROM ? ratio(preBuyers, ps.length) : null,
        preAvg: preLive ? ratio(preRevenue, preBuys.length) : null,
        fullCvr: ratio(fullPeople(ps), ps.length),
        fullAvg: ratio(fullRevenue, fullSalesN),
        revenue: round2(xs.reduce((n, s) => n + s.revenue, 0)),
        fullBuyers: fullPeople(ps),
        fullSales: fullSalesN,
        fullRevenue,
        preBuyers,
        preSales: preBuys.length,
        preRevenue,
      };
    });
    const rank = (r: SegmentRow) =>
      Array.isArray(order) && order.includes(r.label) ? order.indexOf(r.label) : Infinity;
    rows.sort((a, b) =>
      Array.isArray(order)
        ? rank(a) - rank(b)
        : order === "sales"
          ? Number(a.label === "Not recorded") - Number(b.label === "Not recorded") ||
            b.sales - a.sales ||
            b.finishers - a.finishers
          : b.finishers - a.finishers
    );
    return { key, label, rows, note: "" };
  };
  const sourceLabel = (s: SubFact) => {
    const c = classifySource(s);
    return SOURCES.find((o) => o.value === c)?.label ?? "Not recorded";
  };
  const deviceOf = (s: SubFact) =>
    s.device === "iOS" || s.device === "Android" || s.device === "Desktop" || s.device === "Tablet"
      ? s.device
      : deviceClass(s.device) === null
        ? "Not recorded"
        : s.device!;
  const segments: SegmentTable[] = [
    segment("gender", "Gender", (s) => genderShort(s.gender)),
    segment("age", "Age", (s) => s.age ?? "Not stated", [
      "18–24",
      "25–34",
      "35–44",
      "45–54",
      "55–64",
      "65+",
      "Not stated",
    ]),
    segment("relationship", "Relationship", (s) => relationshipShort(s.relationship)),
    segment("country", "Country", (s) => s.country ?? "Not stated"),
    // By paid sales, as drawn (iOS, Desktop, Android); Not recorded last.
    segment("device", "Device / OS", deviceOf, "sales"),
    segment(
      "tier",
      "Country price tier",
      (s) => TIERS.find((t) => t.value === s.tier)?.label ?? "No price quote",
      TIERS.filter((t) => t.value !== "all").map((t) => t.label)
    ),
    segment(
      "source",
      "Traffic source",
      sourceLabel,
      SOURCES.filter((o) => o.value !== "all").map((o) => o.label)
    ),
  ];
  const each = "The range's survey finishers, each person counted once,";
  const notes: Record<string, string> = {
    gender: `${each} by their answer, and what they bought so far.`,
    age: `${each} by their age band (question 15003), and what they bought so far.`,
    relationship: `${each} by their relationship answer, and what they bought so far.`,
    country: `${each} by the country they gave in the survey, and what they bought so far.`,
    device: `${each} by the device of their own price quotes (made when the report first loads), else the one the survey's steps recorded (from ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)}). Not recorded: neither saw one.`,
    tier: `${each} by the price tier of their price quote. Every finisher from ${rangeLabel(QUOTED_FROM, QUOTED_FROM)} has one; earlier ones without are "No price quote".`,
    source: `${each} by where their first page came from (the survey's tracker). Not recorded: before 19 Jul 2026 an untagged visit's source wasn't kept.${
      f.from < SURVEY_TRACKING_FROM
        ? ` Until ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)} it kept no referring site either, so an untagged visitor from a search engine, an email, a social site, an AI assistant or another site is under Direct / untagged.`
        : ""
    }`,
  };
  // Pre CVR is blank over a range that starts before the EUR 1.99 was on sale, as on its tile.
  const preFrom =
    preLive && facts.from < PRE_ON_SALE_FROM
      ? ` Pre CVR counts from ${rangeLabel(PRE_ON_SALE_FROM, PRE_ON_SALE_FROM)}, the first whole day the €1.99 was on sale: pick a range from then.`
      : "";
  for (const t of segments) t.note = (notes[t.key] ?? "") + preFrom;

  // ---- the pricing tests: each a stretch of unchanged price lists (get_price_list_changes),
  // read as the experiment readouts read them: the readers who finished in the stretch, each on
  // the list their quote was dealt (a later re-sync moved unpaid quotes to newer lists), and
  // their own checkouts and sales on it, up to the stretch's end or the range's.
  const listPrice = (arm: "A3" | "B3") => {
    const full = getPricingBucketsForPlan("full_report").find((b) => b.code === arm);
    const all = getPricingBucketsForPlan("all_reports").find((b) => b.code === arm);
    return `${full ? `€${(full.startingCents / 100).toFixed(2)} full` : ""}${all ? ` · €${(all.startingCents / 100).toFixed(2)} all` : ""}`;
  };
  const rangeFrom = reportingDayStart(facts.from).getTime();
  const rangeUntil = reportingDayStart(addDays(facts.to, 1)).getTime();
  const at = (iso: string) => {
    const [day, time] = reportingDateTime(new Date(iso)).split(" ");
    return `${shortDate(day!)} ${time}`;
  };
  const pricingArms: PricingArmRow[] = PRICE_TESTS.flatMap((test) => {
    const start = Date.parse(test.from);
    const end = test.to ? Date.parse(test.to) : Infinity;
    const from = Math.max(start, rangeFrom);
    const until = Math.min(end, rangeUntil);
    const inRange = from < until;
    // A stretch the range cuts short says so: its readers are only the range's part of it. A
    // live test runs on, so only a range ending before yesterday (the last whole day) cuts its end.
    const endCut = test.to ? until < end : facts.to < addDays(today, -1);
    const cut = inRange && (from > start || endCut) ? " · cut to this range" : "";
    const note = test.to
      ? `${at(test.from)} – ${at(test.to)} · ended${cut}`
      : `Live · from ${at(test.from)}${cut}`;
    // Paywall views are recorded from PAYWALL_SEEN_FROM: an earlier stretch has none to show.
    const viewsOk = start >= reportingDayStart(PAYWALL_SEEN_FROM).getTime();
    const lastDay = reportingDateTime(new Date(until - 1)).slice(0, 10);
    const rows = test.arms.map((a) => {
      // The readers who finished in the stretch and were first quoted in it: one first quoted
      // after it ended saw the next prices, as the experiment readouts leave them out, and so is
      // a survey bought before it was taken (pay to start): no arm's price sold it.
      const cohort = inRange
        ? subs.filter((x) => {
            const t = Date.parse(x.at);
            const quoted = x.quotedAt === null ? NaN : Date.parse(x.quotedAt);
            return x.priceArm === a.arm && !x.pts && t >= from && t < until && quoted < end;
          })
        : [];
      const ids = new Set(cohort.map((x) => x.id));
      const amounts = cohort.flatMap((x) =>
        (x.pays ?? []).filter(([t]) => t * 1000 >= from && t * 1000 < until).map(([, v]) => v)
      );
      const cs = checkouts.filter((c) => c.sid !== null && ids.has(c.sid) && c.day <= lastDay);
      return { a, cohort, amounts, cs };
    });
    const t = welch(rows[0]!.amounts, rows[1]!.amounts);
    return rows.map(({ a, cohort, amounts, cs }, i): PricingArmRow => ({
      test: test.test,
      note: inRange ? note : `${note} · not in this range`,
      arm: a.arm,
      control: i === 0,
      basePrice: a.price === "list" ? listPrice(a.arm as "A3" | "B3") : a.price,
      finishers: inRange && !tablet ? cohort.length : null,
      paywallViews: inRange && viewsOk ? cohort.filter(reachedPaywall).length : null,
      checkouts: checkoutWhy || !inRange ? null : cs.reduce((n, c) => n + c.n, 0),
      paidSales: inRange ? amounts.length : null,
      revenue: inRange ? round2(amounts.reduce((n, v) => n + v, 0)) : null,
      aovLift: i === 0 ? null : t.lift,
      aovConfidence: i === 0 ? null : t.confidence,
      aovWhy:
        i === 0
          ? null
          : !inRange
            ? "Not in this range"
            : rows[0]!.amounts.length < 2 || rows[1]!.amounts.length < 2
              ? "Too few sales to compare"
              : null,
    }));
  });
  const factors = personalPriceFactors();
  const TIER_NAMES: Record<string, string> = Object.fromEntries(
    TIERS.map((t) => [t.value, t.label])
  );
  const factorGroups = [
    {
      label: "Country tier",
      items: factors.country.map((x) => ({
        key: TIER_NAMES[x.key] ?? x.key,
        multiplier: x.multiplier,
      })),
    },
    { label: "Device", items: factors.device },
    {
      label: "Traffic source",
      items: factors.traffic.map((x) => ({
        key: TRAFFIC_NAMES[x.key] ?? x.key,
        multiplier: x.multiplier,
      })),
    },
    {
      label: "Behaviour bucket",
      items: factors.behaviour.map((x) => ({
        key: x.key.charAt(0).toUpperCase() + x.key.slice(1),
        multiplier: x.multiplier,
      })),
    },
    { label: "Engagement score", items: factors.engagement },
    {
      label: "Discount step",
      items: factors.discount.map((x) => ({
        key: x.key.charAt(0).toUpperCase() + x.key.slice(1),
        multiplier: x.multiplier,
      })),
    },
  ];

  // ---- price elasticity: every whole month since paid checkout began, up to the range's end
  // (whatever its start, as drawn), whose finishers bought a full unlock (so far): each month's
  // own people, each once, the share who bought one, and what their full unlocks cost on average.
  // A survey bought before it was taken (pay to start) is left out: no report price sold it.
  // A filter its records can't follow back to that start leaves it blank (peopleBlocked).
  const checkoutDay = rangeLabel(CHECKOUT_FROM, CHECKOUT_FROM);
  // A finisher's tier and device come from their price quote, which every finisher has only
  // from QUOTED_FROM (15 May): May's first fortnight would be partly missing under either filter.
  const quoteFiltered =
    (scope.tier !== "all" || scope.device !== "all") && CHECKOUT_FROM < QUOTED_FROM;
  const fitBlocked =
    peopleBlocked(scope, CHECKOUT_FROM) || quoteFiltered
      ? `The model is fitted on every whole month from ${checkoutDay}, when paid checkout began, but ${
          scope.device === "tablet"
            ? `tablets are told apart only from ${rangeLabel(SURVEY_TRACKING_FROM, SURVEY_TRACKING_FROM)}`
            : scope.source !== "all"
              ? `sources are recorded only from ${rangeLabel(SOURCE_FROM, SOURCE_FROM)}`
              : scope.visitor !== "all"
                ? `new and returning are told apart only from ${rangeLabel(VISITOR_FROM, VISITOR_FROM)}`
                : `a finisher's ${scope.tier !== "all" ? "country tier" : "device"} comes from their price quote, which every finisher has only from ${rangeLabel(QUOTED_FROM, QUOTED_FROM)}`
        }: it can't follow this filter.`
      : null;
  const fitDays = tablet || fitBlocked ? null : fitMonths(facts.to);
  const elFacts = input.fitFacts ?? facts;
  const elPoints = (fitDays ? buckets(fitDays.from, fitDays.to, "month") : [])
    .map((b) => {
      const xs = subsIn(elFacts, scope, b.from, b.to).filter((x) => !x.pts);
      const ps = people(xs);
      const n = xs.reduce((a, x) => a + x.fullSales, 0);
      return {
        label: b.label,
        price: n ? round2(xs.reduce((a, x) => a + x.fullRevenue, 0) / n) : 0,
        cvr: ps.length ? fullPeople(ps) / ps.length : 0,
        sales: n,
        finishers: ps.length,
        from: b.from,
        to: b.to,
        partial: false,
      };
    })
    .filter((p) => p.sales > 0 && p.finishers > 0);
  const fit = fitElasticity(elPoints);
  const k = elPoints.length;
  const elasticity: Elasticity = {
    points: elPoints,
    months: monthsText(elPoints),
    fit,
    cap: elPoints.length ? Math.max(...elPoints.map((p) => p.cvr)) : null,
    why:
      tablet ??
      fitBlocked ??
      (fit
        ? null
        : k >= 3
          ? "The model could not be fitted: every month's average price is the same."
          : `The model needs three whole months from ${checkoutDay}, when paid checkout began, whose finishers bought a full unlock; up to this range's end there ${k === 0 ? "is none" : k === 1 ? "is one" : "are two"}.`),
    today: (["A3", "B3"] as const).flatMap((arm) => {
      const b = getPricingBucketsForPlan("full_report").find((x) => x.code === arm);
      return b ? [{ arm, price: b.startingCents / 100 }] : [];
    }),
  };

  // ---- payment types: every way a reader pays, across both funnels (design, 21 Oct 2026), each
  // sale in one row, so the live rows add up to the paid sales. Pay to start's own purchase
  // carries its journey (metadata.journey); a full unlock bought after a paid EUR 1.99 is its
  // upgrade, whichever funnel sold the EUR 1.99. A type not on sale over the range is blank,
  // never 0: pay to start before it went live, the report's EUR 1.99 gate while it is switched
  // off (and sold nothing). A plan sold outside them (a retired one) gets its own row, and what a
  // pay-to-start reader bought on the report afterwards its own. Refunds carry no visitor
  // history: blank under the narrowing filters (the Funnel filter they follow), and when they
  // weren't read.
  const free = scope.funnel === "free";
  const refundsWhy =
    facts.refunds === undefined
      ? "Refunds were not read for this range."
      : activeNarrowing(f).length
        ? "Refunds carry no source, device, tier or visitor, so a filter leaves them blank."
        : null;
  const refunds = refundsWhy
    ? null
    : on
      ? (facts.refunds ?? []).filter((r) => !(free && r.pts))
      : [];
  type Sold = {
    plan: string | null;
    journey?: string | null;
    upgrade?: boolean;
    pts?: boolean;
  };
  const typeRow = (
    key: string,
    name: string,
    line: string,
    onSale: boolean,
    has: (m: Sold) => boolean
  ): PaymentTypeRow => {
    const xs = sales.filter(has);
    const rs = refunds?.filter(has) ?? null;
    // A sale is never hidden: a type that sold over the range is live, whatever its switch says.
    const live = onSale || xs.length > 0 || (rs?.length ?? 0) > 0;
    return {
      key,
      name,
      line,
      live,
      sales: live ? xs.length : null,
      revenue: live ? sum(xs) : null,
      refunds: live && rs ? rs.length : null,
      fullRefunds: live && rs ? rs.filter((r) => r.full).length : null,
    };
  };
  const bought = (m: Sold) => m.journey === PAY_TO_START_JOURNEY;
  // Bought on a pay-to-start reader's report after the purchase (not an upgrade from EUR 1.99).
  const later = (m: Sold) => !bought(m) && m.pts === true && !m.upgrade;
  // "Free survey" leaves pay to start's rows out: blank, never 0.
  const ptsOn = facts.to >= PAY_TO_START_FROM && !free;
  const ptsLine = free
    ? "Pay to start · left out by the Funnel filter"
    : ptsOn
      ? "Pay to start · live"
      : `Pay to start · live from ${rangeLabel(PAY_TO_START_FROM, PAY_TO_START_FROM)}`;
  const gateOn = input.gateOn === true;
  const otherPlans = [
    ...new Set([...sales.map((m) => m.plan), ...(refunds ?? []).map((r) => r.plan)]),
  ].filter((p) => !isFull({ plan: p }) && !isPre({ plan: p }));
  const types: PaymentTypeRow[] = [
    typeRow(
      "full",
      "Full unlock after report",
      "Free survey · live",
      true,
      (m) => isFull(m) && !bought(m) && !m.upgrade && !later(m)
    ),
    typeRow(
      "pre",
      "Pre-unlock after report",
      // The switch as it is now: null when it couldn't be read (never read as off).
      gateOn
        ? "Free survey · the €1.99 gate is on"
        : input.gateOn === null || input.gateOn === undefined
          ? "Free survey · the €1.99 gate's switch couldn't be read"
          : "Free survey · the €1.99 gate is switched off",
      gateOn,
      (m) => isPre(m) && !bought(m) && !later(m)
    ),
    ...otherPlans.map((p) =>
      typeRow(
        `plan-${p ?? "none"}`,
        p === "essentials" ? "Essentials (retired)" : (p ?? "Plan not recorded"),
        "Free survey",
        true,
        (x) => x.plan === p && !later(x)
      )
    ),
    typeRow("pay-full", "Pay to start · full", ptsLine, ptsOn, (m) => isFull(m) && bought(m)),
    typeRow("pay-pre", "Pay to start · €1.99 pre", ptsLine, ptsOn, (m) => isPre(m) && bought(m)),
    typeRow("pay-later", "Pay to start · later purchase on the report", ptsLine, ptsOn, later),
    typeRow(
      "upgrade",
      "Upgrade after €1.99",
      // An upgrade follows a paid EUR 1.99: pay to start's page, or the report's own gate.
      free
        ? gateOn
          ? "Free survey · live"
          : input.gateOn === false
            ? "Free survey · the €1.99 gate is switched off"
            : "Free survey · the €1.99 gate's switch couldn't be read"
        : ptsOn && gateOn
          ? "Both funnels · live"
          : ptsOn
            ? input.gateOn === false
              ? "Pay to start · live (the report's €1.99 gate is switched off)"
              : "Pay to start · live (the report's €1.99 gate's switch couldn't be read)"
            : gateOn
              ? "Free survey · live"
              : ptsLine,
      ptsOn || gateOn,
      (m) => isFull(m) && !bought(m) && m.upgrade === true
    ),
  ];

  // Under a filter the records can't follow over this range, the sections about people are
  // blank with the reason (blocked), never a column of zeros.
  const pageHead = head(f, today, now, false, facts);
  // A checkout by someone PostHog didn't see is in neither group, as their sale is (head()).
  const unseenCheckouts =
    f.visitor === "all" || f.from < VISITOR_FROM
      ? 0
      : facts.checkouts
          .filter(
            (c) =>
              c.day >= CHECKOUT_FROM &&
              (c.visitorNew ?? null) === null &&
              inScope(c, { ...scope, visitor: "all" }) &&
              classifySource(c) !== "test"
          )
          .reduce((n, c) => n + c.n, 0);
  return {
    ...pageHead,
    notes: [
      ...pageHead.notes.filter((n) => !OTHER_PAGES.some((re) => re.test(n))),
      ...(unseenCheckouts
        ? [
            `${unseenCheckouts === 1 ? "One checkout" : `${count(unseenCheckouts)} checkouts`} in this range ${unseenCheckouts === 1 ? "is" : "are"} by people whose visit PostHog didn't see, so neither new nor returning counts ${unseenCheckouts === 1 ? "it" : "them"}.`,
          ]
        : []),
    ],
    launched: on,
    blocked: tablet,
    tiles,
    counts: {
      submissions: subs.length,
      fullSubmissions: fullSubs,
      finishers: persons.length,
      payers,
    },
    types: { rows: tablet ? [] : types, refundsWhy },
    overTime: {
      grain,
      rows: tablet ? [] : overTime,
      preOnSale: preLive,
      preWhy,
      note:
        facts.from < CHECKOUT_FROM
          ? `From ${checkoutDay}, when paid checkout began: nothing was sold before.`
          : null,
    },
    checkout: {
      reached,
      attempted: checkouts.filter((c) => c.attempted).reduce((n, c) => n + c.n, 0),
      paid: paidCheckouts,
      points: checkoutPoints,
      methods,
      sales: sales.length,
      why: checkoutWhy,
      note: [
        facts.from < CHECKOUT_FROM
          ? `Checkouts count from ${rangeLabel(CHECKOUT_FROM, CHECKOUT_FROM)}, when paid checkout went live: the earlier ones were the team's tests.`
          : null,
        "A checkout counts on the day the payment page was reached. One left unpaid is recorded when Stripe closes it, a day later, so the last day's can still come in.",
      ]
        .filter(Boolean)
        .join(" "),
    },
    segments: tablet ? [] : segments,
    pricing: {
      arms: tablet ? [] : pricingArms,
      factors: {
        on: uplift ? uplift.enabled : null,
        since: uplift?.updatedAt ?? null,
        groups: factorGroups,
      },
    },
    elasticity,
    exits: buildPaygateExits({ subs, rows: input.exitRows ?? null, blocked: tablet, to: facts.to }),
  };
}

export { dayCount as _dayCount };
