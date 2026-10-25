/**
 * The Dashboard (Marcus's "Dashboard · What matters most", 16 Oct 2026, synced with his canvas
 * on 21 Oct 2026): three headline tiles, the funnel comparison, six charts of what a submission
 * costs and earns and the funnel rates (each by day, week or month), then each assessment's
 * scorecard.
 */
import type { AdCost } from "@features/brain/server/ingest/analytics";

import { addDays, shortDate } from "./days";
import { reportingDay } from "@shared/time/reporting-day";

import { PRE_ON_SALE_FROM, PRE_PLANS, preBuysOf, type Facts } from "./facts";
import {
  activeNarrowing,
  buckets,
  DATA_START,
  dayCount,
  trendBuckets,
  type ApFilters,
  type Grain,
  rangeLabel,
} from "./filters";
import { fmt, linearFit, lowerFirst, type Unit } from "./format";
import type { PtsFunnel, PtsPayload } from "./pay-to-start";
import { proportionTest } from "./traffic";
import { freePreBlocked, head, readMeanMs, readMedianMs, type PageHead, type Tile } from "./common";
import {
  draftsKeptFrom,
  EVENTS_COMPLETE_FROM,
  launched,
  peopleBlocked,
  ratio,
  spend,
  startsBlocked,
  startsComplete,
  STEP_DEVICE_FROM,
  subsIn,
  tabletBlocked,
  totals,
  visitsBlocked,
  type Scope,
  type Totals,
  type PageAdCost,
} from "./metrics";

export type ChartColor = "purple" | "ink" | "green";

export interface ChartSeries {
  name: string;
  /** Its legend figure's info card (features/admin/ui/ap/fields). */
  info?: string;
  color: ChartColor;
  /** Drawn dotted, as the design draws cost. */
  dotted?: boolean;
  axis: "left" | "right";
  unit: Unit;
  /** Decimals for its figures, where the design fixes them (Start CVR's 2). */
  digits?: number;
  /** Its trend reads good going down (a cost). */
  lowerBetter?: boolean;
  values: Array<number | null>;
  /** The legend's figure: over the view's window, from its first point with a figure. */
  total: number | null;
  /** The total's numerator and denominator as the page writes them, for its info card. */
  worked?: { num: string; den: string };
  /** The days the total covers: the view's window from its first point with a figure. */
  span?: { from: string; to: string };
}

export interface ChartView {
  /** "15 Sep", "14 Sep" (a week's Monday), "May", "Oct (to 20th)". */
  labels: string[];
  /** Each point's first and last day, for its read-out on hover. */
  periods?: Array<{ from: string; to: string }>;
  series: ChartSeries[];
  /** The days the grouping covers (chartWindows). */
  window?: { from: string; to: string };
  /** Why this grouping has no line; unset: the chart's `blocked`. */
  blocked?: string | null;
  /** Said under this grouping: what some of its points leave out; unset: the chart's `note`. */
  note?: string | null;
}

export interface FocusChart {
  key: string;
  /** Its title's info card. */
  info?: string;
  title: string;
  /** What a point is, per grain ("Per day, with what …"). */
  sub: Record<Grain, string>;
  /** Across the whole width, as the design's first chart. */
  wide?: boolean;
  views: Record<Grain, ChartView>;
  /** Why the chart has no line over the range (its Daily view), when it has none. */
  blocked: string | null;
  /** The left axis reaches at least this (a completion rate can pass 100% on a day). */
  leftMin?: number;
  /** The groupings it can be read in, first the one it opens on; every one when unset. */
  grains?: Grain[];
  /** Said under the Daily view: what some of its points leave out. */
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
  /** Under the report time: "live, since 18 Sep" or from when it is complete. */
  reportSub: string;
  submissions: number | null;
  paidCvr: number | null;
  revPerSub: number | null;
  costPerSub: number | null;
  /** The parts of Paid CVR, revenue and cost per submission, for their info cards. */
  paid?: number | null;
  revenue?: number | null;
  spend?: number | null;
  /** Submissions per day over the range, and their least-squares line's ends. */
  trend: { values: number[]; from: number; to: number } | null;
}

