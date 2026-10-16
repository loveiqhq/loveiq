/**
 * The Dashboard (Marcus's "Dashboard · What matters most", 16 Oct 2026): three headline tiles,
 * six charts of what a submission costs and earns and the funnel rates (each by day, week or
 * month), then each assessment's scorecard.
 */
import type { AdCost } from "@features/brain/server/ingest/analytics";

import { addDays } from "./days";
import { reportingDay } from "@shared/time/reporting-day";

import { FULL_PLANS, PRE_PLANS, type Facts } from "./facts";
import {
  buckets,
  dayCount,
  trendBuckets,
  type ApFilters,
  type Bucket,
  type Grain,
  rangeLabel,
} from "./filters";
import { linearFit, type Unit } from "./format";
import { head, readMeanMs, readMedianMs, type PageHead, type Tile } from "./common";
import {
  EVENTS_COMPLETE_FROM,
  launched,
  ratio,
  salesIn,
  spend,
  startsComplete,
  subsIn,
  tabletBlocked,
  totals,
  visitsBlocked,
  type Scope,
} from "./metrics";

export type ChartColor = "purple" | "ink" | "green";

export interface ChartSeries {
  name: string;
  color: ChartColor;
  /** Drawn dotted, as the design draws cost. */
  dotted?: boolean;
  axis: "left" | "right";
  unit: Unit;
  /** Its trend reads good going down (a cost). */
  lowerBetter?: boolean;
  values: Array<number | null>;
  /** The legend's figure: the whole range's. */
  total: number | null;
}

export interface ChartView {
  /** "15 Sep", "14 Sep" (a week's Monday), "Sep 2026". */
  labels: string[];
  series: ChartSeries[];
}

export interface FocusChart {
  key: string;
  title: string;
  /** What a point is, per grain ("Per day, with what …"). */
  sub: Record<Grain, string>;
  /** Across the whole width, as the design's first chart. */
  wide?: boolean;
  views: Record<Grain, ChartView>;
  /** Why the chart has no line, when it has none. */
  blocked: string | null;
  /** The left axis reaches at least this (a completion rate can pass 100% on a day). */
  leftMin?: number;
  /** The groupings it can be read in, first the one it opens on; every one when unset. */
  grains?: Grain[];
  /** Said under the chart: what some of its points leave out. */
  note?: string;
}

export interface AssessmentRow {
  label: string;
  sub: string;
  live: boolean;
  /** Not asked yet: always null. */
  nps: null;
  surveyMedianMs: number | null;
  reportMedianMs: number | null;
  /** Under the report time: "live" or from when it is complete. */
  reportSub: string;
  submissions: number | null;
  paidCvr: number | null;
  revPerSub: number | null;
  costPerSub: number | null;
  /** Submissions per day over the range, and their least-squares line's ends. */
  trend: { values: number[]; from: number; to: number } | null;
}

export interface FocusPayload extends PageHead {
  launched: boolean;
  tiles: Tile[];
  charts: FocusChart[];
  assessments: {
    best: { label: string; sub: string } | null;
    nps: { sub: string };
    survey: { valueMs: number | null; sub: string };
    report: { valueMs: number | null; sub: string };
    rows: AssessmentRow[];
    /** "Submissions trend · 30 days". */
    trendLabel: string;
  };
}

const GRAINS: Grain[] = ["day", "week", "month"];
const PER: Record<Grain, string> = { day: "Per day", week: "Per week", month: "Per month" };

/** Whole weeks or months for a line (a cut-short one reads as a drop), all of them if under two. */
function viewBuckets(from: string, to: string, grain: Grain): Bucket[] {
  const all = buckets(from, to, grain);
  if (grain === "day") return all;
  const full = all.filter((b) => b.full);
  return full.length >= 2 ? full : all;
}

/** Least squares over equally spaced points (it lives in format.ts, so the page can draw it). */
export { linearFit };

