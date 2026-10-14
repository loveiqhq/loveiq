/**
 * The Assessment A dashboard (Marcus's "Dashboard, traffic, payment" artboard): ten headline
 * tiles, the scorecard every assessment is run against (Product Vision & Playbook, 13 Oct
 * 2026), the journey step by step, traffic per source, and sales per plan and price.
 */
import type { AdCost } from "@features/brain/server/ingest/analytics";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";

import { classifySource, deviceClass, type Facts } from "./facts";
import { bucketCaption, grainOf, trendBuckets, type ApFilters } from "./filters";
import { shortDate } from "./days";
import type { Unit } from "./format";
import {
  launched,
  ratio,
  spend,
  spendBlocked,
  startsBlocked,
  comparableStarts,
  startsComplete,
  subsIn,
  totals,
  trend,
  visitsBlocked,
  type Scope,
  type Totals,
  ageMatched,
  sameAge,
} from "./metrics";
import {
  head,
  readMedianMs,
  SOURCE_ROWS,
  spendCoverage,
  type PageHead,
  type Table,
  type Tile,
} from "./overview";
import type { NewReturning, PostHogResult } from "./posthog";

export interface ScoreRow {
  group: string;
  label: string;
  unit: Unit;
  value: number | null;
  /** What it is, or why it is blank. */
  note: string;
}

export interface JourneyStep {
  n: number;
  label: string;
  value: number | null;
  /** Share of the step before, in words: "9.06% of visits". */
  step: string;
  href: string;
}

export interface PriceRow {
  plan: string;
  planLabel: string;
  price: number | null;
  priceArm: string | null;
  quoted: number;
  checkouts: number;
  sales: number;
  cvr: number | null;
  revenue: number;
}

export interface DashboardPayload extends PageHead {
  launched: boolean;
  /** Questions the live survey asks, for the description. */
  questions: number;
  tiles: Tile[];
  scorecard: ScoreRow[];
  journey: JourneyStep[];
  sources: Table;
  performance: Array<{
    label: string;
    completion: number | null;
    paymentCvr: number | null;
    perSub: number | null;
  }>;
  newReturning: PostHogResult<NewReturning> | null;
  prices: PriceRow[];
}

const PLAN_LABELS: Record<string, string> = {
  full_report: "Full report",
  all_reports: "All 14 archetypes",
  essentials: "Essentials (retired)",
  core: "Core (retired)",
};

/** The scope of an Assessment A page: always A, whatever the assessment filter says. */
export function assessmentScope(f: ApFilters): Scope {
  return {
    assessment: "a",
    source: f.source,
    device: f.device,
    tier: f.tier,
  };
}