/** A row of the funnel comparison: one way into the report, over the range. */
export interface FunnelRow {
  key: PtsFunnel["key"];
  label: string;
  /** How the funnel sells ("Pay after the report"). */
  sub: string;
  live: boolean;
  visitors: number | null;
  spend: number | null;
  /** Paying customers (the Pay to start page's: kept money, more than EUR 0). */
  paying: number | null;
  revenue: number | null;
  /** Paying customers ÷ visitors. */
  v2p: number | null;
  /** Revenue ÷ visitors. */
  rpv: number | null;
  /** Ad spend ÷ paying customers. */
  cpp: number | null;
  /** Revenue ÷ ad spend. */
  roas: number | null;
  /** "Reference", "Yes, 95%+", "Not yet, 62%", "Off". */
  valid: string;
}

/** How each funnel sells, under its name. */
const FUNNEL_SUB: Record<PtsFunnel["key"], string> = {
  after: "Free survey · pay after the report",
  full: "Pay before the survey",
  pre: "€1.99 before the survey, the full report later",
  gate: "Free survey · €1.99 before the report",
};

export interface FocusPayload extends PageHead {
  launched: boolean;
  tiles: Tile[];
  funnels: {
    rows: FunnelRow[];
    /** Why the live row's blank cells are blank. */
    notes: string[];
  };
  charts: FocusChart[];
  assessments: {
    best: { label: string; sub: string } | null;
    /** The chapter ratings the line under it reads, for its info card. */
    nps: { sub: string; ratings?: { up: number; votes: number } | null };
    survey: { valueMs: number | null; sub: string };
    report: { valueMs: number | null; sub: string };
    rows: AssessmentRow[];
    /** "Submissions trend · 30 days". */
    trendLabel: string;
  };
}

const GRAINS: Grain[] = ["day", "week", "month"];
const PER: Record<Grain, string> = { day: "Per day", week: "Per week", month: "Per month" };

/** Monthly charts start with May 2026, the first month of paid checkouts (Marcus, 15 Oct 2026). */
export const MONTHLY_FROM = "2026-05-01";
/** Weekly charts show this many whole Monday-to-Sunday weeks, the last ending by the range's end. */
export const WEEKS = 15;

type Period = { from: string; to: string };

/**
 * The days each grouping covers, as Marcus specified on 15 Oct 2026: Daily the range, Weekly the
 * 15 whole weeks up to its end, Monthly every month from May 2026 (the running one "to Nth").
 * A week or a first month cut short reads as a fall, so neither is drawn (as trendBuckets does).
 * A range reaching back further is shown whole, from its first whole week or month, never before
 * LoveIQ's records start.
 */
