/**
 * Assessment A · Payment (Marcus's artboard of 16 Oct 2026): who pays, how, at what price, and
 * what each pricing test did. Nine headline figures, paid sales over time by unlock type,
 * checkout success and payment methods, who pays by segment, the pricing tests and the personal
 * price factors, and a price-elasticity model fitted to the range's months.
 *
 * Money is the payment ledger (succeeded, not a test, staff out), by payment day; "who pays" and
 * the payment CVR are cohort figures (the range's finishers and what they bought so far).
 */
import {
  getPricingBucketsForPlan,
  personalPriceFactors,
} from "@features/pricing/logic/reportPricing";
import { PRICE_TEST_START_DAY } from "@features/checkout/server/reportPurchase";

import { addDays, shortDate } from "./days";
import {
  classifySource,
  deviceClass,
  FULL_PLANS,
  PRE_PLANS,
  type CheckoutFact,
  type Facts,
  type MoneyFact,
  type SubFact,
} from "./facts";
import {
  buckets,
  dayCount,
  grainOf,
  rangeLabel,
  SOURCES,
  TIERS,
  trendBuckets,
  type ApFilters,
  type Grain,
} from "./filters";
import { head, type PageHead, type Tile } from "./common";
import { assessmentScope } from "./assessment";
import { inScope, launched, ratio, salesIn, subsIn, tabletBlocked, type Scope } from "./metrics";
import { genderShort, relationshipShort } from "./traffic";

export interface OverTimeRow {
  label: string;
  /** Cut short by the range (a part of a week or month). */
  partial: boolean;
  preSales: number;
  preRevenue: number;
  fullSales: number;
  fullRevenue: number;
  /** All paid sales' revenue (a retired plan's too). */
  revenue: number;
  finishers: number;
}

export interface CheckoutPoint {
  label: string;
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
  /** "€29.99 full · €39.99 all" or a range. */
  basePrice: string;
  paywallViews: number | null;
  checkouts: number;
  paidSales: number;
  revenue: number;
  /** For the AOV test: each sale's amount. */
  aovLift: number | null;
  aovConfidence: number | null;
  /** Why the AOV comparison is blank. */
  aovWhy: string | null;
}

