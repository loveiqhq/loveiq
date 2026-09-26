/**
 * The A/B readouts, shared by /admin's overview and the brain's `experiments` tool, so a
 * test reads the same in both places. Moved out of app/api/admin/ab-overview/route.ts
 * unchanged on 2026-09-26; the route still explains why each count is taken as it is.
 */
import { computeRate } from "@features/admin/server/digest-metrics";
import {
  formatSignalSummary,
  MIN_CELL_COUNT,
  twoProportionSignal,
} from "@features/admin/server/statistics";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  activeArms,
  armLabel,
  AXIS_TITLES,
  type ExperimentAxis,
} from "@features/attribution/server/labels";
import { readStampedArms } from "@features/attribution/server/traffic";
import logger from "@shared/observability/logger";

/** Hard ceiling per collection, paged 1000 at a time. */
const MAX_ROWS = 20_000;

/**
 * Below this, an arm is reported as "too early to compare" regardless of what the
 * z-test says — a lopsided split (e.g. 828 vs 9) satisfies the combined-n>=50 rule
 * on the strength of the large arm alone.
 */
const TINY_ARM = 30;

const QUOTE_COLUMNS = [
  "survey_submission_id",
  "experiment_group",
  "base_price_bucket",
  "current_price",
  "purchased_at",
  "checkout_started_at",
].join(",");

export interface ArmStat {
  arm: string;
  label: string;
  retired: boolean;
  /** People we can attribute to this arm. */
  n: number;
  purchases: number;
  /** Purchase rate, 0–100 with one decimal. */
  rate: number;
  revenue: number;
}

export interface ExperimentReadout {
  axis: ExperimentAxis;
  title: string;
  arms: ArmStat[];
  /** Attributable people with no arm recorded — shown, never hidden. */
  unattributed: number;
  /** Plain-English verdict. Always safe to print. */
  verdict: string;
  significance: string;
}

export interface ConcludedExperiment {
  title: string;
  outcome: string;
}

interface SubmissionRow {
  id: number;
  created_date_time: string | null;
  utm_tracker: string | null;
}

interface QuoteRow {
  survey_submission_id: number;
  experiment_group: string | null;
  base_price_bucket: string | null;
  current_price: number | string | null;
  purchased_at: string | null;
  checkout_started_at: string | null;
}

/**
 * Page through a PostgREST collection.
 *
 * PostgREST enforces its own `max-rows` (1000 here) and silently ignores a larger
 * `limit`, so a single request returns 1000 rows and looks complete. That bit this
 * route during validation: two independently-capped fetches covered different
 * submissions, which inflated "unattributed" to 667 and under-counted purchases
 * per arm. Page explicitly with Range, and report truncation honestly.
 */
