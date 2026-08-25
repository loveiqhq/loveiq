/**
 * One trend chart per LIVE A/B test, for the daily Slack conversion digest.
 *
 * WHY A GATE RATHER THAN THREE CHARTS. The digest used to draw the landing axis
 * only. Charting all three unconditionally looks like more information and is
 * usually less: measured on 2026-08-25, only the survey axis had enough history
 * to say anything. Pricing's arm A was repriced ~4x on 24 Aug, so a line
 * spanning that date averages two different products under one label; the
 * landing test restarted on 21 Aug, so it had five days against a 7-day
 * trailing window. Both would have drawn a confident-looking line over data that
 * cannot support one.
 *
 * So every axis is BUILT and each is gated on its own data. An axis that fails
 * the gate is not hidden — it gets one sentence saying why and roughly when it
 * will appear — and it starts charting itself as soon as its window matures,
 * with no code change and nobody having to remember.
 *
 * `paywall` is absent by construction: it is not in CHART_AXES, and the RPC does
 * not emit it either. That experiment concluded, so a chart would be inventing a
 * test that is not running.
 */

import { computeRate } from "@features/admin/server/digest-metrics";
import { armLabel, AXIS_TITLES, isKnownArm } from "@features/attribution/server/labels";
import {
  formatSignalSummary,
  MIN_CELL_COUNT,
  twoProportionSignal,
} from "@features/admin/server/statistics";

/** The axes that are actively randomised. Deliberately NOT derived from
 *  AXIS_TITLES, which also contains the concluded paywall axis — a keys() loop
 *  over that is exactly how a dead experiment gets charted. */
export const CHART_AXES = ["survey", "pricing", "landing"] as const;
export type ChartAxis = (typeof CHART_AXES)[number];

export interface AxisFunnelRow {
  axis: string;
  arm: string;
  /** YYYY-MM-DD */
  day: string;
  completions: number;
  checkouts: number;
  paid: number;
}

/**
 * The date each axis's CURRENT comparison became like-for-like. Days before it
 * are a different experiment wearing the same arm names, so they are cut rather
 * than caveated — a caveat under a misleading line is still a misleading line.
 */
export const AXIS_VALID_FROM: Record<ChartAxis, { day: string; why: string } | null> = {
  // The survey theme test has run unchanged throughout the reporting window.
  survey: null,
  // Pricing 2.1 raised arm A roughly 4x (A 39.99/49.99/59 vs B 29/39/49).
  pricing: {
    day: "2026-08-24",
    why: "the cheaper and dearer prices were changed on 24 Aug, so earlier days are a different product wearing the same labels",
  },
  // Round 2 of the landing test: the current white design vs the pre-rebuild
  // one. Round 1 (dark vs white) reused the same "white" arm name, so days
  // before this belong to a different experiment.
  landing: {
    day: "2026-08-21",
    why: "the current two versions only started running against each other on 21 Aug",
  },
};

/** A 7-day trailing rate is meaningless before there are 7 days of it. */
export const MIN_TREND_DAYS = 7;
/** Below this the smaller arm's daily rate swings on single events. */
export const MIN_ARM_COMPLETIONS = 20;

/**
 * Purchases needed across the window before a LINE of them would be readable.
 *
 * The unit that matters is conversions per arm per TRAILING WINDOW, not per
 * month: the chart plots a 7-day rate, so ten purchases over thirty days is
 * about two per arm per week and draws a flat zero with occasional spikes. This
 * is MIN_CELL_COUNT per arm per week across two arms and roughly four weeks of
 * chart — the smallest total at which a typical window has enough to shape a
 * curve. My first attempt used MIN_CELL_COUNT * 2, which flipped to "plenty" at
 * exactly the ten purchases that motivated not drawing them.
 */
export const MIN_PAID_TO_DRAW = MIN_CELL_COUNT * 2 * 4;

