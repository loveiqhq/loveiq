/**
 * The Assessment A dashboard (Marcus's "Dashboard, traffic, payment" artboard): ten headline
 * tiles, the scorecard every assessment is run against (Product Vision & Playbook, 13 Oct
 * 2026), the journey step by step, traffic per source, and sales per plan and price.
 */
import type { AdCost } from "@features/brain/server/ingest/analytics";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";

import { classifySource, deviceClass, type Facts } from "./facts";
import {
  beforeData,
  bucketCaption,
  grainOf,
  rangeLabel,
  trendBuckets,
  type ApFilters,
  type Period,
} from "./filters";
import { shortDate } from "./days";
import { fmt, lowerFirst, type GoodWhen, type Unit } from "./format";
import {
  launched,
  LATE_SOURCES,
  SOURCE_FROM,
  lateSourceNote,
  PAYWALL_SEEN_FROM,
  peopleBlocked,
  ratio,
  spend,
  startsBlocked,
  comparableStarts,
  startsComplete,
  STARTS_INCOMPLETE,
  subsIn,
  totals,
  trend,
  visitsBlocked,
  type Scope,
  type Totals,
  ageMatched,
  sameAge,
  type PageAdCost,
} from "./metrics";
import {
  head,
  readMedianMs,
  SOURCE_ROWS,
  spendCoverage,
  visitorSplit,
  type PageHead,
  type Table,
  type Tile,
} from "./common";
import type { NewReturning, PostHogResult, SessionTags } from "./posthog";

/** A figure's parts as the page prints them, for its info card ("502 ÷ 12,608 = 3.98%"). */
export interface Worked {
  num?: string;
  den?: string;
  value: string;
}

/** A headline tile with its info card's field key (features/admin/ui/ap/fields/assessment.ts). */
export type DashTile = Tile & { info: string; worked?: Worked };

export interface ScoreRow {
  group: string;
  label: string;
  unit: Unit;
  value: number | null;
  /** What it is, or why it is blank. */
  note: string;
  /** Its info card's field key; none on a KPI nothing measures yet. */
  info?: string;
  worked?: Worked;
}

export interface JourneyStep {
  n: number;
  label: string;
  value: number | null;
  /** Share of the step before, in words: "9.06% of visits". */
  step: string;
  href: string;
  /** Its info card's field key; none on step 2, which has no figure of its own. */
  info?: string;
  worked?: Worked;
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
  /** The range in the header's words: "last 30 days vs previous 30", dates for a custom one. */
  rangeText: string;
  tiles: DashTile[];
  scorecard: ScoreRow[];
  journey: JourneyStep[];
  /** What some journey steps can't show for this range, or null. */
  journeyNote: string | null;
  sources: Table;
  /** Per source, over its estimated visitors (blank with sources' note when they are). */
  performance: Array<{ label: string; surveyCvr: number | null; perVisit: number | null }>;
  newReturning: PostHogResult<NewReturning> | null;
  /** Payments in the range by each of newReturning's groups, for € per visit. */
  newReturningRevenue: PostHogResult<{ new: number; returning: number }> | null;
  prices: PriceRow[];
  /** Why the prices table is empty under the filters, or null. */
  pricesBlocked: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  full_report: "Full",
  all_reports: "Full All",
  essentials: "Essentials (retired)",
  core: "Core (retired)",
};

const PRESET_TEXT: Record<Exclude<Period, "custom" | "today">, [string, string]> = {
  "7d": ["last 7 days", "previous 7"],
  "30d": ["last 30 days", "previous 30"],
  "90d": ["last 90 days", "previous 90"],
  "12m": ["last 12 months", "previous 12 months"],
};

/**
 * The header's range, as the design writes it: a preset by its name ("last 30 days vs previous
 * 30"), a custom range by its dates. No "vs" where nothing is compared (today, a range that
 * runs to today, a comparison period before LoveIQ's records).
 */
export function rangeText(
  f: Pick<ApFilters, "period" | "from" | "to">,
  compare: PageHead["compare"]
): string {
  const cmp = compare && !beforeData(compare) ? compare : null;
  if (f.period === "today") return "today";
  if (f.period === "custom") return `${rangeLabel(f.from, f.to)}${cmp ? ` vs ${cmp.label}` : ""}`;
  const [name, before] = PRESET_TEXT[f.period];
  return cmp ? `${name} vs ${before}` : name;
}

