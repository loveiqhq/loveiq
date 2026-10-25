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
import { PRICE_TEST_START_AT } from "@features/checkout/server/reportPurchase";
import { teamUserIds } from "@features/admin/server/ap/team";
import { isStaffEmail } from "@shared/env/staff-email";
import { isPayToStartTracker } from "@features/pay-to-start/logic/journey";
import { LANDING_TEST_START_AT } from "@shared/experiments/landingVariant";
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
  "checkout_started_at",
  "created_date_time",
  // Every change to the quote's arm or list price, oldest first (`dealtArm`).
  "report_price_quote_arm_history(old_experiment_group)",
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
  /** Its dates, for a test whose final numbers can still be read (Berlin days, inclusive). */
  window?: { axis: ExperimentAxis; from: string; to: string };
}

interface SubmissionRow {
  id: number;
  user_id?: number | null;
  created_date_time: string | null;
  utm_tracker: string | null;
}

interface QuoteRow {
  survey_submission_id: number;
  experiment_group: string | null;
  base_price_bucket: string | null;
  checkout_started_at: string | null;
  created_date_time: string;
  report_price_quote_arm_history: Array<{ old_experiment_group: string | null }> | null;
}

/**
 * The price list a quote was DEALT: the old arm of its first recorded change, else the arm it
 * carries. Not the stamp on the row, which says what the quote is now: a re-sync moves every
 * unpaid quote onto the next test's lists (20261005120100 rewrote the 2.x test's A/B quotes to
 * A3/B3), and report_price_quote_arm_history keeps what each one was moved from. SQL reads it
 * the same way (get_arm_cohorts, get_axis_funnel_daily: 20261016170000).
 */
export function dealtArm(
  q: Pick<QuoteRow, "experiment_group" | "base_price_bucket" | "report_price_quote_arm_history">
): string | null {
  return (
    q.report_price_quote_arm_history?.[0]?.old_experiment_group ??
    q.experiment_group ??
    q.base_price_bucket
  );
}

/** A price list taking effect: from `changed_at`, arm `arm` sold `plan` at `starting_price`. */
export interface PriceListChange {
  changed_at: string;
  arm: string;
  plan: string;
  starting_price: number | string;
}

/**
 * Every change of a price list, oldest first (get_price_list_changes, 20261016170000): the
 * 2.x changes from before the arm history, pinned there with where each moment came from,
 * then every re-sync the history recorded.
 */
export async function loadPriceListChanges(): Promise<PriceListChange[]> {
  const res = await supabaseFetch("/rest/v1/rpc/get_price_list_changes", {
    method: "POST",
    body: "{}",
  });
  if (!res.ok) throw new Error(`get_price_list_changes: ${res.status}`);
  return (await res.json()) as PriceListChange[];
}

interface PaymentRow {
  amount: number | string | null;
  /** `metadata->>plan`: "initial" is the EUR 1.99 Core Archetype, not a report bought. */
  plan: string | null;
  personal_report: { survey_submission_id: number | null } | null;
}

/**
 * Page through a PostgREST collection.
 *
 * PostgREST enforces its own `max-rows` (1000 here) and silently ignores a larger
 * `limit`, so a single request returns 1000 rows and looks complete. That bit this
 * route during validation: two independently-capped fetches covered different
 * submissions, which inflated "unattributed" to 667 and under-counted purchases
 * per arm. Page explicitly with Range, and report truncation honestly.
 *
 * A failed page throws. It used to end the scan as if the list were complete, so a
 * read that failed outright (the quote read embeds the arm history, and fails while
 * that table is missing) printed every reader as "not attributable" with no error.
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
      throw new Error(`${what}: ${res.status}`);
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

/** Completed submissions in a window, staff left out, and what each one paid. */
export interface ArmOutcomes {
  submissions: SubmissionRow[];
  bySubmission: Map<
    number,
    { pricing: string | null; purchased: boolean; startedCheckout: boolean; revenue: number }
  >;
  /** Set when a scan hit MAX_ROWS. */
  truncated: boolean;
}