export async function fetchAllPages<T>(
  buildPath: (offset: number, pageSize: number) => string,
  what: string
): Promise<{ rows: T[]; truncated: boolean }> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const res = await supabaseFetch(buildPath(offset, PAGE), {
      headers: { Range: `${offset}-${offset + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (!res.ok) {
      logger.warn({ status: res.status, what, offset }, "ab-overview: page fetch failed");
      break;
    }
    const page = (await res.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE) return { rows, truncated: false };
  }
  // Ran to the cap without a short page — there may well be more.
  return { rows, truncated: rows.length >= MAX_ROWS };
}

export function num(value: number | string | null): number {
  if (value === null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compare each arm against the best-performing OTHER arm and describe the result
 * in words. Never claims a winner the statistics do not support.
 */
function buildReadout(
  axis: ExperimentAxis,
  arms: ArmStat[],
  unattributed: number
): ExperimentReadout {
  /**
   * The CALLER decides which arms belong in the comparison; this only drops the
   * ones with nobody in them.
   *
   * It used to re-filter on `retired` as well, which was redundant on the live
   * path (`tally` has already removed them) and wrong on the concluded one,
   * where it silently collapsed a finished two-arm result down to "only V2 has
   * data, so there is nothing to compare against" — of a test we had just
   * compared.
   */
  const contenders = arms.filter((a) => a.n > 0);
  let verdict = "No data yet.";
  let significance = "insufficient-data";

  if (contenders.length >= 2) {
    const sorted = [...contenders].sort((a, b) => b.rate - a.rate);
    const [leader, runnerUp] = sorted as [ArmStat, ArmStat];
    const signal = twoProportionSignal(runnerUp.n, runnerUp.purchases, leader.n, leader.purchases);
    significance = signal.significance;

    const smallest = contenders.reduce((min, a) => (a.n < min.n ? a : min), contenders[0]!);

    /*
     * Three separate reasons not to decide, each naming its own cause. Testing
     * `signal.significance === "insufficient-data"` FIRST used to swallow the
     * other two: once twoProportionSignal also refused on too-few purchases, the
     * small-arm branch below became unreachable for the very shape it was written
     * for (300 vs 9), and every case collapsed into one vague sentence.
     */
    if (leader.n + runnerUp.n < 50) {
      verdict = `Not enough data to call this yet — the smallest group has ${smallest.n} ${
        smallest.n === 1 ? "person" : "people"
      }. Treat any difference as noise for now.`;
    } else if (smallest.n < TINY_ARM) {
      /*
       * The combined-sample check inside twoProportionSignal is satisfied by a big
       * arm alone: 828 vs 9 clears n>=50 and comes back "inconclusive", so without
       * this branch the page would read "Landing Page V2 is ahead (2.1% vs 0.0%)"
       * and never mention that the comparison rests on nine people. That is exactly
       * the wrong impression to leave with a non-technical reader.
       */
      verdict = `Too early to compare — ${smallest.label} has only ${smallest.n} ${
        smallest.n === 1 ? "person" : "people"
      } so far. Ignore the difference until that grows.`;
    } else if (signal.significance === "insufficient-data") {
      // Both groups are big enough; it is the PURCHASES that are too few for the
      // comparison to mean anything. Naming the group sizes here would be
      // actively misleading — they are not what is short.
      const purchases = leader.purchases + runnerUp.purchases;
      verdict = `Not enough purchases yet to compare — ${purchases} ${
        purchases === 1 ? "person has" : "people have"
      } bought across both groups. Each side needs at least ${MIN_CELL_COUNT}.`;
    } else if (signal.significance === "inconclusive") {
      verdict = `No clear winner yet. ${leader.label} is ahead (${leader.rate}% vs ${runnerUp.rate}%) but the gap could still be chance.`;
    } else {
      verdict = `${leader.label} is genuinely ahead — ${leader.rate}% vs ${runnerUp.rate}% (${formatSignalSummary(signal)}).`;
    }
  } else if (contenders.length === 1) {
    verdict = `Only ${contenders[0]!.label} has data, so there is nothing to compare against.`;
  }

  if (unattributed > 0) {
    verdict += ` ${unattributed} ${unattributed === 1 ? "person is" : "people are"} not attributable to an arm.`;
  }

  // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
  const title = AXIS_TITLES[axis];
  return { axis, title, arms, unattributed, verdict, significance };
}

/** Completed submissions in a window, and what each one bought, joined to its quote. */
export interface ArmOutcomes {
  submissions: SubmissionRow[];
  bySubmission: Map<
    number,
    { pricing: string | null; purchased: boolean; startedCheckout: boolean; revenue: number }
  >;
  /** Set when a scan hit MAX_ROWS. */
  truncated: boolean;
}

export async function loadArmOutcomes(since: string): Promise<ArmOutcomes> {
  const subsPage = await fetchAllPages<SubmissionRow>(
    (offset, pageSize) =>
      // status=eq.completed matches what fetchFunnelStages counts as a completion, so
      // the headline number and the funnel step can never drift apart.
      `/rest/v1/survey_submission?created_date_time=gte.${since}&status=eq.completed` +
      `&select=id,created_date_time,utm_tracker&order=id.asc&offset=${offset}&limit=${pageSize}`,
    "survey_submission"
  );
  const submissions = subsPage.rows;

  // Join the quotes by SUBMISSION ID RANGE rather than by their own created date:
  // a quote can be created outside the submission window, and filtering it by date
  // silently drops real purchases. Ids are monotonic, so ">= the smallest id in the
  // window" is an index-friendly narrowing that cannot miss one — and it avoids
  // interpolating a huge `in.(...)` list into the URL the way /api/admin/stats does.
  const minId = submissions.length > 0 ? Math.min(...submissions.map((s2) => s2.id)) : 0;
  const quotesPage =
    submissions.length > 0
      ? await fetchAllPages<QuoteRow>(
          (offset, pageSize) =>
            `/rest/v1/report_price_quote?survey_submission_id=gte.${minId}` +
            `&select=${QUOTE_COLUMNS}&order=survey_submission_id.asc` +
            `&offset=${offset}&limit=${pageSize}`,
          "report_price_quote"
        )
      : { rows: [] as QuoteRow[], truncated: false };
  const quotes = quotesPage.rows;

  // Collapse quotes to one entry per submission: did they buy, for how much, and
  // which arms were they in. A reader has one pricing arm across all their plans.
  const bySubmission = new Map<
    number,
    {
      pricing: string | null;
      purchased: boolean;
      startedCheckout: boolean;
      revenue: number;
    }
  >();
  for (const q of quotes) {
    const key = q.survey_submission_id;
    const existing = bySubmission.get(key) ?? {
      pricing: null,
      purchased: false,
      startedCheckout: false,
      revenue: 0,
    };
    if (q.checkout_started_at) existing.startedCheckout = true;
    existing.pricing ??= q.experiment_group ?? q.base_price_bucket ?? null;
    if (q.purchased_at) {
      existing.purchased = true;
      existing.revenue += num(q.current_price);
    }
    bySubmission.set(key, existing);
  }

  return { submissions, bySubmission, truncated: subsPage.truncated || quotesPage.truncated };
}

/** Tally purchases and revenue per arm for one axis. */
export function tallyAxis(
  outcomes: ArmOutcomes,
  axis: ExperimentAxis,
  armOf: (id: number, tracker: string | null) => string | null,
  /**
   * The exact arms this readout compares, retired ones included.
   *
   * For a LIVE readout, leave it out: the arms are whatever is being
   * assigned, and a retired arm is noise at best and an invitation to
   * compare against a dead arm at worst.
   *
   * For a CONCLUDED one, name them. Dropping the losing arm leaves a
   * one-sided record of a two-sided result — "V2: 9.9%" with nothing to read
   * it against — but simply keeping every retired arm is worse: `control` is
   * the round-1 DARK landing, and putting it beside V1 and V2 compares three
   * arms drawn from two different experiments.
   */
  opts?: { arms?: string[] }
) {
  const counts = new Map<string, { n: number; purchases: number; revenue: number }>();
  let unattributed = 0;
  for (const sub of outcomes.submissions) {
    const arm = armOf(sub.id, sub.utm_tracker);
    if (!arm) {
      unattributed += 1;
      continue;
    }
    const entry = counts.get(arm) ?? { n: 0, purchases: 0, revenue: 0 };
    entry.n += 1;
    const outcome = outcomes.bySubmission.get(sub.id);
    if (outcome?.purchased) {
      entry.purchases += 1;
      entry.revenue += outcome.revenue;
    }
    counts.set(arm, entry);
  }

  // Always render the arms we actively assign, even at zero, so an empty arm is
  // visible rather than missing. Retired arms appear only if they have data.
  const armKeys = [...new Set([...(opts?.arms ?? activeArms(axis)), ...counts.keys()])];
  const arms: ArmStat[] = armKeys.map((arm) => {
    const c = counts.get(arm) ?? { n: 0, purchases: 0, revenue: 0 };
    const label = armLabel(axis, arm);
    return {
      arm,
      label: label.short,
      retired: Boolean(label.retired),
      n: c.n,
      purchases: c.purchases,
      rate: computeRate(c.purchases, c.n),
      revenue: Math.round(c.revenue * 100) / 100,
    };
  });
  // Retired arms are dropped from the display entirely: they are not being
  // assigned to anyone, so a row for them is noise at best and an invitation
  // to compare against a dead arm at worst. Their traffic still shows up in
  // `unattributed` so no one is silently uncounted.
  if (opts?.arms) {
    const wanted = new Set(opts.arms);
    const chosen = arms.filter((a) => wanted.has(a.arm));
    const othersCount = arms.filter((a) => !wanted.has(a.arm)).reduce((sum, a) => sum + a.n, 0);
    return buildReadout(axis, chosen, unattributed + othersCount);
  }
  const live = arms.filter((a) => !a.retired);
  const retiredCount = arms.filter((a) => a.retired).reduce((sum, a) => sum + a.n, 0);
  return buildReadout(axis, live, unattributed + retiredCount);
}

/**
 * Which arm a submission was in, for the axes whose arms are recorded: landing and survey
 * are stamped on the submission, pricing on its quote. Nothing stamps a paywall arm since
 * the forced paywall was removed on 2026-08-31, so that axis reads nothing.
 */
export function armReader(
  axis: ExperimentAxis,
  outcomes: ArmOutcomes
): ((id: number, tracker: string | null) => string | null) | null {
  if (axis === "landing" || axis === "survey")
    // eslint-disable-next-line security/detect-object-injection -- axis is "landing" or "survey" here.
    return (_id, tracker) => readStampedArms(tracker)[axis];
  if (axis === "pricing") return (id) => outcomes.bySubmission.get(id)?.pricing ?? null;
  return null;
}

/*
 * Only genuinely randomised, currently-running splits belong here.
 *
 * EMPTY as of 2026-09-19. The landing test was the last one and it moved to
 * `concluded` below: V2 now serves 100% of traffic, so there is one design
 * and nothing to compare. Every other axis left on 2026-08-31. The forced
 * paywall was REMOVED from the product, so nothing stamps an arm at all. The
 * price test was settled by dropping the higher-priced arm, so every new quote
 * is stamped with the surviving group — which is not the same thing as a
 * randomised arm, and comparing it against the retired one would be comparing
 * two time periods.
 *
 * `tally` is kept and still exported-by-use through the concluded readouts;
 * add an axis back here the day it starts being randomised.
 */
export const LIVE_AXES: ExperimentAxis[] = [];

export function liveReadouts(outcomes: ArmOutcomes): ExperimentReadout[] {
  return LIVE_AXES.map((axis) =>
    tallyAxis(outcomes, axis, armReader(axis, outcomes) ?? (() => null))
  );
}

/**
 * The final numbers of a test that has ended.
 *
 * Separate from `experiments` so a finished test can never be read as a live
 * one, and separate from `concluded` (which is prose) so the arithmetic
 * behind the prose is still on the page. Deleting the landing readout
 * outright would have taken the V1-vs-V2 numbers off /admin on the same day
 * we decided using them.
 */
export function concludedReadouts(outcomes: ArmOutcomes): ExperimentReadout[] {
  return [
    // V1 and V2 by name. NOT "every arm with data": `control` is the round-1
    // dark landing, and a three-arm row drawn from two experiments is not a
    // record of either.
    tallyAxis(outcomes, "landing", (_id, tracker) => readStampedArms(tracker).landing, {
      arms: ["white_prev", "white"],
    }),
  ];
}

/** Finished experiments, in words and without rates, so nobody reads a winner into them. */
export const CONCLUDED: ConcludedExperiment[] = [
  {
    title: "Landing page design (V1 vs V2)",
    outcome:
      // No rates in the prose, by the same rule as the entries below — a
      // finished test must not read as a live one. The numbers are above,
      // in the readout, where they are labelled as final.
      "Finished on 19 September 2026 and settled on V2, the version with the first survey question in the hero. Everyone now sees it. V2 reached checkout more often over the 30 days to 19 September, but that gap is not one this many people can prove: the range the true difference could sit in still runs from V1 being slightly ahead to V2 being well ahead. Separating a gap that size would need roughly six times as many readers per design, which at our traffic is about six more months. V1 was nominally ahead on payments, two against one, and three payments is not a result. It was called on the checkout rate, and on not spending six more months running a design we already believed was worse.",
  },
  {
    title: "Report pricing (A vs B)",
    outcome:
      "Finished on 31 August 2026. We dropped the more expensive of the two price lists, so everyone now sees the same prices. The cheaper list had taken more money over the test as a whole, but the two prices were swapped over on 24 August, which means the before and after are not really one comparison — with 1 sale against 2 since the swap there was nothing to call it on. It was a decision to simplify, not a verdict.",
  },
  {
    title: "Paywall style",
    outcome:
      "Finished. The forced screen was switched off, then removed from the site entirely on 31 August 2026 — the pricing pop-up can always be closed now. Everyone gets the same experience, so there is nothing left to compare.",
  },
  {
    title: "Survey design (white vs dark)",
    // No rates, by the same rule as the paywall entry above: this section
    // exists so a finished test cannot be read as a live one. The numbers
    // that settled it are in the commit and in the digest history.
    outcome:
      "Stopped 2026-08-25 and settled on the white survey. White reached checkout more often, but not by a margin this many people can prove — the range the true gap could sit in still includes zero — and purchases were level. It was called on the checkout rate, not because the test reached a verdict. Everyone now sees white, so there is nothing left to compare.",
  },
];