/** The scope of an Assessment A page: always A, whatever the assessment filter says. */
export function assessmentScope(f: ApFilters): Scope {
  return {
    assessment: "a",
    source: f.source,
    device: f.device,
    tier: f.tier,
    visitor: f.visitor,
    funnel: f.funnel ?? "all",
  };
}

export function buildDashboard(input: {
  facts: Facts;
  previous: Facts | null;
  /** Under "Free survey", with whether all of it was the free survey's (freeAdsOnly). */
  ad: PageAdCost;
  filters: ApFilters;
  today: string;
  now: Date;
  newReturning: PostHogResult<NewReturning> | null;
  /** PostHog's visits by first-page tracking, for visitors per source (null: not read). */
  sessions?: PostHogResult<SessionTags[]> | null;
  /** fetchVisitorGroups for the range's payments: whose visitors each payment counts with. */
  visitorGroups?: PostHogResult<Map<string, "new" | "returning">> | null;
}): DashboardPayload {
  const { facts, previous, ad, filters: f, today, now } = input;
  const scope = assessmentScope(f);
  const t = totals(facts, scope);
  // A filter its records can't follow over this range (the tablet filter before tablets were told
  // apart, a source filter before sources were recorded, new or returning before finishers kept
  // their visit): every figure about people is blank with the reason rather than a false zero,
  // and such a period is not compared.
  const tablet = peopleBlocked(scope, facts.from);
  const known = (v: number) => (tablet ? null : v);
  // The earlier period at the same age as this one, so "so far" rates compare like with like.
  const prevAged =
    previous && !peopleBlocked(scope, previous.from)
      ? ageMatched(previous, sameAge(facts, previous, now))
      : null;
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
  const vB = visitsBlocked(scope, facts.from);
  const stB = startsBlocked(scope, facts.from, today);
  const cac = (s: { eur: number | null }, x: Totals) =>
    s.eur === null ? null : ratio(s.eur, x.payers);
  const prevCac = sPrev && p ? cac(sPrev, p) : null;
  const count = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
  const eur = (n: number | null, d = 2) =>
    n === null
      ? "—"
      : `€${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  /** The figure's parts for its info card: none for a blank one. */
  const worked = (
    value: number | null,
    unit: Unit,
    parts?: [string, string],
    digits?: number
  ): Worked | undefined =>
    value === null
      ? undefined
      : {
          ...(parts ? { num: parts[0], den: parts[1] } : {}),
          value: fmt(unit, value, digits),
        };
  const tile = (
    key: string,
    label: string,
    unit: Unit,
    pick: (x: Totals) => number | null,
    foot: (x: Totals) => string,
    opts: {
      /** Its info card's field key. */
      info: string;
      /** Numerator and denominator, as the card writes them, for a rate or an average. */
      parts?: [string, string];
      blocked?: string | null;
      goodWhen?: GoodWhen;
      spark?: Array<number | null>;
      value?: number | null;
      prev?: number | null;
      deltaAs?: "abs";
      trend?: string;
    }
  ): DashTile => {
    const value = opts.value !== undefined ? opts.value : pick(t);
    // Every tile counts people or visits: blank under the tablet filter too, unless already blank.
    const blocked = opts.blocked ?? tablet;
    const w = blocked ? undefined : worked(value, unit, opts.parts);
    return {
      key,
      label,
      unit,
      value,
      prev: opts.prev !== undefined ? opts.prev : p ? pick(p) : null,
      goodWhen: opts.goodWhen ?? "up",
      spark: opts.spark ?? trend(facts, scope, (x) => pick(x)),
      foot: foot(t),
      blocked,
      trend: opts.trend ?? caption,
      ...(opts.deltaAs ? { deltaAs: opts.deltaAs } : {}),
      info: opts.info,
      ...(w ? { worked: w } : {}),
    };
  };
  // A sale is rare: with one period holding them all, the line is that one point and says which.
  const aovSpark = trend(facts, scope, (x) => ratio(x.revenue, x.sales));
  const saleBuckets = trendBuckets(facts.from, facts.to).filter((_b, i) => aovSpark[i] != null);
  const onlyBucket = saleBuckets.length === 1 ? saleBuckets[0]! : null;
  const grain = grainOf(facts.from, facts.to);
  // The earlier period's starts can't be compared (incomplete before 18 Sep 2026, or days a
  // filter can't follow): the start CVR tile says so in grey, worded as the Survey page does.
  const prevWhy = previous ? startsBlocked(scope, previous.from, today) : null;
  const noCmpWhy =
    p && p.starts === null && t.starts !== null
      ? prevWhy
        ? prevWhy.replace(/\.$/, "")
        : "earlier starts incomplete"
      : null;
  const noCmp = noCmpWhy ? `No comparison: ${lowerFirst(noCmpWhy)}` : null;

  const tiles: DashTile[] = [
    tile(
      "visits",
      "Visitors",
      "count",
      (x) => x.visits,
      () => (p?.visits != null ? `vs ${count(p.visits)}` : "Unique daily visits"),
      { info: "assessment.visits", blocked: vB }
    ),
    tile(
      "start-cvr",
      "Survey start CVR",
      "pct",
      (x) => ratio(x.starts, x.visits),
      (x) => `${noCmp ? `${noCmp} · ` : ""}${count(x.starts)} starts`,
      {
        info: "assessment.start-cvr",
        parts: [count(t.starts), count(t.visits)],
        // Incomplete starts read low: blank, as the scorecard and the journey are.
        blocked: vB ?? stB ?? (startsOk ? null : `${STARTS_INCOMPLETE}.`),
        // Weeks whose starts are not all recorded have no point, rather than a low one.
        spark: trend(facts, scope, (x, from) =>
          startsComplete(from, today, scope) ? ratio(x.starts, x.visits) : null
        ),
      }
    ),
    tile(
      "complete-cvr",
      "Survey submission CVR",
      "pct",
      (x) => ratio(x.subs, x.visits),
      (x) => `${count(x.subs)} submissions`,
      {
        info: "assessment.submission-cvr",
        parts: [count(t.subs), count(t.visits)],
        blocked: vB,
      }
    ),
    tile(
      "pay-cvr",
      "Payment CVR",
      "pct",
      (x) => ratio(x.paidCohort, x.subs),
      (x) => `of submissions · ${x.paidCohort} paid so far`,
      { info: "assessment.pay-cvr", parts: [count(t.paidCohort), count(t.subs)] }
    ),
    tile(
      "rev-visit",
      "€ rev. per visit",
      "eur3",
      (x) => ratio(x.revenue, x.visits),
      () => (p ? `vs ${fmt("eur3", ratio(p.revenue, p.visits))}` : ""),
      {
        info: "assessment.rev-visit",
        parts: [eur(t.revenue), count(t.visits)],
        blocked: vB,
      }
    ),
    tile(
      "rev-sub",
      // Revenue ÷ submissions, as "Survey submission CVR" names its submissions.
      "€ rev. per survey submission",
      "eur3",
      (x) => ratio(x.revenue, x.subs),
      (x) =>
        p
          ? `vs ${fmt("eur3", ratio(p.revenue, p.subs))} · ${count(x.subs)} submissions`
          : `${count(x.subs)} submissions`,
      { info: "assessment.rev-sub", parts: [eur(t.revenue), count(t.subs)] }
    ),
    tile(
      "revenue",
      "Revenue",
      "eur",
      (x) => x.revenue,
      () => (p ? `vs ${eur(p.revenue)}` : ""),
      { info: "assessment.revenue" }
    ),
    tile(
      "aov",
      "Avg. payment",
      "eur",
      (x) => ratio(x.revenue, x.sales),
      (x) =>
        `${p ? `vs ${eur(ratio(p.revenue, p.sales))} · ` : ""}${x.sales} sale${x.sales === 1 ? "" : "s"}${p ? ` vs ${p.sales}` : ""}`,
      {
        info: "assessment.aov",
        parts: [eur(t.revenue), count(t.sales)],
        deltaAs: "abs",
        ...(onlyBucket
          ? {
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
      // The earlier CAC in whole euros, as drawn ("vs €300"); a partial spend is never compared,
      // so it says so where the comparison would stand.
      () =>
        prevCac !== null
          ? `vs ${eur(prevCac, 0)}`
          : `Google Ads spend ÷ paying customers${partialSpend}`,
      {
        info: "assessment.cac",
        parts: [eur(sNow.eur), count(t.payers)],
        // Blank spend says why: a filter that can't split it, no figure for these days, or no read.
        blocked: sNow.why,
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
      (x) => `${count(x.opened)} of ${count(x.subs)}`,
      // A health check (almost everyone opens their report), so its change is grey, as drawn.
      {
        info: "assessment.open-rate",
        parts: [count(t.opened), count(t.subs)],
        goodWhen: "either",
      }
    ),
  ];
  // The CAC tile's line is spend per submission (a sale is too rare to draw), so its caption,
  // as drawn, and the line's read-out, say so.
  tiles[8]!.trend = `${caption} · line: € per submission`;
  tiles[8]!.line = "Ad spend per submission";

  const read = readMedianMs(facts, scope);
  const subs = subsIn(facts, scope);
  const startCvr = startsOk ? ratio(t.starts, t.visits) : null;
  // Submissions ÷ starts, as the Survey and Landing pages read completion (design).
  const completion = startsOk ? ratio(t.subs, t.starts) : null;
  const payCvr = ratio(t.paidCohort, t.subs);
  const cacNow = cac(sNow, t);
  const roas = sNow.eur ? ratio(t.revenue, sNow.eur) : null;
  const clv = ratio(t.revenue, t.payers);
  const spreaders = subs.filter((s) => s.openedAt && (s.shared || s.invited)).length;
  const virality = ratio(spreaders, t.opened);
  const scoreRows: ScoreRow[] = [
    {
      group: "Funnel",
      label: "Start CVR",
      unit: "pct",
      value: startCvr,
      note: vB ?? stB ?? (startsOk ? "survey starts ÷ visits" : STARTS_LOW),
      info: "assessment.score-start-cvr",
      worked: worked(startCvr, "pct", [count(t.starts), count(t.visits)]),
    },
    {
      group: "Funnel",
      label: "Completion CVR",
      unit: "pct",
      value: completion,
      note: stB ?? (startsOk ? "finished surveys per start" : STARTS_LOW),
      info: "assessment.score-completion-cvr",
      worked: worked(completion, "pct", [count(t.subs), count(t.starts)]),
    },
    {
      group: "Funnel",
      label: "Payment CVR",
      unit: "pct",
      value: payCvr,
      note: "of the submissions, paid so far",
      // The same figure as the Payment CVR tile.
      info: "assessment.pay-cvr",
      worked: worked(payCvr, "pct", [count(t.paidCohort), count(t.subs)]),
    },
    {
      group: "Economics",
      label: "CAC",
      unit: "eur",
      value: cacNow,
      note: sNow.why ?? `Google Ads spend ÷ paying customers${partialSpend}`,
      info: "assessment.score-cac",
      worked: worked(cacNow, "eur", [eur(sNow.eur), count(t.payers)]),
    },
    {
      group: "Economics",
      label: "ROAS",
      unit: "ratio",
      value: roas,
      note:
        sNow.why ?? `revenue ÷ ad spend (1.0 = break-even on the first purchase)${partialSpend}`,
      info: "assessment.score-roas",
      worked: worked(roas, "ratio", [eur(t.revenue), eur(sNow.eur)], 2),
    },
    {
      group: "Economics",
      label: "CLV",
      unit: "eur",
      value: clv,
      // It equals the average order only while nobody has bought twice.
      note: `revenue per paying customer${
        t.payers === 0
          ? ""
          : t.sales === t.payers
            ? "; one purchase each so far, so it equals the average order"
            : `; ${t.sales} purchases by ${t.payers} customer${t.payers === 1 ? "" : "s"} so far`
      }`,
      info: "assessment.score-clv",
      worked: worked(clv, "eur", [eur(t.revenue), count(t.payers)]),
    },
    {
      group: "Engagement",
      label: "Assessment airtime",
      unit: "mmss",
      value: t.surveyMedianMs,
      note: "median time to finish the survey",
      info: "assessment.score-survey-time",
      worked: worked(t.surveyMedianMs, "mmss"),
    },
    {
      group: "Engagement",
      label: "Report airtime",
      unit: "mmss",
      value: read,
      // Reading is saved for every visit from 18 Sep 2026: say how many readers it is.
      note: `median reading time per reader, where recorded (${subs.filter((s) => s.closed > 0).length.toLocaleString("en-US")} of ${t.opened.toLocaleString("en-US")} readers)`,
      info: "assessment.score-read-time",
      worked: worked(read, "mmss"),
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
      value: virality,
      note: "of the readers, shared their report or invited a friend",
      info: "assessment.score-virality",
      worked: worked(virality, "pct", [count(spreaders), count(t.opened)]),
    },
  ];
  // A filter the records can't follow over this range: no figure about people, and why.
  const scorecard = scoreRows.map((r) =>
    tablet && PEOPLE_ROWS.has(r.label) ? { ...r, value: null, note: tablet, worked: undefined } : r
  );

  // Hrefs are relative to the assessment's dashboard; the page adds the filters. A share whose
  // base is incomplete for the range (starts before 18 Sep, paywall views before 6 Sep) is
  // left blank rather than read high or low, and the note says why.
  const paywallOk = facts.from >= PAYWALL_SEEN_FROM;
  const share = (a: number | null, b: number | null) => (tablet ? null : ratio(a, b));
  const steps: Array<Omit<JourneyStep, "worked">> = [
    {
      n: 1,
      label: "Landing page",
      value: t.visits,
      step: "entry · visits",
      href: "landing",
      info: "assessment.step-landing",
    },
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
      // Incomplete starts read low: blank, as the tile and the Survey page are.
      value: startsOk ? t.starts : null,
      step: `${pct(startsOk ? share(t.starts, t.visits) : null)} of visits`,
      href: "survey",
      info: "assessment.step-start",
    },
    {
      n: 4,
      label: "Submitted",
      value: known(t.subs),
      step: `${pct(startsOk ? share(t.subs, t.starts) : null)} of starts`,
      href: "survey",
      info: "assessment.step-submitted",
    },
    {
      n: 5,
      label: "Report opened",
      value: known(t.opened),
      step: `${pct(share(t.opened, t.subs))} of submits`,
      href: "report",
      info: "assessment.step-opened",
    },
    {
      n: 6,
      label: "Paywall reached",
      value: paywallOk ? known(t.paywall) : null,
      step: paywallOk ? `${pct(share(t.paywall, t.opened))} of opens` : "recorded from 6 Sep 2026",
      href: "report",
      info: "assessment.step-paywall",
    },
    {
      n: 7,
      label: "Paid",
      value: known(t.paidCohort),
      step: `${pct(paywallOk ? share(t.paidCohort, t.paywall) : null)} of paywall`,
      href: "#payment",
      info: "assessment.step-paid",
    },
  ];
  // Each step's figure is a count: its card shows it as the page does.
  const journey: JourneyStep[] = steps.map((s) => ({
    ...s,
    ...(s.info && s.value !== null ? { worked: worked(s.value, "count") } : {}),
  }));
  const journeyNote =
    [
      tablet,
      stB ? `Step 3 is blank: ${stB}` : null,
      startsOk ? null : `Step 3 is blank and steps 3 and 4 have no share: ${STARTS_LOW}.`,
      paywallOk
        ? null
        : "Step 6 is blank: the report records that its paywall was seen from 6 Sep 2026, so earlier readers who only looked are missing.",
    ]
      .filter(Boolean)
      .join(" ") || null;

  // Every source, its visitors counted or split as visitorSplit says (totals live).
  const split = visitorSplit(f, facts, input.sessions ?? null);
  const bySource = SOURCE_ROWS.map((s) => ({
    ...s,
    x: totals(facts, { ...scope, source: s.value }),
    visitors: split.bySource.get(s.value)?.visitors ?? null,
  }));
  const maxVisitors = Math.max(0, ...bySource.map((s) => s.visitors ?? 0));
  // What a source's people are divided by: none for a late source in a range before its day.
  const late = split.ok ? lateSourceNote(f.from) : null;
  const perVisitor = (s: (typeof bySource)[number]) =>
    late && LATE_SOURCES.has(s.value) ? null : s.visitors;
  // Finishers whose source was never recorded (before SOURCE_FROM, untagged): their own row,
  // so the sources add up to the total and none is passed off as Direct.
  const unknownSubs = subsIn(facts, { ...scope, source: "all" }).filter(
    (s) => classifySource(s) === "unknown"
  ).length;
  const sources: Table = {
    sample: split.ok,
    barLabel: "Share of visits",
    // The design's decimals: a share in tenths, a CVR in hundredths.
    columns: [
      { label: "Source", unit: "text" },
      { label: "Visitors", unit: "count", info: "assessment.src-visitors" },
      { label: "Share", unit: "pct", digits: 1, info: "assessment.src-share" },
      { label: "Submissions", unit: "count", info: "assessment.src-subs" },
      { label: "Survey CVR", unit: "pct", digits: 2, info: "assessment.src-cvr" },
      { label: "€ / visit", unit: "eur3", info: "assessment.src-per-visit" },
    ],
    rows: bySource
      .map((s) => ({
        label: s.label,
        values: [
          s.visitors,
          split.bySource.get(s.value)?.share ?? null,
          known(s.x.subs),
          ratio(s.x.subs, perVisitor(s)),
          ratio(s.x.revenue, perVisitor(s)),
        ],
        // No bars while the visitors are blank: an empty track would read as none.
        ...(split.ok ? { bar: maxVisitors ? (s.visitors ?? 0) / maxVisitors : 0 } : {}),
      }))
      .concat(
        unknownSubs
          ? [
              {
                label: "Not recorded",
                values: [null, null, known(unknownSubs), null, null],
                ...(split.ok ? { bar: 0 } : {}),
              },
            ]
          : []
      ),
    note: `${split.note} Survey CVR: submissions ÷ visitors. Submissions and payments carry the source the survey recorded; revenue by payment day.${unknownSubs ? ` Not recorded: finishers from before ${rangeLabel(SOURCE_FROM, SOURCE_FROM)} whose link carried no tag, so their source is unknown.` : ""}${late ? ` ${late}` : ""}${tablet ? ` ${tablet}` : ""}`,
  };

  const performance = bySource.map((s) => ({
    label: s.label,
    surveyCvr: ratio(s.x.subs, perVisitor(s)),
    perVisit: ratio(s.x.revenue, perVisitor(s)),
  }));

  // € per visit for each of PostHog's visitor groups: the range's payments, each with the
  // group of the person who made it (fetchVisitorGroups). All traffic, as the panel is.
  const groups = input.visitorGroups ?? null;
  const newReturningRevenue: DashboardPayload["newReturningRevenue"] =
    groups === null
      ? null
      : groups.ok
        ? { ok: true, value: revenueByGroup(facts, groups.value) }
        : groups;

  // Sales per plan and price: of the prices quoted in the range, the checkouts and sales on
  // them. The narrowing filters apply by the reader's own source, device and tier; quotes are
  // counted per price, not per person, so new and returning can't split them.
  const priceMap = new Map<string, PriceRow>();
  for (const qf of facts.quotes) {
    if (!launched(scope) || scope.visitor !== "all") break;
    if (scope.funnel === "free" && qf.pts) continue;
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
  // By the plan's name, then price, as the design lists them.
  const prices = [...priceMap.values()]
    .map((r) => ({ ...r, cvr: ratio(r.sales, r.quoted) }))
    .sort((a, b) => a.planLabel.localeCompare(b.planLabel) || (a.price ?? 0) - (b.price ?? 0));

  const pageHead = head(f, today, now, true, facts);
  return {
    ...pageHead,
    launched: launched(scope),
    questions: askedQuestions(80).length,
    rangeText: rangeText(f, pageHead.compare),
    tiles,
    scorecard,
    journey,
    journeyNote,
    sources,
    performance,
    newReturning: input.newReturning,
    newReturningRevenue,
    prices,
    pricesBlocked:
      scope.visitor !== "all"
        ? "Prices are counted per price, not per person, so new and returning can't split them."
        : tablet,
  };
}

/**
 * The range's sales (money in, by payment day; our probes out) by the payer's PostHog group,
 * found through the visit they finished the survey in. One PostHog never saw is in neither.
 */
export function revenueByGroup(
  facts: Facts,
  groups: Map<string, "new" | "returning">
): { new: number; returning: number } {
  let fresh = 0;
  let back = 0;
  for (const m of facts.money) {
    const g = m.ph ? groups.get(m.ph.toLowerCase()) : undefined;
    if (!g || m.amount <= 0 || m.day < facts.from || m.day > facts.to) continue;
    if (classifySource(m) === "test") continue;
    if (g === "new") fresh += m.amount;
    else back += m.amount;
  }
  return { new: Math.round(fresh * 100) / 100, returning: Math.round(back * 100) / 100 };
}

/** Why a rate over survey starts is blank for a range reaching back past what starts hold. */
const STARTS_LOW = lowerFirst(STARTS_INCOMPLETE);

/** The scorecard's rows about people: blank with the reason under a filter they can't follow. */
const PEOPLE_ROWS = new Set([
  "Start CVR",
  "Completion CVR",
  "Payment CVR",
  "CAC",
  "ROAS",
  "CLV",
  "Assessment airtime",
  "Report airtime",
  "Virality",
]);

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(v * 100 >= 10 ? 1 : 2)}%`;
}