/**
 * The window's finishers and what each one did. `until` (exclusive) closes the window for a
 * test that has ended; their purchases are still followed with no end date.
 */
export async function loadArmOutcomes(since: string, until?: string): Promise<ArmOutcomes> {
  const subsRead = fetchAllPages<SubmissionRow & { app_user: { email: string | null } | null }>(
    (offset, pageSize) =>
      // status=eq.completed is what fetchFunnelStages counts as a completion. /admin's
      // "Finished the survey" step is this scan's count, so it and the headline agree.
      `/rest/v1/survey_submission?created_date_time=gte.${since}&status=eq.completed` +
      (until ? `&created_date_time=lt.${until}` : "") +
      `&select=id,user_id,created_date_time,utm_tracker,app_user!fk_survey_submission_user(email)` +
      `&order=id.asc&offset=${offset}&limit=${pageSize}`,
    "survey_submission"
  );
  const [subsPage, team] = await Promise.all([subsRead, teamUserIds()]);
  // Our own test runs are not readers: an @loveiq.org address, or an account that redeemed the
  // team's own test coupon (ap_team_user, the rule AP-Analytics counts by).
  const readers = subsPage.rows.filter(
    (s) => !isStaffEmail(s.app_user?.email) && !(s.user_id != null && team.has(Number(s.user_id)))
  );

  // Join the quotes by SUBMISSION ID RANGE rather than by their own created date:
  // a quote can be created outside the submission window, and filtering it by date
  // silently drops real purchases. Ids are monotonic, so the window's smallest and
  // largest ids are an index-friendly narrowing that cannot miss one — and it avoids
  // interpolating a huge `in.(...)` list into the URL the way /api/admin/stats does.
  // Oldest quote first within a submission, so its first quote's arm is the one taken.
  const minId = readers.length > 0 ? Math.min(...readers.map((s2) => s2.id)) : 0;
  const maxId = readers.length > 0 ? Math.max(...readers.map((s2) => s2.id)) : 0;

  // Pay to start (features/pay-to-start): a survey bought before it was taken is in no
  // experiment here. Its €29 would count as a purchase in whatever arm its session fell
  // into. The claimed entitlement is the record; the tracker's label, when it has one.
  const prepaidPage =
    readers.length > 0
      ? await fetchAllPages<{ consumed_submission_id: number | null }>(
          (offset, pageSize) =>
            `/rest/v1/prepaid_report_access?consumed_submission_id=gte.${minId}` +
            `&consumed_submission_id=lte.${maxId}` +
            `&select=consumed_submission_id&order=consumed_submission_id.asc` +
            `&offset=${offset}&limit=${pageSize}`,
          "prepaid_report_access"
        )
      : { rows: [] as Array<{ consumed_submission_id: number | null }>, truncated: false };
  const prepaidSubmissions = new Set(prepaidPage.rows.map((r) => r.consumed_submission_id));
  // The EUR 1.99 gate's readers (Pre-unlock) are in no PRICE list: pricing pins them to A3,
  // so their list was not drawn. They stay in every other test (the gate meets both arms of
  // a landing or survey test alike). Read whatever the gate's switch says now: a window can
  // cover days it was on.
  const gatedPage =
    readers.length > 0
      ? await fetchAllPages<{ survey_submission_id: number | null }>(
          (offset, pageSize) =>
            `/rest/v1/personal_report?survey_submission_id=gte.${minId}` +
            `&survey_submission_id=lte.${maxId}&initial_gate_cohort_at=not.is.null` +
            `&select=survey_submission_id&order=survey_submission_id.asc` +
            `&offset=${offset}&limit=${pageSize}`,
          "personal_report"
        )
      : { rows: [] as Array<{ survey_submission_id: number | null }>, truncated: false };
  const gatedSubmissions = new Set(gatedPage.rows.map((r) => r.survey_submission_id));
  const submissions = readers.filter(
    (s) => !prepaidSubmissions.has(s.id) && !isPayToStartTracker(s.utm_tracker)
  );
  const ids = new Set(submissions.map((s) => s.id));
  const quotesPage =
    submissions.length > 0
      ? await fetchAllPages<QuoteRow>(
          (offset, pageSize) =>
            `/rest/v1/report_price_quote?survey_submission_id=gte.${minId}` +
            `&survey_submission_id=lte.${maxId}&select=${QUOTE_COLUMNS}` +
            `&report_price_quote_arm_history.order=changed_at.asc,id.asc` +
            `&order=survey_submission_id.asc,created_date_time.asc,id.asc` +
            `&offset=${offset}&limit=${pageSize}`,
          "report_price_quote"
        )
      : { rows: [] as QuoteRow[], truncated: false };
  const quotes = quotesPage.rows;

  // Purchases are money that settled, not a quote's purchased_at: that is also set by a
  // 100%-off unlock and a staff test, and its price is the list price, not what was paid.
  // A payment comes after its survey, so one for this window was created inside it. The
  // EUR 1.99 Core Archetype (plan "initial") is not a report bought: left out below.
  const paymentsPage =
    submissions.length > 0
      ? await fetchAllPages<PaymentRow>(
          (offset, pageSize) =>
            `/rest/v1/payment?status=eq.succeeded&is_test=is.false&amount=gt.0` +
            `&created_date_time=gte.${since}` +
            `&select=amount,plan:metadata->>plan,personal_report!fk_payment_personal_report(survey_submission_id)` +
            `&order=id.asc&offset=${offset}&limit=${pageSize}`,
          "payment"
        )
      : { rows: [] as PaymentRow[], truncated: false };

  // One entry per submission: did they start checkout, did they pay and how much, and
  // which price list they were dealt.
  const windowEnd = until ? Date.parse(until) : Infinity;
  const bySubmission: ArmOutcomes["bySubmission"] = new Map();
  const entry = (id: number) => {
    const existing = bySubmission.get(id) ?? {
      pricing: null,
      purchased: false,
      startedCheckout: false,
      revenue: 0,
    };
    bySubmission.set(id, existing);
    return existing;
  };
  for (const q of quotes) {
    if (!ids.has(q.survey_submission_id)) continue;
    const existing = entry(q.survey_submission_id);
    if (q.checkout_started_at) existing.startedCheckout = true;
    // Only a quote that existed in the window says which list the reader saw in it: one
    // first made after a test ended was priced by whatever came next. A gated reader's list
    // was pinned, not drawn: no arm.
    if (
      Date.parse(q.created_date_time) < windowEnd &&
      !gatedSubmissions.has(q.survey_submission_id)
    )
      existing.pricing ??= dealtArm(q);
  }
  for (const p of paymentsPage.rows) {
    const id = p.personal_report?.survey_submission_id;
    if (id == null || !ids.has(id) || p.plan === "initial") continue;
    const existing = entry(id);
    existing.purchased = true;
    existing.revenue += num(p.amount);
  }

  return {
    submissions,
    bySubmission,
    truncated:
      subsPage.truncated ||
      prepaidPage.truncated ||
      gatedPage.truncated ||
      quotesPage.truncated ||
      paymentsPage.truncated,
  };
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
 *
 * Pricing counts only readers who finished after the current price lists went live
 * (PRICE_TEST_START_AT: list B was lowered on 2026-10-08). A reader is read in the list
 * their quote was dealt (`dealtArm`), but a list can change its prices and keep its
 * letter: readers dealt B3 before the cut saw list B's old prices, so they read as
 * unattributed rather than in either list.
 */
export function armReader(
  axis: ExperimentAxis,
  outcomes: ArmOutcomes
): ((id: number, tracker: string | null) => string | null) | null {
  if (axis === "landing" || axis === "survey")
    // eslint-disable-next-line security/detect-object-injection -- axis is "landing" or "survey" here.
    return (_id, tracker) => readStampedArms(tracker)[axis];
  if (axis === "pricing") {
    const launch = Date.parse(PRICE_TEST_START_AT);
    const finishedAt = new Map(
      outcomes.submissions.map((s) => [s.id, Date.parse(s.created_date_time ?? "")])
    );
    return (id) =>
      (finishedAt.get(id) ?? 0) >= launch ? (outcomes.bySubmission.get(id)?.pricing ?? null) : null;
  }
  return null;
}

/*
 * Only genuinely randomised, currently-running splits belong here.
 *
 * Pricing 3.0 (A3 vs B3, 50/50 by report id) runs, read by `armReader` from when its
 * current lists started (list B lowered 2026-10-08). The landing test runs again since its round 3 (V2's question card
 * vs V3's hero video, 50/50 by cookie): its arms are new values, so `tallyAxis`
 * compares only them and every earlier landing stamp (`white`, `white_prev`,
 * `control`) reads as not attributable, as does a round-3 reader from before its
 * restart at the condensed phone hero (`liveArmReader`). Round 2 (V1 vs V2) stays in `concluded`
 * below. Every other axis left on 2026-08-31. The forced paywall was REMOVED from
 * the product, so nothing stamps an arm at all. The 2.x price test was settled by
 * dropping the higher-priced arm; its A/B rows are retired arms, never pooled into
 * 3.0's, which is why 3.0 took new letters.
 */
export const LIVE_AXES: ExperimentAxis[] = ["pricing", "landing"];

/**
 * `armReader`, plus the landing test's restart at the condensed phone hero
 * (LANDING_TEST_START_AT): a reader who finished before it came through a phone hero
 * whose slot most visitors never reached, in either arm, so /admin reads them as not
 * attributable, as it does pricing's re-priced readers. Here rather than in `armReader`
 * because the brain's experiments tool reads a registered test from the registry's own
 * start date (registry #6 moves to the restart day), and `armReader` is that read too.
 * Exported for the brain's unregistered-test line, which pairs with liveReadouts.
 */
export function liveArmReader(
  axis: ExperimentAxis,
  outcomes: ArmOutcomes
): ((id: number, tracker: string | null) => string | null) | null {
  const read = armReader(axis, outcomes);
  if (axis !== "landing" || !read) return read;
  const start = Date.parse(LANDING_TEST_START_AT);
  const finishedAt = new Map(
    outcomes.submissions.map((s) => [s.id, Date.parse(s.created_date_time ?? "")])
  );
  return (id, tracker) => ((finishedAt.get(id) ?? 0) >= start ? read(id, tracker) : null);
}

export function liveReadouts(outcomes: ArmOutcomes): ExperimentReadout[] {
  return LIVE_AXES.map((axis) =>
    tallyAxis(outcomes, axis, liveArmReader(axis, outcomes) ?? (() => null))
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
      "Finished on 19 September 2026 and settled on V2, the version with the first survey question in the hero. Everyone saw it until the next test began, which runs V2 against V3, the same page with the intro video in the hero in its place (listed above as a live test). V2 reached checkout more often over the 30 days to 19 September, but that gap is not one this many people can prove: the range the true difference could sit in still runs from V1 being slightly ahead to V2 being well ahead. Separating a gap that size would need roughly six times as many readers per design, which at our traffic is about six more months. V1 was nominally ahead on payments, two against one, and three payments is not a result. It was called on the checkout rate, and on not spending six more months running a design we already believed was worse.",
  },
  {
    title: "Report pricing (A vs B)",
    outcome:
      "Finished on 31 August 2026. We dropped the more expensive of the two price lists, so everyone now sees the same prices. The cheaper list had taken more money over the test as a whole, but the two prices were swapped over on 24 August, which means the before and after are not really one comparison — with 1 sale against 2 since the swap there was nothing to call it on. It was a decision to simplify, not a verdict.",
    // The Test Repository's dates. Its unpaid quotes were moved to Pricing 3.0's lists on
    // 6 Oct, so its readers are read in the list they were dealt (`dealtArm`).
    window: { axis: "pricing", from: "2026-08-03", to: "2026-08-31" },
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