export function buildFocus(input: {
  facts: Facts;
  previous: Facts | null;
  ad: AdCost;
  filters: ApFilters;
  today: string;
  now: Date;
  /** Chapter ratings in the range (ap_report_extras' chapters); null when not read. */
  ratings: { up: number; down: number } | null;
}): FocusPayload {
  const { facts, previous, ad, filters: f, today, now, ratings } = input;
  const scope: Scope = {
    assessment: f.assessment,
    source: f.source,
    device: f.device,
    tier: f.tier,
    visitor: f.visitor,
  };
  const on = launched(scope);
  const tablet = tabletBlocked(scope, facts.from);
  const t = totals(facts, scope);
  const p = previous && !tabletBlocked(scope, previous.from) ? totals(previous, scope) : null;
  const sNow = spend(ad, scope, facts.from, facts.to);
  // Spend that covers only part of the range (GA4 began later) is never shown as the whole:
  // it and the cost per submission are blank, and say why.
  const nowSpend = sNow.complete ? sNow.eur : null;
  const spendWhy =
    sNow.why ??
    (sNow.eur !== null && !sNow.complete
      ? sNow.from
        ? `Ad spend is recorded from ${rangeLabel(sNow.from, sNow.from)}: pick a range from that day on.`
        : "Ad spend could not be read for every day of this range."
      : null);
  const sPrevRaw = previous ? spend(ad, scope, previous.from, previous.to) : null;
  // Spend is compared only when both periods have every day of it: a partial total reads low.
  const sPrev = sPrevRaw && sPrevRaw.complete && sNow.complete ? sPrevRaw.eur : null;

  /** People whose first finished survey ever falls in [from, to], under the filters. */
  const newUsers = (x: Facts, from: string, to: string): number => {
    const ids = new Set<number>();
    for (const s of subsIn(x, scope, from, to)) {
      if (s.uid === null || !s.userFirstAt) continue;
      const first = reportingDay(new Date(s.userFirstAt));
      if (first >= from && first <= to) ids.add(s.uid);
    }
    return ids.size;
  };
  const spark = (pick: (from: string, to: string) => number | null) =>
    trendBuckets(facts.from, facts.to).map((b) => pick(b.from, b.to));

  const tiles: Tile[] = [
    {
      key: "revenue",
      label: "Revenue",
      unit: "eur",
      value: tablet ? null : t.revenue,
      prev: p ? p.revenue : null,
      goodWhen: "up",
      spark: spark((from, to) => totals(facts, scope, from, to).revenue),
      foot: "",
      blocked: tablet,
      trend: "",
    },
    {
      key: "spend",
      label: "Ad spend",
      unit: "eur",
      value: nowSpend,
      prev: sPrev,
      // A cost that is neither good nor bad by itself: its change is grey, as drawn.
      goodWhen: "either",
      spark: spark((from, to) => {
        const s = spend(ad, scope, from, to);
        return s.complete ? s.eur : null;
      }),
      foot: "",
      blocked: spendWhy,
      trend: "",
    },
    {
      key: "new-users",
      label: "New users",
      unit: "count",
      value: tablet ? null : newUsers(facts, facts.from, facts.to),
      prev: previous && p ? newUsers(previous, previous.from, previous.to) : null,
      goodWhen: "up",
      spark: spark((from, to) => newUsers(facts, from, to)),
      foot: "",
      blocked: tablet,
      trend: "",
    },
  ];

  // ---- the six charts, each at every grain
  const vB = visitsBlocked(scope);
  /** Full-unlock sales paid in [from, to] (Full, Full All, Core), as the revenue counts them. */
  const fullSales = (from: string, to: string) => {
    const kept = salesIn(facts, scope, from, to).filter((m) => FULL_PLANS.has(m.plan ?? ""));
    return { n: kept.length, revenue: kept.reduce((a, m) => a + m.amount, 0) };
  };
  const users = (from: string, to: string) =>
    new Set(subsIn(facts, scope, from, to).map((s) => s.uid ?? -s.id)).size;

  type Pick = (b: { from: string; to: string }) => number | null;
  const view = (grain: Grain, defs: Array<Omit<ChartSeries, "values"> & { pick: Pick }>) => {
    const bs = viewBuckets(facts.from, facts.to, grain);
    return {
      labels: bs.map((b) => b.label),
      series: defs.map(({ pick, ...d }) => ({ ...d, values: bs.map((b) => pick(b)) })),
    };
  };
  const chart = (
    key: string,
    title: string,
    subs: string,
    defs: Array<Omit<ChartSeries, "values"> & { pick: Pick }>,
    opts: {
      wide?: boolean;
      blocked?: string | null;
      leftMin?: number;
      perGrain?: boolean;
      grains?: Grain[];
      note?: string | null;
    } = {}
  ): FocusChart => ({
    key,
    title,
    sub: Object.fromEntries(
      GRAINS.map((g) => [g, opts.perGrain ? `${PER[g]}${subs}` : subs])
    ) as Record<Grain, string>,
    ...(opts.wide ? { wide: true } : {}),
    views: Object.fromEntries(GRAINS.map((g) => [g, view(g, defs)])) as Record<Grain, ChartView>,
    blocked: opts.blocked ?? null,
    ...(opts.leftMin !== undefined ? { leftMin: opts.leftMin } : {}),
    ...(opts.grains ? { grains: opts.grains } : {}),
    ...(opts.note ? { note: opts.note } : {}),
  });
  const tot = (b: { from: string; to: string }) => totals(facts, scope, b.from, b.to);
  const range = { from: facts.from, to: facts.to };
  const spendOf = (b: { from: string; to: string }) => {
    const s = spend(ad, scope, b.from, b.to);
    return s.complete ? s.eur : null;
  };
  const startsOk = (b: { from: string }) => startsComplete(b.from, today, scope);
  const startCvr: Pick = (b) => (startsOk(b) ? ratio(tot(b).starts, tot(b).visits) : null);
  const completion: Pick = (b) => (startsOk(b) ? ratio(tot(b).subs, tot(b).starts) : null);
  // A range reaching back past what survey starts still hold: those points are left out (pick
  // gives them none) and the chart says so, rather than giving up the points it has.
  const startsNote = startsOk(range)
    ? null
    : "Survey starts before 18 Sep 2026 are incomplete once their drafts are cleared, so those points are left out.";
  const preBlocked = PRE_PLANS.size
    ? null
    : "The Initial plan (the pre-unlock) isn't on sale yet, so nothing has been pre-unlocked.";

  const charts: FocusChart[] = [
    chart(
      "submissions",
      "Survey submissions",
      ", with what each submission cost in ads and earned in revenue",
      [
        {
          name: "Survey submissions",
          color: "purple",
          axis: "left",
          unit: "count",
          total: tablet ? null : t.subs,
          pick: (b) => (tablet ? null : tot(b).subs),
        },
        {
          name: "Cost per submission",
          color: "ink",
          dotted: true,
          axis: "right",
          unit: "eur",
          lowerBetter: true,
          total: nowSpend === null || tablet ? null : ratio(nowSpend, t.subs),
          pick: (b) => (tablet ? null : ratio(spendOf(b), tot(b).subs)),
        },
        {
          name: "Revenue per submission",
          color: "green",
          axis: "right",
          unit: "eur",
          total: tablet ? null : ratio(t.revenue, t.subs),
          pick: (b) => (tablet ? null : ratio(tot(b).revenue, tot(b).subs)),
        },
      ],
      { wide: true, blocked: tablet, perGrain: true }
    ),
    chart(
      "start-cvr",
      "Visitor → survey start",
      "Survey starts ÷ visitors",
      [
        {
          name: "Start CVR",
          color: "purple",
          axis: "left",
          unit: "pct",
          total: startsOk(range) ? ratio(t.starts, t.visits) : null,
          pick: startCvr,
        },
      ],
      { blocked: vB ?? tablet, note: startsNote }
    ),
    chart(
      "completion",
      "Survey completion",
      "Submissions ÷ survey starts",
      [
        {
          name: "Completion CVR",
          color: "purple",
          axis: "left",
          unit: "pct",
          total: startsOk(range) ? ratio(t.subs, t.starts) : null,
          pick: completion,
        },
      ],
      { blocked: tablet, leftMin: 1, note: startsNote }
    ),
    chart(
      "pre-unlock",
      "Completion → pre-unlock",
      "Initial plan purchases ÷ submissions, and revenue per pre-unlock",
      [
        {
          name: "Pre-unlock rate",
          color: "purple",
          axis: "left",
          unit: "pct",
          total: null,
          pick: () => null,
        },
        {
          name: "Revenue per pre-unlock",
          color: "green",
          axis: "right",
          unit: "eur",
          total: null,
          pick: () => null,
        },
      ],
      { blocked: preBlocked }
    ),
    chart(
      "full-unlock",
      "Completion → full unlock",
      "Full, Full All and Core purchases ÷ submissions, and revenue per full unlock",
      [
        {
          name: "Full-unlock rate",
          color: "purple",
          axis: "left",
          unit: "pct",
          total: tablet ? null : ratio(fullSales(facts.from, facts.to).n, t.subs),
          pick: (b) => (tablet ? null : ratio(fullSales(b.from, b.to).n, tot(b).subs)),
        },
        {
          name: "Revenue per full unlock",
          color: "green",
          axis: "right",
          unit: "eur",
          total: tablet
            ? null
            : ratio(fullSales(facts.from, facts.to).revenue, fullSales(facts.from, facts.to).n),
          pick: (b) =>
            tablet ? null : ratio(fullSales(b.from, b.to).revenue, fullSales(b.from, b.to).n),
        },
      ],
      { blocked: tablet }
    ),
    chart(
      "per-user",
      "Assessments per user",
      "Survey submissions ÷ unique people who finished, per month",
      [
        {
          name: "Assessments per user",
          color: "purple",
          axis: "left",
          unit: "ratio",
          total: tablet ? null : ratio(t.subs, users(facts.from, facts.to)),
          pick: (b) => (tablet ? null : ratio(tot(b).subs, users(b.from, b.to))),
        },
      ],
      // Per month only, as drawn: on a day, nearly everyone is one person per submission.
      { blocked: tablet, grains: ["month"], leftMin: 1.5 }
    ),
  ];
  // ---- the assessments
  const days: string[] = [];
  for (let d = facts.from; d <= facts.to; d = addDays(d, 1)) days.push(d);
  const daily = days.map((d) => totals(facts, scope, d, d).subs);
  const fit = linearFit(daily);
  const read = readMedianMs(facts, scope);
  const readMean = readMeanMs(facts, scope);
  const readers = subsIn(facts, scope).filter((s) => s.closed > 0).length;
  const reportSub =
    facts.from < EVENTS_COMPLETE_FROM ? "from 18 Sep 2026, when every visit was recorded" : "live";
  const aRow: AssessmentRow = {
    label: "Assessment A",
    sub: "Live · rank 1",
    live: true,
    nps: null,
    surveyMedianMs: tablet ? null : t.surveyMedianMs,
    reportMedianMs: tablet ? null : read,
    reportSub,
    submissions: tablet ? null : t.subs,
    paidCvr: tablet ? null : ratio(t.paidCohort, t.subs),
    revPerSub: tablet ? null : ratio(t.revenue, t.subs),
    costPerSub: tablet || nowSpend === null ? null : ratio(nowSpend, t.subs),
    trend: tablet || !fit ? null : { values: daily, ...fit },
  };
  const later = (label: string): AssessmentRow => ({
    label,
    sub: "Not live",
    live: false,
    nps: null,
    surveyMedianMs: null,
    reportMedianMs: null,
    reportSub: "",
    submissions: null,
    paidCvr: null,
    revPerSub: null,
    costPerSub: null,
    trend: null,
  });
  const eur = (v: number | null) =>
    v === null
      ? "—"
      : `€${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const count = (n: number) => n.toLocaleString("en-US");
  const votes = ratings ? ratings.up + ratings.down : 0;
  const rows =
    f.assessment === "b" || f.assessment === "c"
      ? [later(f.assessment === "b" ? "Assessment B" : "Assessment C")]
      : f.assessment === "a"
        ? [aRow]
        : [aRow, later("Assessment B"), later("Assessment C")];

  return {
    ...head(f, today, now),
    launched: on,
    tiles,
    charts,
    assessments: {
      best: on
        ? {
            label: "Assessment A",
            sub: `Only live assessment · ${eur(aRow.revPerSub)} revenue per submission, ${eur(aRow.costPerSub)} cost per submission`,
          }
        : null,
      nps: {
        sub: !ratings
          ? "Not asked yet."
          : votes === 0
            ? "Not asked yet. No chapter was rated in this range."
            : `Not asked yet. ${Math.round((ratings.up / votes) * 100)}% of ${count(votes)} chapter rating${votes === 1 ? "" : "s"} say helpful.`,
      },
      survey: {
        valueMs: aRow.surveyMedianMs,
        sub: `${count(aRow.submissions ?? 0)} submission${aRow.submissions === 1 ? "" : "s"} in the range`,
      },
      report: {
        valueMs: aRow.reportMedianMs,
        sub: `${count(readers)} reader${readers === 1 ? "" : "s"} with a measured visit${
          readMean === null ? "" : ` · average ${(readMean / 60_000).toFixed(1)} min`
        }`,
      },
      rows,
      trendLabel: `Submissions trend · ${dayCount(facts.from, facts.to)} days`,
    },
  };
}