export interface AxisChart {
  axis: ChartAxis;
  axisTitle: string;
  /** Arm codes, higher-volume arm first so colour is stable run to run. */
  arms: [string, string];
  legendFirst: string;
  legendLast: string;
  title: string;
  labels: string[];
  headline: string;
  footnote: string;
  /** The Slack caption that rides ABOVE the image. */
  caption: string;
}

export interface SkippedAxis {
  axis: ChartAxis;
  axisTitle: string;
  /** One Slack line explaining why there is no chart and when there will be. */
  caption: string;
}

function daysBetween(fromDay: string, toDay: string): number {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

function addDays(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t)) return day;
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/** "31 Aug" */
function human(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/** Rows for one axis, clipped to that axis's like-for-like window. */
export function rowsForAxis(
  rows: AxisFunnelRow[],
  axis: ChartAxis
): { rows: AxisFunnelRow[]; validFrom: string | null } {
  // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
  const valid = AXIS_VALID_FROM[axis];
  const validFrom = valid?.day ?? null;
  const scoped = rows.filter(
    (r) =>
      r.axis === axis &&
      isKnownArm(axis, r.arm) &&
      !armLabel(axis, r.arm).retired &&
      (!validFrom || r.day >= validFrom)
  );
  return { rows: scoped, validFrom };
}

/**
 * Plain-English significance for the checkout comparison.
 *
 * Deliberately NOT a bare p-value: this goes to a channel read by people who do
 * not read p-values, and `formatSignalSummary` already renders the interval in
 * words. `twoProportionSignal` refuses outright below MIN_CELL_COUNT successes
 * or failures in any arm, which is what stops the caption implying a dead heat
 * was measured when nothing was.
 */
function verdictSentence(
  aLabel: string,
  aN: number,
  aConv: number,
  bLabel: string,
  bN: number,
  bConv: number
): string {
  const signal = twoProportionSignal(bN, bConv, aN, aConv);
  if (signal.significance === "insufficient-data") {
    return `Not enough to compare yet — each side needs at least ${MIN_CELL_COUNT} people reaching checkout.`;
  }
  if (signal.significance === "inconclusive") {
    return `No clear winner yet — ${aLabel} is ahead but the gap could still be chance (${formatSignalSummary(signal)}).`;
  }
  const leader = signal.delta >= 0 ? aLabel : bLabel;
  return `${leader} is genuinely ahead (${formatSignalSummary(signal)}).`;
}

/**
 * Why purchases are a number here and not a second line.
 *
 * Conditional on the count, not a fixed sentence. The claim "too few to make a
 * line mean anything" was unconditional, which is the one thing this module is
 * not allowed to do — every other statement it makes is gated on the data. It is
 * true at today's volumes and would quietly become a lie the moment purchases
 * grow, which is exactly when someone would want the line drawn.
 */
function purchaseNote(paidTotal: number): string {
  if (paidTotal < MIN_PAID_TO_DRAW) {
    return `Purchases are in the totals below and deliberately not drawn — ${paidTotal} in this window is too few for a line to mean anything.`;
  }
  return `${paidTotal} purchases in this window; see the totals below.`;
}

export interface AxisTrends {
  charted: AxisChart[];
  skipped: SkippedAxis[];
}

/**
 * Build a chart per axis that can support one, and a one-line explanation for
 * each that cannot.
 *
 * `today` is passed in rather than read from the clock so the gate is testable
 * and so a single digest run cannot straddle midnight between axes.
 */
export function buildAxisTrends(rows: AxisFunnelRow[], today: string): AxisTrends {
  const charted: AxisChart[] = [];
  const skipped: SkippedAxis[] = [];

  for (const axis of CHART_AXES) {
    // eslint-disable-next-line security/detect-object-injection -- closed union.
    const axisTitle = AXIS_TITLES[axis];
    const { rows: scoped, validFrom } = rowsForAxis(rows, axis);

    // Totals per arm, over the like-for-like window only.
    const byArm = new Map<string, { completions: number; checkouts: number; paid: number }>();
    for (const r of scoped) {
      const cur = byArm.get(r.arm) ?? { completions: 0, checkouts: 0, paid: 0 };
      cur.completions += r.completions;
      cur.checkouts += r.checkouts;
      cur.paid += r.paid;
      byArm.set(r.arm, cur);
    }
    const arms = [...byArm.entries()]
      .map(([arm, t]) => ({ arm, ...t }))
      .sort((l, r) => r.completions - l.completions);

    if (arms.length < 2) {
      skipped.push({
        axis,
        axisTitle,
        caption: `*${axisTitle}* — no chart yet: only ${arms.length === 1 ? `${armLabel(axis, arms[0]!.arm).short} has` : "no arms have"} data in the comparable window, so there is nothing to compare against.`,
      });
      continue;
    }

    const [a, b] = arms as [(typeof arms)[number], (typeof arms)[number]];
    const days = [...new Set(scoped.map((r) => r.day))].sort();
    const firstDay = days[0]!;
    const daysAvailable = daysBetween(validFrom ?? firstDay, today);
    const smaller = Math.min(a.completions, b.completions);

    // Gate 1: a 7-day trailing rate needs 7 days of like-for-like data.
    if (daysAvailable < MIN_TREND_DAYS) {
      const readyOn = human(addDays(validFrom ?? firstDay, MIN_TREND_DAYS - 1));
      // eslint-disable-next-line security/detect-object-injection -- closed union.
      const why = AXIS_VALID_FROM[axis]?.why;
      skipped.push({
        axis,
        axisTitle,
        caption: `*${axisTitle}* — no chart yet: only ${daysAvailable} ${daysAvailable === 1 ? "day" : "days"} of like-for-like data so far.${why ? ` That is because ${why}.` : ""} The trend needs ${MIN_TREND_DAYS} days, so it should appear around ${readyOn}. Totals are in /admin meanwhile.`,
      });
      continue;
    }

    // Gate 2: the smaller arm has to carry enough people that its line is not
    // moved bodily by one person.
    if (smaller < MIN_ARM_COMPLETIONS) {
      const smallLabel = armLabel(axis, a.completions <= b.completions ? a.arm : b.arm).short;
      skipped.push({
        axis,
        axisTitle,
        caption: `*${axisTitle}* — no chart yet: ${smallLabel} has only ${smaller} finished ${smaller === 1 ? "survey" : "surveys"} in the comparable window (needs ${MIN_ARM_COMPLETIONS}), so its line would move on single people rather than on a trend.`,
      });
      continue;
    }

    const aLabel = armLabel(axis, a.arm).short;
    const bLabel = armLabel(axis, b.arm).short;
    const aRate = computeRate(a.checkouts, a.completions);
    const bRate = computeRate(b.checkouts, b.completions);
    const paidTotal = a.paid + b.paid;

    // The A/B letters are in the arm labels, but "which is which" still needs
    // saying once for the landing test, where both arms are white designs.
    const key =
      axis === "landing"
        ? ` A is the design live since ${human(AXIS_VALID_FROM.landing!.day)}; B is the one it replaced.`
        : "";

    charted.push({
      axis,
      axisTitle,
      arms: [a.arm, b.arm],
      legendFirst: aLabel,
      legendLast: bLabel,
      title: `${axisTitle} — reached checkout per finished survey`,
      labels: [],
      headline: `${aLabel} ${a.checkouts}/${a.completions} = ${aRate}%  ·  ${bLabel} ${b.checkouts}/${b.completions} = ${bRate}%`,
      footnote: `7-day trailing rate · a gap means no finished surveys that day${validFrom ? ` · from ${human(validFrom)}` : ""}`,
      caption: `*${axisTitle}* — ${aLabel} ${aRate}% (${a.checkouts}/${a.completions}) vs ${bLabel} ${bRate}% (${b.checkouts}/${b.completions}) reaching checkout. ${verdictSentence(aLabel, a.completions, a.checkouts, bLabel, b.completions, b.checkouts)}${key} ${purchaseNote(paidTotal)}`,
    });
  }

  return { charted, skipped };
}