export function buildDashboard(input: {
  facts: Facts;
  previous: Facts | null;
  ad: AdCost;
  filters: ApFilters;
  today: string;
  now: Date;
  newReturning: PostHogResult<NewReturning> | null;
}): DashboardPayload {
  const { facts, previous, ad, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  const t = totals(facts, scope);
  // The earlier period at the same age as this one, so "so far" rates compare like with like.
  const prevAged = previous ? ageMatched(previous, sameAge(facts, previous, now)) : null;
  const pRaw = prevAged ? totals(prevAged, scope) : null;
  const startsOk = startsComplete(facts.from, today, scope);
  const p: Totals | null = comparableStarts(pRaw, facts.from, previous?.from ?? null, today, scope);
  const sNow = spend(ad, scope, facts.from, facts.to);
  // Spend is compared only when both periods have every day of it: a partial total reads low.
  const sPrevRaw = previous ? spend(ad, scope, previous.from, previous.to) : null;
  const sPrev =
    sPrevRaw && !(sPrevRaw.complete && sNow.complete) ? { ...sPrevRaw, eur: null } : sPrevRaw;
  const partialSpend = !sNow.complete && sNow.eur !== null ? ` (${spendCoverage(sNow)})` : "";
  const caption = bucketCaption(facts.from, facts.to);
  const vB = visitsBlocked(scope);
  const stB = startsBlocked(scope, facts.from, today);
  const spB = spendBlocked(scope);
  const cac = (s: { eur: number | null }, x: Totals) =>
    s.eur === null ? null : ratio(s.eur, x.payers);
  const prevCac = sPrev && p ? cac(sPrev, p) : null;
  const tile = (
    key: string,
    label: string,
    unit: Unit,
    pick: (x: Totals) => number | null,
    foot: (x: Totals) => string,
    opts: {
      blocked?: string | null;
      goodWhen?: "up" | "down";
      spark?: Array<number | null>;
      value?: number | null;
      prev?: number | null;
      deltaAs?: "abs";
      trend?: string;
    } = {}
  ): Tile => ({
    key,
    label,
    unit,
    value: opts.value !== undefined ? opts.value : pick(t),
    prev: opts.prev !== undefined ? opts.prev : p ? pick(p) : null,
    goodWhen: opts.goodWhen ?? "up",
    spark: opts.spark ?? trend(facts, scope, (x) => pick(x)),
    foot: foot(t),
    blocked: opts.blocked ?? null,
    trend: opts.trend ?? caption,
    ...(opts.deltaAs ? { deltaAs: opts.deltaAs } : {}),
  });
  // A sale is rare: with one period holding all of them, the line is flat and says which.
  const aovSpark = trend(facts, scope, (x) => ratio(x.revenue, x.sales));
  const saleBuckets = trendBuckets(facts.from, facts.to).filter((_b, i) => aovSpark[i] != null);
  const onlyBucket = saleBuckets.length === 1 ? saleBuckets[0]! : null;
  const grain = grainOf(facts.from, facts.to);
  const count = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
  const eur = (n: number | null, d = 2) =>
    n === null
      ? "—"
      : `€${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

  const tiles: Tile[] = [
    tile(
      "visits",
      "Visitors",
      "count",
      (x) => x.visits,
      () => (p?.visits != null ? `vs ${count(p.visits)}` : "Unique daily visits"),
      { blocked: vB }
    ),
    tile(
      "start-cvr",
      "Survey start CVR",
      "pct",
      (x) => ratio(x.starts, x.visits),
      (x) => `${count(x.starts)} starts${startsOk ? "" : " · may be low (before 18 Sep 2026)"}`,
      {
        blocked: vB ?? stB,
        // Weeks whose starts are not all recorded have no point, rather than a low one.
        spark: trend(facts, scope, (x, from) =>
          startsComplete(from, today, scope) ? ratio(x.starts, x.visits) : null
        ),
      }
    ),
    tile(
      "complete-cvr",
      "Survey complete CVR",
      "pct",
      (x) => ratio(x.subs, x.visits),
      (x) => `${count(x.subs)} submissions`,
      { blocked: vB }
    ),
    tile(
      "pay-cvr",
      "Payment CVR",
      "pct",
      (x) => ratio(x.paidCohort, x.subs),
      (x) => `of submissions · ${x.paidCohort} paid so far`
    ),
    tile(
      "rev-visit",
      "€ rev. per visit",
      "eur3",
      (x) => ratio(x.revenue, x.visits),
      () => (p ? `vs ${eur(ratio(p.revenue, p.visits), 3)}` : ""),
      {
        blocked: vB,
      }
    ),
    tile(
      "rev-sub",
      "€ rev. per survey complete",
      "eur3",
      (x) => ratio(x.revenue, x.subs),
      (x) =>
        p
          ? `vs ${eur(ratio(p.revenue, p.subs), 3)} · ${count(x.subs)} submissions`
          : `${count(x.subs)} submissions`
    ),
    tile(
      "revenue",
      "Revenue",
      "eur",
      (x) => x.revenue,
      () => (p ? `vs ${eur(p.revenue)}` : "")
    ),
    tile(
      "aov",
      "Avg. payment",
      "eur",
      (x) => ratio(x.revenue, x.sales),
      (x) =>
        `${p ? `vs ${eur(ratio(p.revenue, p.sales))} · ` : ""}${x.sales} sale${x.sales === 1 ? "" : "s"}${p ? ` vs ${p.sales}` : ""}`,
      {
        deltaAs: "abs",
        ...(onlyBucket
          ? {
              spark: aovSpark.map(() => aovSpark.find((v) => v != null) ?? null),
              trend: `${caption.split(" · ")[0]} · only ${
                grain === "day"
                  ? shortDate(onlyBucket.from)
                  : grain === "week"
                    ? `the week of ${shortDate(onlyBucket.from)}`
                    : `the month from ${shortDate(onlyBucket.from)}`
              } had a sale`,
            }
          : {}),
      }
    ),
    tile(
      "cac",
      "CAC (paid)",
      "eur",
      () => cac(sNow, t),
      () =>
        sNow.eur === null
          ? "Google Ads spend ÷ paying customers"
          : `${prevCac !== null ? `vs ${eur(prevCac)} · ` : ""}spend ${eur(sNow.eur, 0)}${partialSpend}`,
      {
        blocked: spB,
        goodWhen: "down",
        deltaAs: "abs",
        value: cac(sNow, t),
        prev: prevCac,
        spark: trend(facts, scope, (x, from, to) => {
          const sp = spend(ad, scope, from, to);
          const s = sp.complete ? sp.eur : null;
          return s === null ? null : ratio(s, x.subs);
        }),
      }
    ),
    tile(
      "open-rate",
      "Report open rate",
      "pct",
      (x) => ratio(x.opened, x.subs),
      (x) => `${count(x.opened)} of ${count(x.subs)}`
    ),
  ];
  // The CAC tile's line is spend per submission (a sale is too rare to draw), so its caption says so.
  tiles[8]!.trend = `${caption} · line: € per submission`;

  const read = readMedianMs(facts, scope);
  const subs = subsIn(facts, scope);
  const scorecard: ScoreRow[] = [
    {
      group: "Funnel",
      label: "Start CVR",
      unit: "pct",
      value: ratio(t.starts, t.visits),
      note: "survey starts ÷ visits",
    },
    {
      group: "Funnel",
      label: "Completion CVR",
      unit: "pct",
      value: ratio(t.startsFinished, t.starts),
      note: "of the starts, finished",
    },
    {
      group: "Funnel",
      label: "Payment CVR",
      unit: "pct",
      value: ratio(t.paidCohort, t.subs),
      note: "of the submissions, paid so far",
    },
    {
      group: "Economics",
      label: "CAC",
      unit: "eur",
      value: cac(sNow, t),
      note: `Google Ads spend ÷ paying customers${partialSpend}`,
    },
    {
      group: "Economics",
      label: "ROAS",
      unit: "ratio",
      value: sNow.eur ? ratio(t.revenue, sNow.eur) : null,
      note: `revenue ÷ ad spend (1.0 = break-even on the first purchase)${partialSpend}`,
    },
    {
      group: "Economics",
      label: "CLV",
      unit: "eur",
      value: ratio(t.revenue, t.payers),
      note: "revenue per paying customer; one purchase each so far, so it equals the average order",
    },
    {
      group: "Engagement",
      label: "Assessment airtime",
      unit: "mmss",
      value: t.surveyMedianMs,
      note: "median time to finish the survey",
    },
    {
      group: "Engagement",
      label: "Report airtime",
      unit: "mmss",
      value: read,
      note: "median reading time per reader, where recorded",
    },
    {
      group: "Engagement",
      label: "Patient Hub sign-up rate",
      unit: "pct",
      value: null,
      note: "the Patient Hub has not launched",
    },
    {
      group: "Expansion",
      label: "Patient Hub CVR",
      unit: "pct",
      value: null,
      note: "the Patient Hub has not launched",
    },
    {
      group: "Expansion",
      label: "Cross-sell CVR",
      unit: "pct",
      value: null,
      note: "one assessment live, nothing to cross-sell yet",
    },
    {
      group: "Expansion",
      label: "Intervention / affiliation CVR",
      unit: "pct",
      value: null,
      note: "no interventions or affiliate offers yet",
    },
    {
      group: "Product quality",
      label: "NPS",
      unit: "count",
      value: null,
      note: "no recommend-us question is asked yet",
    },
    {
      group: "Product quality",
      label: "Virality",
      unit: "pct",
      value: ratio(subs.filter((s) => s.openedAt && (s.shared || s.invited)).length, t.opened),
      note: "of the readers, shared their report or invited a friend",
    },
  ];

  // Hrefs are relative to the assessment's dashboard; the page adds the filters.
  const journey: JourneyStep[] = [
    { n: 1, label: "Landing page", value: t.visits, step: "entry · visits", href: "landing" },
    {
      n: 2,
      label: "Assessment page",
      value: null,
      step: "the landing page is A's assessment page",
      href: "landing#assessment-page",
    },
    {
      n: 3,
      label: "Survey start",
      value: t.starts,
      step: `${pct(ratio(t.starts, t.visits))} of visits`,
      href: "survey",
    },
    {
      n: 4,
      label: "Submitted",
      value: t.subs,
      step: `${pct(ratio(t.startsFinished, t.starts))} of starts finish`,
      href: "survey",
    },
    {
      n: 5,
      label: "Report opened",
      value: t.opened,
      step: `${pct(ratio(t.opened, t.subs))} of submits`,
      href: "report",
    },
    {
      n: 6,
      label: "Paywall reached",
      value: t.paywall,
      step: `${pct(ratio(t.paywall, t.opened))} of opens`,
      href: "report",
    },
    {
      n: 7,
      label: "Paid",
      value: t.paidCohort,
      step: `${pct(ratio(t.paidCohort, t.paywall))} of paywall`,
      href: "#payment",
    },
  ];

  const bySource = SOURCE_ROWS.map((s) => {
    const sc = { ...scope, source: s.value };
    const x = totals(facts, sc);
    return { ...s, x };
  }).filter((s) => (s.x.starts ?? 0) > 0 || s.x.subs > 0);
  const allStarts = t.starts;
  const maxStarts = Math.max(1, ...bySource.map((s) => s.x.starts ?? 0));
  const sources: Table = {
    barLabel: "Share of starts",
    columns: [
      { label: "Source", unit: "text" },
      { label: "Starts", unit: "count" },
      { label: "Share", unit: "pct" },
      { label: "Submissions", unit: "count" },
      { label: "Completion", unit: "pct" },
      { label: "Paid", unit: "count" },
      { label: "€ / submission", unit: "eur3" },
    ],
    rows: bySource.map((s) => ({
      label: s.label,
      values: [
        s.x.starts,
        f.source === "all" ? ratio(s.x.starts, allStarts) : null,
        s.x.subs,
        ratio(s.x.startsFinished, s.x.starts),
        s.x.paidCohort,
        ratio(s.x.revenue, s.x.subs),
      ],
      bar: (s.x.starts ?? 0) / maxStarts,
    })),
    note: `Visits are not split by source: the visit log misses most ad clicks. ${startsBlocked({ ...scope, source: "google_ads" }, facts.from, today) ?? "Starts, submissions and payments carry the source the survey recorded; revenue by payment day."}`,
  };

  const performance = bySource.map((s) => ({
    label: s.label,
    completion: ratio(s.x.startsFinished, s.x.starts),
    paymentCvr: ratio(s.x.paidCohort, s.x.subs),
    perSub: ratio(s.x.revenue, s.x.subs),
  }));

  // Sales per plan and price: of the prices quoted in the range, the checkouts and sales on
  // them. The narrowing filters apply by the reader's own source, device and tier.
  const priceMap = new Map<string, PriceRow>();
  for (const qf of facts.quotes) {
    if (!launched(scope)) break;
    if (scope.source !== "all" && classifySource(qf) !== scope.source) continue;
    if (scope.device !== "all" && deviceClass(qf.device) !== scope.device) continue;
    if (scope.tier !== "all" && qf.tier !== scope.tier) continue;
    if (classifySource(qf) === "test") continue;
    const plan = qf.plan ?? "unknown";
    const key = `${plan}|${qf.price ?? ""}|${qf.priceArm ?? ""}`;
    const row =
      priceMap.get(key) ??
      ({
        plan,
        planLabel: PLAN_LABELS[plan] ?? plan,
        price: qf.price,
        priceArm: qf.priceArm,
        quoted: 0,
        checkouts: 0,
        sales: 0,
        cvr: null,
        revenue: 0,
      } satisfies PriceRow);
    row.quoted += qf.quoted;
    row.checkouts += qf.checkouts;
    row.sales += qf.sales;
    row.revenue = Math.round((row.revenue + qf.revenue) * 100) / 100;
    priceMap.set(key, row);
  }
  const prices = [...priceMap.values()]
    .map((r) => ({ ...r, cvr: ratio(r.sales, r.quoted) }))
    .sort((a, b) => a.plan.localeCompare(b.plan) || (a.price ?? 0) - (b.price ?? 0));

  return {
    ...head(f, today, now),
    launched: launched(scope),
    questions: askedQuestions(80).length,
    tiles,
    scorecard,
    journey,
    sources,
    performance,
    newReturning: input.newReturning,
    prices,
  };
}

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(v * 100 >= 10 ? 1 : 2)}%`;
}