export function chartWindows(from: string, to: string): Record<Grain, Period> {
  const dow = new Date(`${to}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const sunday = addDays(to, -dow);
  const weekFrom = addDays(sunday, -7 * WEEKS + 1);
  const firstMonday = (d: string) => {
    const k = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    return k === 0 ? d : addDays(d, 7 - k);
  };
  const firstOfMonth = (d: string) =>
    d.endsWith("-01") ? d : `${addDays(`${d.slice(0, 8)}01`, 32).slice(0, 8)}01`;
  const start = from < DATA_START ? DATA_START : from;
  // The earlier of the window's own start and the range's (a longer range is shown whole).
  const weekStart = firstMonday(
    start < weekFrom ? start : weekFrom < DATA_START ? DATA_START : weekFrom
  );
  const week = weekStart <= sunday ? { from: weekStart, to: sunday } : { from, to };
  return {
    day: { from, to },
    week,
    month: { from: start < MONTHLY_FROM ? firstOfMonth(start) : MONTHLY_FROM, to },
  };
}

/** A filter's reason for a grouping that reaches back past it: the advice to pick a range cut. */
const asNote = (why: string) => why.replace(/[:.]\s*pick a range from that day on\.$/i, ".");

/** Least squares over equally spaced points (it lives in format.ts, so the page can draw it). */
export { linearFit };

export function buildFocus(input: {
  facts: Facts;
  /**
   * The facts from the first day of the longest grouping (chartWindows) to the range's end, for
   * the weekly and monthly charts; unset, they cover the range only.
   */
  wide?: Facts | null;
  previous: Facts | null;
  /** Under "Free survey", with whether all of it was the free survey's (freeAdsOnly). */
  ad: PageAdCost;
  filters: ApFilters;
  today: string;
  now: Date;
  /** Chapter ratings in the range (ap_report_extras' chapters); null when not read. */
  ratings: { up: number; down: number } | null;
  /** The Pay to start page's figures for the range (payToStartFor); null when not read. */
  pts?: PtsPayload | null;
  /** The report's EUR 1.99 gate now, read under "Free survey" only; null when it couldn't be. */
  gateOn?: boolean | null;
}): FocusPayload {
  const { facts, previous, ad, filters: f, today, now, ratings } = input;
  const wide = input.wide ?? facts;
  const scope: Scope = {
    assessment: f.assessment,
    source: f.source,
    device: f.device,
    tier: f.tier,
    visitor: f.visitor,
    funnel: f.funnel ?? "all",
  };
  const on = launched(scope);
  // Assessment B or C picked: nothing of theirs exists yet, so every figure is blank and says so.
  const notLive = on
    ? null
    : `${f.assessment === "b" ? "Assessment B" : "Assessment C"} has not launched yet: nothing to show.`;
  // A filter the records can't follow over this range: every figure about people is blank.
  const tablet = peopleBlocked(scope, facts.from);
  const t = totals(facts, scope);
  const p = previous && !peopleBlocked(scope, previous.from) ? totals(previous, scope) : null;
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
      value: tablet || notLive ? null : t.revenue,
      prev: p ? p.revenue : null,
      goodWhen: "up",
      spark: spark((from, to) => totals(facts, scope, from, to).revenue),
      foot: "",
      blocked: notLive ?? tablet,
      trend: "",
    },
    {
      key: "spend",
      label: "Ad spend",
      unit: "eur",
      value: notLive ? null : nowSpend,
      prev: sPrev,
      // A cost that is neither good nor bad by itself: its change is grey, as drawn.
      goodWhen: "either",
      spark: spark((from, to) => {
        const s = spend(ad, scope, from, to);
        return s.complete ? s.eur : null;
      }),
      foot: "",
      blocked: notLive ?? spendWhy,
      trend: "",
    },
    {
      key: "new-users",
      label: "New users",
      unit: "count",
      value: tablet || notLive ? null : newUsers(facts, facts.from, facts.to),
      prev: previous && p ? newUsers(previous, previous.from, previous.to) : null,
      goodWhen: "up",
      spark: spark((from, to) => newUsers(facts, from, to)),
      foot: "",
      blocked: notLive ?? tablet,
      trend: "",
    },
  ];

  // ---- the funnel comparison: the Pay to start page's own figures for the range (all traffic),
  // so both pages give the same numbers; the free survey's row is the reference each pay-to-start
  // row is read against.
  const pts = notLive ? null : (input.pts ?? null);
  const ref = pts?.funnels.find((x) => x.key === "after") ?? null;
  const validOf = (x: PtsFunnel): string => {
    if (!x.live) return "Off";
    if (x.key === "after") return "Reference";
    if (!ref || ref.all.visits === null || x.all.visits === null) return "—";
    if (x.all.visits === 0) return "No visitors yet";
    const t = proportionTest(ref.all.paid, ref.all.visits, x.all.paid, x.all.visits);
    if (t.confidence === null) return "Not yet";
    return t.confidence >= 0.95 ? "Yes, 95%+" : `Not yet, ${Math.round(t.confidence * 100)}%`;
  };
  const funnels: FocusPayload["funnels"] = {
    rows: (pts?.funnels ?? []).map((x): FunnelRow => ({
      key: x.key,
      label: x.label,
      sub: FUNNEL_SUB[x.key],
      live: x.live,
      visitors: x.all.visits,
      spend: x.spend,
      paying: x.all.paid,
      revenue: x.all.revenue,
      v2p: x.all.m.cvr,
      rpv: x.all.m.rpv,
      cpp: x.all.m.cac,
      roas: x.all.m.roas,
      valid: validOf(x),
    })),
    notes: notLive
      ? [notLive]
      : [
          !pts ? "Pay to start's figures could not be read just now. Try again in a minute." : null,
          activeNarrowing(f).length > 0 || f.funnel === "free"
            ? "All traffic: the funnels are compared over every visitor, whatever the filters."
            : null,
          ...(pts?.notes ?? []),
        ].filter((x): x is string => x !== null),
  };

  // ---- the six charts, each at every grain over its own window
  // The weekly and monthly charts read the wider facts before the range; the range's own inside
  // it, so that its tablets (marked only in a read from the day they were told apart) count.
  const src = (q: Period) => (q.from >= facts.from ? facts : wide);
  const windows = chartWindows(facts.from, facts.to);
  // Never before the facts read: without the wider read, every grouping covers the range.
  const windowOf = (g: Grain): Period => {
    const w = windows[g];
    return w.from < wide.from ? { from: facts.from, to: facts.to } : w;
  };
  const memo = new Map<string, Totals>();
  const tot = (q: Period): Totals => {
    const key = `${q.from}|${q.to}`;
    let v = memo.get(key);
    if (!v) memo.set(key, (v = totals(src(q), scope, q.from, q.to)));
    return v;
  };
  /**
   * The finishers of a period who bought a full unlock (Full, Full All, Core) so far, and those
   * full unlocks' count and revenue: a rate of the same people, as Payment CVR is.
   */
  const fullSales = (q: Period) => {
    const buyers = subsIn(src(q), scope, q.from, q.to).filter((s) => s.full);
    return {
      buyers: buyers.length,
      n: buyers.reduce((a, s) => a + s.fullSales, 0),
      revenue: buyers.reduce((a, s) => a + s.fullRevenue, 0),
    };
  };
  /**
   * The finishers of a period who pre-unlocked (paid EUR 1.99 for the Core Archetype) so far,
   * and those pre-unlocks' count and revenue, as `fullSales`. E07's day-4 gift is a EUR 0 row
   * and never one (`preBuysOf`).
   */
  const preSales = (q: Period) => {
    const buys = subsIn(src(q), scope, q.from, q.to).map(preBuysOf);
    return {
      buyers: buys.filter((b) => b.length > 0).length,
      n: buys.reduce((a, b) => a + b.length, 0),
      revenue: buys.flat().reduce((a, [, amount]) => a + amount, 0),
    };
  };
  // Before it was on sale nobody could pre-unlock: those points are blank, not 0%.
  const preWhy = (q: Period) =>
    q.from < PRE_ON_SALE_FROM
      ? `Pre-unlock figures start on ${rangeLabel(PRE_ON_SALE_FROM, PRE_ON_SALE_FROM)}, its first whole day on sale (from the evening before): pick a range from that day on.`
      : null;
  const users = (q: Period) =>
    new Set(subsIn(src(q), scope, q.from, q.to).map((s) => s.uid ?? -s.id)).size;
  const spendOf = (q: Period) => {
    const s = spend(ad, scope, q.from, q.to);
    return s.complete ? s.eur : null;
  };
  const startsOk = (q: Period) => startsComplete(q.from, today, scope);
  // Who can be counted over a period: each filter from the day it can be followed, and tablets
  // only in facts read from the day they were told apart.
  const people = (q: Period) => peopleBlocked(scope, q.from) ?? tabletBlocked(scope, src(q).from);
  // Survey starts never carry the country tier or a visitor history: under those filters the
  // start charts are blank with the reason.
  const startsWhy = (q: Period) =>
    scope.tier !== "all" || scope.visitor !== "all" ? startsBlocked(scope, q.from, today) : null;
  // A window reaching back past what survey starts still hold: those points are left out (they
  // have no figure) and the chart says from when, rather than giving up the points it has.
  const keptFrom =
    scope.source === "all" && EVENTS_COMPLETE_FROM < draftsKeptFrom(today)
      ? EVENTS_COMPLETE_FROM
      : draftsKeptFrom(today);
  const startsNotes = (w: Period) =>
    [
      startsOk(w)
        ? null
        : `Survey starts before ${shortDate(keptFrom)} are left out: ${
            scope.source === "all"
              ? "until 18 Sep 2026 a start was kept only with its draft"
              : "by source, a start is known only from its draft"
          }, and drafts are cleared after 30 days.`,
      // A device filter blanks only the points before the steps recorded the device.
      scope.device !== "all" && w.from < STEP_DEVICE_FROM
        ? `Survey starts record the device from ${rangeLabel(STEP_DEVICE_FROM, STEP_DEVICE_FROM)}: earlier points are blank.`
        : null,
    ]
      .filter(Boolean)
      .join(" ") || null;
  // "Free survey" sells the EUR 1.99 only through the report's gate: with it off and none sold
  // to the chart's finishers, blank with why, as every page's EUR 1.99 figure is.
  const preBlocked = PRE_PLANS.size
    ? scope.funnel === "free"
      ? freePreBlocked(
          input.gateOn,
          subsIn(wide, scope).some((s) => preBuysOf(s).length > 0) ||
            subsIn(facts, scope).some((s) => preBuysOf(s).length > 0)
        )
      : null
    : "The Initial plan (the pre-unlock) isn't on sale yet, so nothing has been pre-unlocked.";

  interface Def extends Omit<ChartSeries, "values" | "total" | "worked"> {
    /** The figure over a period or, with `den`, its numerator. */
    num: (q: Period) => number | null;
    den?: (q: Period) => number | null;
    /** Whether the figure is whole over a period (its spend recorded, its starts kept). */
    ok?: (q: Period) => boolean;
  }
  const valueOf = (d: Def, q: Period) => (d.den ? ratio(d.num(q), d.den(q)) : d.num(q));
  const chart = (
    key: string,
    title: string,
    subs: string,
    defs: Def[],
    opts: {
      /** Its title's info card. */
      info: string;
      /** Why nothing can be shown over a period, or null. */
      why: (q: Period) => string | null;
      wide?: boolean;
      leftMin?: number;
      perGrain?: boolean;
      grains?: Grain[];
      notes?: (w: Period) => string | null;
    }
  ): FocusChart => {
    const views = Object.fromEntries(
      GRAINS.map((g): [Grain, ChartView] => {
        const w = windowOf(g);
        const bs = buckets(w.from, w.to, g);
        const whyAt = bs.map((b) => opts.why(b));
        // Daily is the range, blank as one as the tiles are; a longer grouping draws what it can
        // and leaves blank the points before the filters can be followed.
        const blocked = g === "day" ? opts.why(w) : whyAt.every(Boolean) ? whyAt.at(-1)! : null;
        const series = defs.map((d): ChartSeries => {
          const { num, den, ok = () => true, ...shown } = d;
          const okAt = (q: Period) => !opts.why(q) && ok(q);
          // The legend's figure: the whole range for Daily, as the tiles; for a longer grouping
          // from its first point with a figure, as drawn.
          const first = bs.findIndex(okAt);
          const span = blocked
            ? null
            : g === "day"
              ? okAt(w)
                ? w
                : null
              : first < 0
                ? null
                : { from: bs[first]!.from, to: w.to };
          const total = span ? valueOf(d, span) : null;
          const money = d.unit === "eur";
          const worked =
            span && den && total !== null
              ? {
                  num: fmt(money ? "eur" : "count", num(span), money ? 2 : 0),
                  den: fmt("count", den(span)),
                }
              : undefined;
          return {
            ...shown,
            values: bs.map((b, i) => (whyAt[i] || !ok(b) ? null : valueOf(d, b))),
            total,
            ...(worked ? { worked } : {}),
            ...(span && total !== null ? { span } : {}),
          };
        });
        const reasons = [...new Set(whyAt.filter((x): x is string => x !== null))].map(asNote);
        const note =
          [g === "day" || blocked ? null : reasons.join(" ") || null, opts.notes?.(w) ?? null]
            .filter(Boolean)
            .join(" ") || null;
        return [
          g,
          {
            labels: bs.map((b) => b.label),
            periods: bs.map((b) => ({ from: b.from, to: b.to })),
            series,
            window: w,
            blocked,
            note,
          },
        ];
      })
    ) as Record<Grain, ChartView>;
    return {
      key,
      info: opts.info,
      title,
      sub: Object.fromEntries(
        GRAINS.map((g) => [g, opts.perGrain ? `${PER[g]}${subs}` : subs])
      ) as Record<Grain, string>,
      ...(opts.wide ? { wide: true } : {}),
      views,
      blocked: views.day.blocked ?? null,
      ...(opts.leftMin !== undefined ? { leftMin: opts.leftMin } : {}),
      ...(opts.grains ? { grains: opts.grains } : {}),
      ...(views.day.note ? { note: views.day.note } : {}),
    };
  };

  const charts: FocusChart[] = [
    chart(
      "submissions",
      "Survey submissions",
      ", with what each submission cost in ads and earned in revenue",
      [
        {
          name: "Survey submissions",
          info: "focus.subs",
          color: "purple",
          axis: "left",
          unit: "count",
          num: (q) => tot(q).subs,
        },
        {
          name: "Cost per submission",
          info: "focus.cost-per-sub",
          color: "ink",
          dotted: true,
          axis: "right",
          unit: "eur",
          digits: 2,
          lowerBetter: true,
          num: spendOf,
          den: (q) => tot(q).subs,
          ok: (q) => spendOf(q) !== null,
        },
        {
          name: "Revenue per submission",
          info: "focus.rev-per-sub",
          color: "green",
          axis: "right",
          unit: "eur",
          digits: 2,
          num: (q) => tot(q).revenue,
          den: (q) => tot(q).subs,
        },
      ],
      {
        info: "focus.chart-submissions",
        why: (q) => notLive ?? people(q),
        wide: true,
        perGrain: true,
      }
    ),
    chart(
      "start-cvr",
      "Visitor → survey start",
      "Survey starts ÷ visitors",
      [
        {
          name: "Start CVR",
          info: "focus.start-cvr",
          color: "purple",
          axis: "left",
          unit: "pct",
          digits: 2,
          num: (q) => tot(q).starts,
          den: (q) => tot(q).visits,
          ok: startsOk,
        },
      ],
      {
        info: "focus.chart-start",
        why: (q) => notLive ?? visitsBlocked(scope, q.from) ?? people(q) ?? startsWhy(q),
        notes: startsNotes,
      }
    ),
    chart(
      "completion",
      "Survey completion",
      "Submissions ÷ survey starts",
      [
        {
          name: "Completion CVR",
          info: "focus.completion",
          color: "purple",
          axis: "left",
          unit: "pct",
          num: (q) => tot(q).subs,
          den: (q) => tot(q).starts,
          ok: startsOk,
        },
      ],
      {
        info: "focus.chart-completion",
        why: (q) => notLive ?? people(q) ?? startsWhy(q),
        leftMin: 1,
        notes: startsNotes,
      }
    ),
    chart(
      "pre-unlock",
      "Completion → pre-unlock",
      "Submissions whose Core Archetype was pre-unlocked (EUR 1.99) so far ÷ submissions, and revenue per pre-unlock",
      [
        {
          name: "Pre-unlock rate",
          info: "focus.pre-rate",
          color: "purple",
          axis: "left",
          unit: "pct",
          digits: 2,
          num: (q) => preSales(q).buyers,
          den: (q) => tot(q).subs,
        },
        {
          name: "Revenue per pre-unlock",
          info: "focus.rev-per-pre",
          color: "green",
          axis: "right",
          unit: "eur",
          digits: 2,
          num: (q) => preSales(q).revenue,
          den: (q) => preSales(q).n,
        },
      ],
      {
        info: "focus.chart-pre-unlock",
        why: (q) => preBlocked ?? notLive ?? preWhy(q) ?? people(q),
      }
    ),
    chart(
      "full-unlock",
      "Completion → full unlock",
      "Submissions whose report was unlocked in full (Full, Full All or Core) so far ÷ submissions, and revenue per full unlock",
      [
        {
          name: "Full-unlock rate",
          info: "focus.full-rate",
          color: "purple",
          axis: "left",
          unit: "pct",
          digits: 2,
          num: (q) => fullSales(q).buyers,
          den: (q) => tot(q).subs,
        },
        {
          name: "Revenue per full unlock",
          info: "focus.rev-per-full",
          color: "green",
          axis: "right",
          unit: "eur",
          digits: 2,
          num: (q) => fullSales(q).revenue,
          den: (q) => fullSales(q).n,
        },
      ],
      { info: "focus.chart-full-unlock", why: (q) => notLive ?? people(q) }
    ),
    chart(
      "per-user",
      "Assessments per user",
      "Survey submissions ÷ unique people who finished, per month (unique counts are monthly only for now)",
      [
        {
          name: "Assessments per user",
          info: "focus.per-user",
          color: "purple",
          axis: "left",
          unit: "ratio",
          digits: 2,
          num: (q) => tot(q).subs,
          den: users,
        },
      ],
      // Per month only, as drawn: on a day, nearly everyone is one person per submission.
      {
        info: "focus.chart-per-user",
        why: (q) => notLive ?? people(q),
        grains: ["month"],
        leftMin: 1.5,
      }
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
  // Reading is saved for every visit from 18 Sep 2026: a range wholly before it has only a
  // few readers' reading, and says how many.
  const reportSub =
    facts.to < EVENTS_COMPLETE_FROM
      ? `${readers.toLocaleString("en-US")} reader${readers === 1 ? "" : "s"} with a measured visit (most visits were saved from 18 Sep 2026)`
      : facts.from < EVENTS_COMPLETE_FROM
        ? "from 18 Sep 2026, when every visit was recorded"
        : "live, since 18 Sep";
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
    paid: tablet ? null : t.paidCohort,
    revenue: tablet ? null : t.revenue,
    spend: tablet ? null : nowSpend,
    trend: tablet || !fit ? null : { values: daily, ...fit },
  };
  const laterRow = (label: string): AssessmentRow => ({
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
  // Chapter ratings aren't split by source, device, tier or visitor: under such a filter the
  // line says it is all traffic's.
  const allTraffic =
    activeNarrowing(f).length > 0 ? " (all traffic)" : f.funnel === "free" ? " (all funnels)" : "";
  // The "· A" boxes say why they are empty: A isn't what the filter shows, or the filter can't
  // be followed over this range; never "0 submissions" beside a blank.
  const aWhy = !on
    ? `${f.assessment === "b" ? "Assessment B" : "Assessment C"} has not launched: these boxes are Assessment A's.`
    : tablet;
  const rows =
    f.assessment === "b" || f.assessment === "c"
      ? [laterRow(f.assessment === "b" ? "Assessment B" : "Assessment C")]
      : f.assessment === "a"
        ? [aRow]
        : [aRow, laterRow("Assessment B"), laterRow("Assessment C")];
  // "since 21 Sep", with the year only when the range runs into the next one.
  const since = `${shortDate(facts.from)}${facts.from.slice(0, 4) === facts.to.slice(0, 4) ? "" : ` ${facts.from.slice(0, 4)}`}`;

  return {
    ...head(f, today, now, true, facts),
    launched: on,
    tiles,
    funnels,
    charts,
    assessments: {
      best: on
        ? {
            label: "Assessment A",
            sub: tablet
              ? `Only live assessment · ${tablet}`
              : `Only live assessment · ${eur(aRow.revPerSub)} revenue per submission, ${
                  aRow.costPerSub === null && spendWhy
                    ? `no cost per submission (${lowerFirst(spendWhy.replace(/\.$/, ""))})`
                    : `${eur(aRow.costPerSub)} cost per submission`
                }`,
          }
        : null,
      nps: {
        // A's ratings: under B or C, blank like the other "· A" boxes.
        sub: !on
          ? aWhy!
          : !ratings
            ? "Not asked yet."
            : votes === 0
              ? `Not asked yet. No chapter was rated in this range${allTraffic}.`
              : `Not asked yet. ${Math.round((ratings.up / votes) * 100)}% of ${count(votes)} chapter rating${votes === 1 ? "" : "s"} say helpful${allTraffic}.`,
        ratings: on && ratings && votes > 0 ? { up: ratings.up, votes } : null,
      },
      survey: {
        valueMs: aWhy ? null : aRow.surveyMedianMs,
        sub:
          aWhy ??
          `${count(aRow.submissions ?? 0)} submission${aRow.submissions === 1 ? "" : "s"} since ${since}`,
      },
      report: {
        valueMs: aWhy ? null : aRow.reportMedianMs,
        sub:
          aWhy ??
          `${count(readers)} reader${readers === 1 ? "" : "s"} with a measured visit${
            readMean === null ? "" : ` · average ${fmt("mmss", readMean)}`
          }`,
      },
      rows,
      trendLabel: `Submissions trend · ${dayCount(facts.from, facts.to)} days`,
    },
  };
}
