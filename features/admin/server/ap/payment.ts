/**
 * Assessment A · Payment (Marcus's artboard "Payment copy", 24 Nov 2026): who pays, how and at
 * what price. Nine headline figures, the payment types, the pre-unlock price test (EUR 1.99
 * against choose your price), paid sales over time by unlock type, who pays by segment, and
 * checkout success and payment methods. The pricing tests, the personal price factors, the
 * price-elasticity model and the paygate exits left the page with that board.
 *
 * Money is the payment ledger (succeeded, not a test, staff out), by payment day; "who pays" and
 * the payment CVR are cohort figures (the range's finishers and what they bought so far), with
 * each person counted once (the design's "each person counted once").
 */
import { isPayToStartTracker, PAY_TO_START_JOURNEY } from "@features/pay-to-start/logic/journey";

import {
  classifySource,
  deviceClass,
  FULL_PLANS,
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
  peopleBlocked,
  QUOTED_FROM,
  ratio,
  salesIn,
  STEP_DEVICE_FROM,
  subsIn,
  VISITOR_FROM,
  type Scope,
} from "./metrics";
import { genderShort, relationshipShort } from "./traffic";
import {
  buildPriceTest,
  GATE_PRICE_FROM,
  priceArmOf,
  type PriceTestBlock,
  type PriceTestRow,
} from "./gate-price-test";
import type { ChoosePriceOption } from "@features/report/logic/choosePrice";

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
  /** The range's finishers who met this type's paywall; null where it has none to count. */
  shown: number | null;
  /** Who met the paywall couldn't be read: Paywall shown is blank and says so, never 0. */
  shownUnread?: boolean;
  /** What the CVR is of: how many (`base`) of whom (`baseOf`); null where it has no rate. */
  base: number | null;
  baseOf: string | null;
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
  /**
   * The pre-unlock price test, EUR 1.99 against "Choose your price" (gate-price-test.ts), per
   * half and per pick. It replaced #11 (the Core Archetype shown) and took its section.
   */
  priceTest: PriceTestBlock;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A checkout that was paid: succeeded, or paid and later refunded or disputed (a refund or a
 * dispute rewrites the status, but the checkout did turn into a payment).
 */
const PAID: ReadonlySet<string> = new Set(["succeeded", "refunded", "disputed"]);

/** Paid checkout's first day: earlier checkout sessions were the team's tests. */
export const CHECKOUT_FROM = "2026-05-01";

/**
 * The free survey's EUR 1.99 page went on at 14:38 UTC on 27 Oct 2026 (experiment registry #5,
 * docs/runbooks/PRE_UNLOCK.md): only surveys submitted after it ever met the page, so the fixed
 * pre-unlock's base counts from then.
 */
const FREE_GATE_ON_MS = Date.parse("2026-10-27T14:38:00Z");
export const FREE_GATE_ON_DAY = "2026-10-27";

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

/** The notes of head() that concern other pages: nothing here reads visits or unfinished starts. */
const OTHER_PAGES = [/^The visit log counts every visitor/, /^Unfinished survey starts older than/];

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

