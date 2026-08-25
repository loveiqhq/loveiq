/**
 * One trend chart per LIVE A/B test, for the daily Slack conversion digest.
 *
 * WHY A GATE RATHER THAN THREE CHARTS. The digest used to draw the landing axis
 * only. Charting all three unconditionally looks like more information and is
 * usually less: measured on 2026-08-25, only one axis had enough history
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
 * `paywall` is absent by construction: not in CHART_AXES, and the RPC does not
 * emit it either. `survey` is absent differently and is worth the distinction —
 * it IS still emitted by the RPC, and is dropped purely because CHART_AXES does
 * not list it. Extra rows for an unlisted axis are filtered by `rowsForAxis`, so
 * they cost nothing; do not take the paywall sentence to mean an unlisted axis
 * cannot arrive in the data. That experiment concluded, so a chart would be inventing a
 * test that is not running.
 */

import { computeRate } from "@features/admin/server/digest-metrics";
import { getPricingBucketsForPlan } from "@features/pricing/logic/reportPricing";
import { DEFAULT_REPORT_PURCHASE_PLAN_ID } from "@features/checkout/server/reportPurchase";
import { armLabel, AXIS_TITLES, isKnownArm } from "@features/attribution/server/labels";
import {
  formatSignalSummary,
  type StatisticalSignal,
  MIN_CELL_COUNT,
  twoProportionSignal,
} from "@features/admin/server/statistics";

/** The axes that are actively randomised. Deliberately NOT derived from
 *  AXIS_TITLES, which also contains the CONCLUDED paywall and survey-theme axes —
 *  a keys() loop over that is exactly how a dead experiment gets charted. */
export const CHART_AXES = ["pricing", "landing"] as const;
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

/**
 * An axis that cannot carry a trend line yet.
 *
 * It gets a few bullets rather than a chart. Two independent reviews of a
 * charted version of this said the same thing: at these volumes a picture
 * invites a conclusion the numbers cannot support — a rate off three events
 * reads as a finding, and a line through two days reads as a direction. Counts
 * in text cannot do that, and they are readable on a phone, which the 11px type
 * on a downscaled PNG is not.
 */