export interface Elasticity {
  /** The range's months with a full-unlock sale: average price paid and payment CVR. */
  points: Array<{ label: string; price: number; cvr: number; sales: number; finishers: number }>;
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
  tiles: Tile[];
  overTime: { grain: Grain; rows: OverTimeRow[]; preOnSale: boolean };
  checkout: {
    reached: number;
    attempted: number;
    paid: number;
    points: CheckoutPoint[];
    methods: MethodRow[];
    sales: number;
    why: string | null;
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
}

/** The per-visitor price switch, as system_flags holds it; null when it couldn't be read. */
export interface UpliftFlag {
  enabled: boolean;
  updatedAt: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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

/** Welch's t-test as a normal approximation: B against A on their means. */
export function welch(
  a: number[],
  b: number[]
): { lift: number | null; confidence: number | null } {
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  if (a.length < 2 || b.length < 2) return { lift: null, confidence: null };
  const ma = mean(a);
  const mb = mean(b);
  const va = a.reduce((s, v) => s + (v - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, v) => s + (v - mb) ** 2, 0) / (b.length - 1);
  const se = Math.sqrt(va / a.length + vb / b.length);
  const lift = ma > 0 ? mb / ma - 1 : null;
  if (se === 0) return { lift, confidence: null };
  const z = Math.abs((mb - ma) / se);
  // Two-sided: 1 − p.
  const t = 1 / (1 + 0.3275911 * (z / Math.SQRT2));
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return { lift, confidence: erf };
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
}): PaymentPayload {
  const { facts, filters: f, today, now, uplift } = input;
  const scope: Scope = assessmentScope(f);
  const on = launched(scope);
  const tablet = tabletBlocked(scope, facts.from);
  const subs = tablet ? [] : subsIn(facts, scope);
  const sales = tablet ? [] : salesIn(facts, scope);
  const gifts = tablet
    ? []
    : facts.money.filter((m) => m.amount <= 0 && inScope(m, scope) && classifySource(m) !== "test");
  const isFull = (m: { plan: string | null }) => FULL_PLANS.has(m.plan ?? "");
  const isPre = (m: { plan: string | null }) => PRE_PLANS.has(m.plan ?? "");
  const preOnSale = PRE_PLANS.size > 0;
  const sum = (ms: MoneyFact[]) => round2(ms.reduce((n, m) => n + m.amount, 0));
  const count = (n: number) => n.toLocaleString("en-US");
  const payers = subs.filter((s) => s.paidAt).length;
  const checkouts = tablet
    ? []
    : facts.checkouts.filter((c) => inScope(c, scope) && classifySource(c) !== "test");
  const reached = checkouts.reduce((n, c) => n + c.n, 0);
  const paidCheckouts = checkouts
    .filter((c) => c.status === "succeeded")
    .reduce((n, c) => n + c.n, 0);
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
      preOnSale ? pre.length : null,
      preOnSale ? "Initial plan" : "Initial plan · not on sale yet",
      preOnSale ? sparkOf((a, b) => salesBetween(a, b).filter(isPre).length) : []
    ),
    tile(
      "pre-cvr",
      "Pre-unlock CVR",
      "pct",
      preOnSale ? ratio(pre.length, subs.length) : null,
      `of ${count(subs.length)} submissions`,
      preOnSale
        ? sparkOf((a, b) =>
            ratio(salesBetween(a, b).filter(isPre).length, subsBetween(a, b).length)
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
    tile(
      "full-cvr",
      "Full-unlock CVR",
      "pct",
      ratio(full.length, subs.length),
      `of ${count(subs.length)} submissions`,
      sparkOf((a, b) => ratio(salesBetween(a, b).filter(isFull).length, subsBetween(a, b).length))
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
    tile(
      "pay-cvr",
      "Payment CVR",
      "pct",
      ratio(payers, subs.length),
      `${count(payers)} of ${count(subs.length)} finishers`,
      sparkOf((a, b) => {
        const xs = subsBetween(a, b);
        return ratio(xs.filter((s) => s.paidAt).length, xs.length);
      })
    ),
    tile(
      "checkout",
      "Checkout success",
      "pct",
      ratio(paidCheckouts, reached),
      `${count(paidCheckouts)} of ${count(reached)} reached the payment page`,
      sparkOf((a, b) => {
        const xs = checkouts.filter((c) => c.day >= a && c.day <= b);
        return ratio(
          xs.filter((c) => c.status === "succeeded").reduce((n, c) => n + c.n, 0),
          xs.reduce((n, c) => n + c.n, 0)
        );
      })
    ),
  ];
  // Coloured as the design colours a month's success: green from 30%, red below.
  const success = ratio(paidCheckouts, reached);
  if (success !== null) tiles[8]!.noteTone = success >= 0.3 ? "good" : "bad";

  // ---- over time: whole months beyond four months, weeks below, days under two weeks
  const grain = grainOf(facts.from, facts.to);
  const points = buckets(facts.from, facts.to, grain);
  const partialLabel = (b: { label: string; full: boolean; from: string; to: string }) =>
    b.full ? b.label : `${b.label} (${shortDate(b.from)}–${shortDate(b.to)})`;
  const overTime: OverTimeRow[] = points.map((b) => {
    const xs = salesBetween(b.from, b.to);
    return {
      label: grain === "day" ? b.label : partialLabel(b),
      partial: !b.full,
      preSales: xs.filter(isPre).length,
      preRevenue: sum(xs.filter(isPre)),
      fullSales: xs.filter(isFull).length,
      fullRevenue: sum(xs.filter(isFull)),
      revenue: sum(xs),
      finishers: subsBetween(b.from, b.to).length,
    };
  });

  // ---- checkout and payment methods
  const checkoutPoints: CheckoutPoint[] = points.map((b) => {
    const xs = checkouts.filter((c) => c.day >= b.from && c.day <= b.to);
    return {
      label: grain === "day" ? b.label : partialLabel(b),
      partial: !b.full,
      reached: xs.reduce((n, c) => n + c.n, 0),
      attempted: xs.filter((c) => c.attempted).reduce((n, c) => n + c.n, 0),
      paid: xs.filter((c) => c.status === "succeeded").reduce((n, c) => n + c.n, 0),
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

  // ---- who pays (the range's finishers, what they bought so far)
  const segment = (
    key: string,
    label: string,
    valueOf: (s: SubFact) => string,
    order?: string[]
  ): SegmentTable => {
    const groups = new Map<string, SubFact[]>();
    for (const s of subs) {
      const v = valueOf(s);
      groups.set(v, [...(groups.get(v) ?? []), s]);
    }
    const keys = order
      ? [
          ...order.filter((k) => groups.has(k)),
          ...[...groups.keys()].filter((k) => !order.includes(k)),
        ]
      : [...groups.keys()].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);
    return {
      key,
      label,
      rows: keys.map((k) => {
        const xs = groups.get(k)!;
        const fullBuyers = xs.filter((s) => s.full);
        const fullSalesN = fullBuyers.reduce((n, s) => n + s.sales, 0);
        return {
          label: k,
          finishers: xs.length,
          sales: xs.reduce((n, s) => n + s.sales, 0),
          preCvr: preOnSale ? 0 : null,
          preAvg: null,
          fullCvr: ratio(fullBuyers.length, xs.length),
          fullAvg: ratio(round2(fullBuyers.reduce((n, s) => n + s.revenue, 0)), fullSalesN),
          revenue: round2(xs.reduce((n, s) => n + s.revenue, 0)),
        };
      }),
      note: "",
    };
  };
  const sourceLabel = (s: SubFact) => {
    const c = classifySource(s);
    return SOURCES.find((o) => o.value === c)?.label ?? "Unknown";
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
    segment("device", "Device / OS", deviceOf, [
      "iOS",
      "Android",
      "Desktop",
      "Tablet",
      "Not recorded",
    ]),
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
  const notes: Record<string, string> = {
    gender: "The range's survey finishers by their answer, and what they bought so far.",
    age: "The range's survey finishers by their age band (question 15003), and what they bought so far.",
    relationship:
      "The range's survey finishers by their relationship answer, and what they bought so far.",
    country: "The country the finisher gave in the survey. Smaller countries are at the bottom.",
    device: "The device the price quote (or, before a quote, the survey) recorded.",
    tier: "The price tier of the finisher's price quote: made when the report opens, so a finisher who never opened it has none.",
    source: "Where the finisher's first page came from (the survey's tracker).",
  };
  for (const t of segments) t.note = notes[t.key] ?? "";

  // ---- the pricing tests: arms as stamped on each checkout and payment
  const listPrice = (arm: "A3" | "B3") => {
    const full = getPricingBucketsForPlan("full_report").find((b) => b.code === arm);
    const all = getPricingBucketsForPlan("all_reports").find((b) => b.code === arm);
    return `${full ? `€${(full.startingCents / 100).toFixed(2)} full` : ""}${all ? ` · €${(all.startingCents / 100).toFixed(2)} all` : ""}`;
  };
  const armWindow = (from: string, to: string | null) => {
    const a = facts.from > from ? facts.from : from;
    const lastDay = to ?? addDays(today, -1);
    const b = facts.to < lastDay ? facts.to : lastDay;
    return a > b ? null : { from: a, to: b };
  };
  const armRows = (
    test: string,
    window: { from: string; to: string | null },
    note: string,
    arms: Array<{ arm: string; name: string; basePrice: (cs: CheckoutFact[]) => string }>,
    paywall: ((arm: string, w: { from: string; to: string }) => number) | null
  ): PricingArmRow[] => {
    const w = armWindow(window.from, window.to);
    const amounts = arms.map((a) =>
      w
        ? sales
            .filter((m) => m.priceArm === a.arm && m.day >= w.from && m.day <= w.to)
            .map((m) => m.amount)
        : []
    );
    const t = welch(amounts[0]!, amounts[1]!);
    return arms.map((a, i) => {
      const cs = w
        ? checkouts.filter((c) => c.priceArm === a.arm && c.day >= w.from && c.day <= w.to)
        : [];
      return {
        test,
        note: w ? note : `${note} · not in this range`,
        arm: a.name,
        control: i === 0,
        basePrice: a.basePrice(cs),
        paywallViews: w && paywall ? paywall(a.arm, w) : null,
        checkouts: cs.reduce((n, c) => n + c.n, 0),
        paidSales: amounts[i]!.length,
        revenue: round2(amounts[i]!.reduce((n, v) => n + v, 0)),
        aovLift: i === 0 ? null : t.lift,
        aovConfidence: i === 0 ? null : t.confidence,
        aovWhy:
          i === 0
            ? null
            : !w
              ? "Not in this range"
              : amounts[0]!.length < 2 || amounts[1]!.length < 2
                ? "Too few sales to compare"
                : null,
      };
    });
  };
  const PRICING_2_END = "2026-08-31";
  const pricingArms: PricingArmRow[] = [
    ...armRows(
      "Pricing 2.x",
      { from: "2026-05-01", to: PRICING_2_END },
      "May – Aug 2026 · ended 31 Aug",
      [
        { arm: "A", name: "A", basePrice: () => "personalised" },
        { arm: "B", name: "B", basePrice: () => "personalised" },
      ],
      null
    ),
    ...armRows(
      "Pricing 3.0",
      { from: PRICE_TEST_START_DAY, to: null },
      `Live · from ${rangeLabel(PRICE_TEST_START_DAY, PRICE_TEST_START_DAY)}`,
      [
        { arm: "A3", name: "A3", basePrice: () => listPrice("A3") },
        { arm: "B3", name: "B3", basePrice: () => listPrice("B3") },
      ],
      // Saw the paywall: the range's finishers since the arms were set, by their own quote's arm.
      (arm, w) =>
        subs.filter(
          (s) =>
            s.priceArm === arm && s.day >= w.from && s.day <= w.to && (s.paywallAt || s.clickedAt)
        ).length
    ),
  ];
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
        key: x.key.charAt(0).toUpperCase() + x.key.slice(1),
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

  // ---- price elasticity: the range's months with a full-unlock sale
  const months = buckets(facts.from, facts.to, "month");
  const elPoints = months
    .map((b) => {
      const xs = salesBetween(b.from, b.to).filter(isFull);
      const fin = subsBetween(b.from, b.to).length;
      return {
        label: b.full ? b.label : `${b.label} (${shortDate(b.from)}–${shortDate(b.to)})`,
        price: xs.length ? round2(sum(xs) / xs.length) : 0,
        cvr: fin ? xs.length / fin : 0,
        sales: xs.length,
        finishers: fin,
      };
    })
    .filter((p) => p.sales > 0 && p.finishers > 0);
  const fit = fitElasticity(elPoints);
  const elasticity: Elasticity = {
    points: elPoints,
    fit,
    cap: elPoints.length ? Math.max(...elPoints.map((p) => p.cvr)) : null,
    why: fit
      ? null
      : `The model needs three months in the range with a full unlock sold; ${elPoints.length === 0 ? "none has one" : `${elPoints.length} ${elPoints.length === 1 ? "has" : "have"} one`}. Pick a longer range (Last 12 months).`,
    today: (["A3", "B3"] as const).flatMap((arm) => {
      const b = getPricingBucketsForPlan("full_report").find((x) => x.code === arm);
      return b ? [{ arm, price: b.startingCents / 100 }] : [];
    }),
  };

  return {
    ...head(f, today, now),
    launched: on,
    tiles,
    overTime: { grain, rows: overTime, preOnSale },
    checkout: {
      reached,
      attempted: checkouts.filter((c) => c.attempted).reduce((n, c) => n + c.n, 0),
      paid: paidCheckouts,
      points: checkoutPoints,
      methods,
      sales: sales.length,
      why: tablet,
    },
    segments,
    pricing: {
      arms: pricingArms,
      factors: {
        on: uplift ? uplift.enabled : null,
        since: uplift?.updatedAt ?? null,
        groups: factorGroups,
      },
    },
    elasticity,
  };
}

export { dayCount as _dayCount };