export function buildPayment(input: {
  facts: Facts;
  filters: ApFilters;
  today: string;
  now: Date;
  /** Whether the report's EUR 1.99 gate is switched on now; null when it couldn't be read. */
  gateOn?: boolean | null;
  /** Whether the price test (choose your price) is switched on now; null when unreadable. */
  priceOn?: boolean | null;
  /** The surveys whose report saw the EUR 1.99 page (readGateSeen); null when unreadable. */
  gateSeen?: ReadonlySet<number> | null;
  /** The price test's surveys with their tracker (readPriceTestRows); null when unreadable. */
  priceRows?: PriceTestRow[] | null;
  /** The choosing half's picks by survey (readPriceTestChoices); null when unreadable. */
  priceChoices?: ReadonlyMap<number, ChoosePriceOption> | null;
}): PaymentPayload {
  const { facts, filters: f, today, now } = input;
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

  // ---- payment types (Marcus's Payment board, 24 Nov 2026): every way a reader pays after the
  // free survey, each sale in one row, so the rows add up to the paid sales. The pre-unlock at a
  // fixed EUR 1.99 or at a price the reader chose (the price test's halves, by survey), the full
  // report bought on the report, and the full report bought after a pre-unlock (an upgrade,
  // whichever page sold the pre-unlock). Pay to start is retired (27 Nov 2026): its purchases and
  // what its readers bought later keep a row of their own, shown only in a range that has them,
  // as a retired plan's are. A type not on sale over the range is blank, never 0. Paywall shown
  // and CVR read the range's finishers: those who met that page, and what share bought.
  // Refunds carry no visitor history: blank under the narrowing filters, and when not read.
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
    sid: number;
    plan: string | null;
    journey?: string | null;
    upgrade?: boolean;
    pts?: boolean;
  };
  type Reach = {
    shown: number | null;
    base: number | null;
    baseOf: string | null;
    unread?: boolean;
  };
  const NO_REACH: Reach = { shown: null, base: null, baseOf: null };
  const typeRow = (
    key: string,
    name: string,
    line: string,
    onSale: boolean,
    has: (m: Sold) => boolean,
    reach: Reach = NO_REACH
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
      shown: live ? reach.shown : null,
      shownUnread: live && reach.unread === true,
      base: live ? reach.base : null,
      baseOf: live ? reach.baseOf : null,
    };
  };
  const bought = (m: Sold) => m.journey === PAY_TO_START_JOURNEY;
  // Everything a pay-to-start reader bought on their report afterwards, an upgrade included:
  // it all belongs to the retired funnel's row.
  const later = (m: Sold) => !bought(m) && m.pts === true;
  const retiredPts = (m: Sold) => bought(m) || later(m);
  const beforeTest = facts.to < GATE_PRICE_FROM;
  // The page that sold a pre-unlock decides its row: only the "Choose your price" page's
  // checkout names a pick (metadata.priceOption, readPriceTestChoices). A reader who finished
  // before the switch and paid a chosen price after it is a choice, whatever their survey's
  // stamp says; a EUR 1.99 sale is fixed, whichever half its survey was in.
  const choices = input.priceChoices ?? null;
  const chose = (m: Sold) => choices?.has(m.sid) === true;
  // Without the picks, a range that reaches the test can't split its pre-unlocks: one row holds
  // them all, with the reason, so the rows still add up to the paid sales.
  const splitWhy =
    !beforeTest && choices === null ? "Who chose a price could not be read just now." : null;
  // The survey's stamp (the price test's half) decides who could buy each: the bases.
  const halves = new Map<number, string>();
  for (const row of input.priceRows ?? []) {
    if (isPayToStartTracker(row.utm_tracker)) continue;
    const arm = priceArmOf(row);
    if (arm) halves.set(row.id, arm);
  }
  const halvesWhy =
    !beforeTest && (input.priceRows ?? null) === null
      ? "Who is in which half of the price test could not be read just now."
      : null;
  const seen = input.gateSeen ?? null;
  const shownOf = (xs: SubFact[]) => (seen ? xs.filter((s) => seen.has(s.id)).length : null);
  const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const freeFinishers = subs.filter((s) => !s.pts);
  // The free survey's EUR 1.99 page met only the finishers who submitted after its switch-on.
  const gated = freeFinishers.filter((s) => Date.parse(s.at) >= FREE_GATE_ON_MS);
  const fixedFinishers = gated.filter((s) => halves.get(s.id) !== "choose");
  const chooseFinishers = gated.filter((s) => halves.get(s.id) === "choose");
  const preBuyers = freeFinishers.filter((s) => preBuysOf(s).length > 0).length;
  const gateOn = input.gateOn === true;
  const priceOn = input.priceOn === true && !beforeTest;
  const gateDay = rangeLabel(FREE_GATE_ON_DAY, FREE_GATE_ON_DAY);
  const beforeGate = facts.to < FREE_GATE_ON_DAY;
  const otherPlans = [
    ...new Set([...sales.map((m) => m.plan), ...(refunds ?? []).map((r) => r.plan)]),
  ].filter((p) => !isFull({ plan: p }) && !isPre({ plan: p }));
  const isPreHere = (m: Sold) => isPre(m) && !retiredPts(m);
  // The route reads who saw the page only over a range that reaches its switch-on: null there
  // means the read failed (twice), and Paywall shown says so.
  const seenUnread = input.gateSeen === null && !beforeGate;
  const reachOf = (xs: SubFact[]): Reach =>
    halvesWhy
      ? NO_REACH
      : {
          shown: shownOf(xs),
          base: xs.length,
          baseOf: noun(xs.length, "finisher", "finishers"),
          unread: seenUnread,
        };
  // A switch that couldn't be read is never read as off.
  const gateLine = beforeGate
    ? `On sale from ${gateDay}`
    : gateOn
      ? (halvesWhy ?? "")
      : input.gateOn === false
        ? "The €1.99 gate is switched off"
        : "The €1.99 gate's switch couldn't be read";
  const priceLine = beforeTest
    ? "On sale with the price test, from 26 Nov 2026"
    : priceOn
      ? (halvesWhy ?? "")
      : input.priceOn === false
        ? "The price test is switched off"
        : "The price test's switch couldn't be read";
  const ptsRow = typeRow(
    "pay-to-start",
    "Pay to start (retired)",
    "Retired 27 Nov 2026: the purchases made on its pages, and what their readers bought later",
    false,
    retiredPts
  );
  const types: PaymentTypeRow[] = [
    ...(splitWhy
      ? [typeRow("pre", "Pre-unlock", splitWhy, gateOn || priceOn, isPreHere)]
      : [
          typeRow(
            "pre-fixed",
            "Pre-unlock · fixed €1.99",
            gateLine,
            gateOn && !beforeGate,
            (m) => isPreHere(m) && !chose(m),
            reachOf(fixedFinishers)
          ),
          typeRow(
            "pre-choose",
            "Pre-unlock · choose your price",
            priceLine,
            priceOn,
            (m) => isPreHere(m) && chose(m),
            reachOf(chooseFinishers)
          ),
        ]),
    typeRow(
      "full",
      "Full report on the report",
      "",
      true,
      (m) => isFull(m) && !retiredPts(m) && !m.upgrade,
      {
        shown: null,
        base: freeFinishers.length,
        baseOf: noun(freeFinishers.length, "finisher", "finishers"),
      }
    ),
    typeRow(
      "upgrade",
      "Full report after a pre-unlock",
      beforeGate ? `On sale from ${gateDay}` : "",
      (gateOn || priceOn) && !beforeGate,
      (m) => isFull(m) && !retiredPts(m) && m.upgrade === true,
      {
        shown: preBuyers,
        base: preBuyers,
        baseOf: noun(preBuyers, "pre-unlock buyer", "pre-unlock buyers"),
      }
    ),
    ...otherPlans.map((p) =>
      typeRow(
        `plan-${p ?? "none"}`,
        p === "essentials" ? "Essentials (retired)" : (p ?? "Plan not recorded"),
        "",
        true,
        (x) => x.plan === p && !retiredPts(x)
      )
    ),
    // Retired: only where the range has its sales or refunds.
    ...(ptsRow.live ? [ptsRow] : []),
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
          ? `From ${rangeLabel(CHECKOUT_FROM, CHECKOUT_FROM)}, when paid checkout began: nothing was sold before.`
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
    priceTest: buildPriceTest({
      subs,
      rows: input.priceRows ?? null,
      choices: input.priceChoices ?? null,
      gateSeen: input.gateSeen ?? null,
      blocked: tablet,
      to: facts.to,
    }),
  };
}

export { dayCount as _dayCount };