export interface AxisCounts {
  axis: ChartAxis;
  axisTitle: string;
  /** Slack mrkdwn: a headline line plus one bullet per arm plus one caveat. */
  text: string;
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

/**
 * "dearer, base EUR 39.99" — DERIVED, never hardcoded.
 *
 * Pricing 2.1 inverted which arm was dearer on 2026-08-24 and nothing failed,
 * because the direction had been baked into arm names. The reader cannot judge a
 * price test without knowing which side is which, and a name cannot know. The
 * entry tier is the reference: every reader is shown that one.
 */
function pricingSide(axis: ChartAxis, arm: string): string {
  if (axis !== "pricing" || (arm !== "A" && arm !== "B")) return "";
  const buckets = getPricingBucketsForPlan(DEFAULT_REPORT_PURCHASE_PLAN_ID);
  const mine = buckets.find((b) => b.code === arm);
  const other = buckets.find((b) => b.code !== arm && (b.code === "A" || b.code === "B"));
  if (!mine || !other) return "";
  const money = (cents: number) => `EUR ${(cents / 100).toFixed(2)}`;
  if (mine.startingCents === other.startingCents) return ` — same base price both sides`;
  const side = mine.startingCents > other.startingCents ? "dearer" : "cheaper";
  return ` — ${side}, base ${money(mine.startingCents)}`;
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
  /**
   * State the gap from the LEADER's side, whoever that is.
   *
   * `delta` is a-minus-b, so a negative delta means b leads. The inconclusive
   * branch hardcoded `aLabel` as the one ahead and was simply wrong whenever b
   * led; the significant branch named the right arm but printed its gap as a
   * negative number, so the winning arm appeared to be losing. Both only stayed
   * hidden because `a` happened to be the higher-converting arm under the old
   * volume-based ordering.
   */
  if (signal.delta === 0) {
    return `Dead level so far (${formatSignalSummary(signal)}).`;
  }
  const aAhead = signal.delta > 0;
  const leader = aAhead ? aLabel : bLabel;
  const oriented: StatisticalSignal = aAhead
    ? signal
    : {
        ...signal,
        delta: -signal.delta,
        ciLow: signal.ciHigh == null ? null : -signal.ciHigh,
        ciHigh: signal.ciLow == null ? null : -signal.ciLow,
      };
  if (signal.significance === "inconclusive") {
    return `No clear winner yet — ${leader} is ahead but the gap could still be chance (${formatSignalSummary(oriented)}).`;
  }
  return `${leader} is genuinely ahead (${formatSignalSummary(oriented)}).`;
}

/** Three words for a header line; the full sentence is for a charted axis. */
function verdictShort(aN: number, aConv: number, bN: number, bConv: number): string {
  const signal = twoProportionSignal(bN, bConv, aN, aConv);
  if (signal.significance === "insufficient-data") return "too early to call";
  if (signal.significance === "inconclusive") return "no clear winner yet";
  return "a real difference — see /admin";
}

type ArmTotals = { arm: string; completions: number; checkouts: number; paid: number };

/**
 * The bullets for an axis that cannot carry a trend line: one glance line, one
 * line per arm, the verdict, and why there is no chart.
 */
function countsFor(
  axis: ChartAxis,
  axisTitle: string,
  a: ArmTotals,
  b: ArmTotals,
  validFrom: string | null,
  reason: string
): AxisCounts {
  const since = validFrom ? `since ${human(validFrom)} · ` : "";
  const armLine = (t: ArmTotals) =>
    `• *${armLabel(axis, t.arm).short}*${pricingSide(axis, t.arm)} — ${t.completions} finished → ${t.checkouts} checkout → ${t.paid} paid`;
  return {
    axis,
    axisTitle,
    // One header line carrying the window, the verdict and when a chart arrives,
    // then one line per arm. What used to be here as well — the full significance
    // sentence, why the window starts where it does, what a trailing rate needs —
    // was explanation of an absence rather than information.
    text: [
      `*${axisTitle}* — ${since}${verdictShort(a.completions, a.checkouts, b.completions, b.checkouts)} · ${reason}`,
      armLine(a),
      armLine(b),
    ].join("\n"),
  };
}

/**
 * `purchaseNote` used to explain, in a sentence, why purchases were not drawn as
 * a second line. Removed: the reader does not need the argument for a chart that
 * is not there, and the paid COUNT now sits on each arm's own line, where it is
 * useful rather than defensive.
 */

export interface AxisTrends {
  charted: AxisChart[];
  /** Too young or too thin for a trend line — drawn as counts. */
  counts: AxisCounts[];
  /** Nothing to compare at all (fewer than two arms with data). */
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
  const counts: AxisCounts[] = [];
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
    /**
     * Ordered by LABEL, not by volume.
     *
     * Volume order was meant to keep colour stable run to run, and does while an
     * arm leads comfortably. On a young axis it does the opposite: measured on
     * real pricing rows the arms sat at 14 and 15 completions, so one ordinary
     * day flips which arm is purple — and with it the colour of everything the
     * reader is trying to compare against yesterday's message. Label order also
     * puts A before B, which is how the arms are named in the meeting.
     */
    const arms = [...byArm.entries()]
      .map(([arm, t]) => ({ arm, ...t }))
      .sort((l, r) => armLabel(axis, l.arm).short.localeCompare(armLabel(axis, r.arm).short));

    if (arms.length < 2) {
      skipped.push({
        axis,
        axisTitle,
        // "only" belongs INSIDE the one-arm branch. Hoisted out it produced
        // "no chart yet: only no arms have data" on the zero-arm path.
        caption: `*${axisTitle}* — no chart yet: ${
          arms.length === 1
            ? `only ${armLabel(axis, arms[0]!.arm).short} has data`
            : "no arm has data"
        } in the comparable window, so there is nothing to compare against.`,
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
      // +MIN_TREND_DAYS, not +MIN_TREND_DAYS-1: the digest always reports on
      // YESTERDAY, so the run that first has seven days behind it is the one a
      // day later. The old arithmetic named a date whose own digest still had no
      // line on it.
      const readyOn = human(addDays(validFrom ?? firstDay, MIN_TREND_DAYS));
      // eslint-disable-next-line security/detect-object-injection -- closed union.
      const why = AXIS_VALID_FROM[axis]?.why;
      counts.push(countsFor(axis, axisTitle, a, b, validFrom, `chart from ${readyOn}`));
      continue;
    }

    // Gate 2: the smaller arm has to carry enough people that its line is not
    // moved bodily by one person.
    if (smaller < MIN_ARM_COMPLETIONS) {
      const smallLabel = armLabel(axis, a.completions <= b.completions ? a.arm : b.arm).short;
      counts.push(
        countsFor(
          axis,
          axisTitle,
          a,
          b,
          validFrom,
          `chart once ${smallLabel} passes ${MIN_ARM_COMPLETIONS} finished`
        )
      );
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
      caption: `*${axisTitle}* — ${aLabel} ${aRate}% (${a.checkouts}/${a.completions}) to checkout, ${a.paid} paid · ${bLabel} ${bRate}% (${b.checkouts}/${b.completions}), ${b.paid} paid. ${verdictSentence(aLabel, a.completions, a.checkouts, bLabel, b.completions, b.checkouts)}`,
    });
  }

  return { charted, counts, skipped };
}
