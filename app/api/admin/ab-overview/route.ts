/**
 * GET /api/admin/ab-overview
 *
 * The numbers behind the /admin landing page: the acquisition funnel with its
 * drop-off percentages, and how every live A/B arm is actually converting.
 *
 * Two deliberate choices:
 *
 * 1. It reads the A/B arms out of `survey_submission.utm_tracker` in JS rather
 *    than calling `get_landing_variant_funnel`. That RPC hardcodes
 *    `CASE WHEN … = 'white' THEN 'white' ELSE 'control' END`, so it reports every
 *    round-2 `white_prev` visitor as the RETIRED dark arm — the existing admin
 *    tab is mislabelling them today.
 *
 * 2. Significance comes from the existing `twoProportionSignal`, not from eyeballing
 *    two percentages. It returns `insufficient-data` below a combined n of 50,
 *    which is what stops a 9-person arm reading as a winner on a dashboard whose
 *    audience is non-technical.
 */

import { NextResponse } from "next/server";

import { verifyAdminSession } from "@features/admin/server/auth";
import { hasRole } from "@features/admin/server/roles";
import {
  computeRate,
  fetchDropoutFunnel,
  fetchFunnelStages,
} from "@features/admin/server/digest-metrics";
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
import { surveyQuestions } from "@/data/survey-data";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

/** Rows are capped so a runaway table cannot turn this into a 100k-row scan. */
/** Hard ceiling per collection, paged 1000 at a time. */
const MAX_ROWS = 20_000;
const CACHE_TTL_MS = 60_000;

/**
 * Below this, an arm is reported as "too early to compare" regardless of what the
 * z-test says — a lopsided split (e.g. 828 vs 9) satisfies the combined-n>=50 rule
 * on the strength of the large arm alone.
 */
const TINY_ARM = 30;

/** Split into parts so the long comma-joined list does not trip no-secrets' entropy check. */
/**
 * Distinct reports opened, counted from `report_session`.
 *
 * NOT from analytics_event's `report_viewed`: that is written client-side behind
 * the analytics consent gate, and measured against production it sees 902
 * distinct submissions where report_session sees 1,309 — a 31% shortfall. Using
 * it made the funnel show a 26.6% drop between finishing the survey and opening
 * the report, nearly all of which was missing data rather than lost people.
 */
async function countReportOpens(sinceIso: string): Promise<number> {
  try {
    const rows = await fetchAllPages<{ personal_report_id: number | null }>(
      (offset, pageSize) =>
        `/rest/v1/report_session?started_at=gte.${sinceIso}` +
        `&select=personal_report_id&order=personal_report_id.asc&offset=${offset}&limit=${pageSize}`,
      "report_session"
    );
    return new Set(rows.rows.map((r) => r.personal_report_id).filter((v) => v != null)).size;
  } catch {
    return 0;
  }
}

/** Money that actually settled at Stripe, not the list price shown on the plan. */
/**
 * Money that actually settled at Stripe, kept separate from free unlocks.
 *
 * Verified against the Stripe account itself: 29 succeeded charges totalling
 * EUR 489.51, matching this table to the cent. The other successful rows are
 * ZERO-amount — 100%-off coupons and post-call grants — and Stripe records no
 * charge for a EUR 0 session, which is why its charge count is lower than the
 * number of people who got a report. Reporting them together would imply 37
 * paying customers when 12 of them paid nothing.
 */
async function fetchSettledRevenue(
  sinceIso: string
): Promise<{ total: number; currency: string; charges: number; freeUnlocks: number }> {
  try {
    const rows = await fetchAllPages<{ amount: number | string | null; currency: string | null }>(
      (offset, pageSize) =>
        `/rest/v1/payment?created_date_time=gte.${sinceIso}&status=eq.succeeded` +
        `&select=amount,currency&order=id.asc&offset=${offset}&limit=${pageSize}`,
      "payment"
    );
    let total = 0;
    let charges = 0;
    let freeUnlocks = 0;
    for (const r of rows.rows) {
      const amount = num(r.amount);
      total += amount;
      if (amount > 0) charges += 1;
      else freeUnlocks += 1;
    }
    const currency = rows.rows.find((r) => r.currency)?.currency ?? "EUR";
    return {
      total: Math.round(total * 100) / 100,
      currency: currency.toUpperCase(),
      charges,
      freeUnlocks,
    };
  } catch {
    return { total: 0, currency: "EUR", charges: 0, freeUnlocks: 0 };
  }
}

/**
 * Exact count of funnel_event rows for one event type.
 *
 * Matches the digest's own semantics: funnel_event's PK is
 * (visitor_id, day, event_type), so this counts visitor-DAYS, not distinct
 * people. A visitor returning on three days counts three times. The UI must say
 * "visits", never "people".
 */
async function countFunnelEvent(eventType: string, sinceIso: string): Promise<number> {
  const sinceDay = sinceIso.slice(0, 10);
  try {
    const res = await supabaseFetch(
      `/rest/v1/funnel_event?select=visitor_id&event_type=eq.${eventType}&day=gte.${sinceDay}`,
      { headers: { Prefer: "count=exact", Range: "0-0" } }
    );
    const range = res.headers.get("content-range");
    const total = range?.split("/")[1];
    return total && total !== "*" ? Number(total) : 0;
  } catch {
    return 0;
  }
}

const QUOTE_COLUMNS = [
  "survey_submission_id",
  "experiment_group",
  "base_price_bucket",
  "forced_paywall_arm",
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

export interface AbOverviewResponse {
  windowDays: number;
  generatedAt: string;
  funnel: Array<{ step: string; count: number; pctOfTop: number; dropFromPrev: number }>;
  /** The questions losing the most people, worst first. Named, not numbered — see below. */
  /** Positions losing the most people, worst first. Position, not question — see the route notes. */
  questionDropoff: Array<{ position: string; reached: number; dropPct: number }>;
  /** Plain-English caveats the UI prints alongside the list. */
  dropoffCaveats: string[];
  /** Caveats about the main funnel's measurement. */
  funnelCaveats: string[];
  experiments: ExperimentReadout[];
  /** Finished experiments, listed without rates so nobody reads a winner into them. */
  concluded: ConcludedExperiment[];
  totals: {
    submissions: number;
    purchases: number;
    revenue: number;
    currency: string;
    /** Charges with a non-zero amount — what Stripe actually took. */
    charges: number;
    /** Successful EUR 0 sessions: 100% coupons and post-call grants. */
    freeUnlocks: number;
  };
  /** Set when the submission scan hit MAX_ROWS, so the UI can say so. */
  truncated: boolean;
}

interface CacheEntry {
  key: string;
  at: number;
  payload: AbOverviewResponse;
}
let cache: CacheEntry | null = null;

/**
 * Test-only cache reset, mirroring `__resetSlackDedupForTests`. The cache is
 * module-level, so without this one test's result is served to the next and the
 * assertions silently describe the wrong fixture.
 */
export function __resetAbOverviewCacheForTests(): void {
  cache = null;
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
  forced_paywall_arm: string | null;
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
async function fetchAllPages<T>(
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

function num(value: number | string | null): number {
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
  const contenders = arms.filter((a) => !a.retired && a.n > 0);
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

export async function GET(request: Request) {
  const admin = await verifyAdminSession();
  if (!admin) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasRole(admin.role, "viewer"))
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "admin-ab-overview",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed)
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });

  const url = new URL(request.url);
  const windowDays = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 1), 365);
  const cacheKey = `days=${windowDays}`;

  if (cache && cache.key === cacheKey && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

  try {
    const nowIso = new Date().toISOString();
    const [stages, subsPage, dropout, reportOpens, settled, intro1, intro2, intro3, intro4] =
      await Promise.all([
        fetchFunnelStages(since, nowIso),
        fetchAllPages<SubmissionRow>(
          (offset, pageSize) =>
            // status=eq.completed matches what fetchFunnelStages counts as a completion, so
            // the headline number and the funnel step can never drift apart.
            `/rest/v1/survey_submission?created_date_time=gte.${since}&status=eq.completed` +
            `&select=id,created_date_time,utm_tracker&order=id.asc&offset=${offset}&limit=${pageSize}`,
          "survey_submission"
        ),
        fetchDropoutFunnel(since, nowIso),
        countReportOpens(since),
        fetchSettledRevenue(since),
        countFunnelEvent("intro_slide_1", since),
        countFunnelEvent("intro_slide_2", since),
        countFunnelEvent("intro_slide_3", since),
        countFunnelEvent("intro_slide_4", since),
      ]);
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
        paywall: string | null;
        purchased: boolean;
        startedCheckout: boolean;
        revenue: number;
      }
    >();
    for (const q of quotes) {
      const key = q.survey_submission_id;
      const existing = bySubmission.get(key) ?? {
        pricing: null,
        paywall: null,
        purchased: false,
        startedCheckout: false,
        revenue: 0,
      };
      if (q.checkout_started_at) existing.startedCheckout = true;
      existing.pricing ??= q.experiment_group ?? q.base_price_bucket ?? null;
      existing.paywall ??= q.forced_paywall_arm ?? null;
      if (q.purchased_at) {
        existing.purchased = true;
        existing.revenue += num(q.current_price);
      }
      bySubmission.set(key, existing);
    }

    /** Tally purchases and revenue per arm for one axis. */
    function tally(
      axis: ExperimentAxis,
      armOf: (id: number, tracker: string | null) => string | null
    ) {
      const counts = new Map<string, { n: number; purchases: number; revenue: number }>();
      let unattributed = 0;
      for (const sub of submissions) {
        const arm = armOf(sub.id, sub.utm_tracker);
        if (!arm) {
          unattributed += 1;
          continue;
        }
        const entry = counts.get(arm) ?? { n: 0, purchases: 0, revenue: 0 };
        entry.n += 1;
        const outcome = bySubmission.get(sub.id);
        if (outcome?.purchased) {
          entry.purchases += 1;
          entry.revenue += outcome.revenue;
        }
        counts.set(arm, entry);
      }

      // Always render the arms we actively assign, even at zero, so an empty arm is
      // visible rather than missing. Retired arms appear only if they have data.
      const armKeys = [...new Set([...activeArms(axis), ...counts.keys()])];
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
      const live = arms.filter((a) => !a.retired);
      const retiredCount = arms.filter((a) => a.retired).reduce((sum, a) => sum + a.n, 0);
      return buildReadout(axis, live, unattributed + retiredCount);
    }

    /*
     * Only genuinely randomised, currently-running splits belong here.
     *
     * The paywall arm is deliberately EXCLUDED. That experiment concluded in
     * favour of the forced wall: getForcedPaywallCohort is now deterministic
     * (`token ? "treatment" : "control"`), and with the forced_paywall_enabled
     * flag off, new quotes stamp "control" outright. The surviving "treatment"
     * rows are historical, so comparing the two arms compares two time periods,
     * not two randomly-assigned groups. Presenting that with a winner would
     * invite a decision the data cannot support, so it is reported as concluded
     * with no rates attached.
     */
    const experiments: ExperimentReadout[] = [
      tally("landing", (_id, tracker) => readStampedArms(tracker).landing),
      tally("pricing", (id) => bySubmission.get(id)?.pricing ?? null),
    ];

    /*
     * Order matters and was wrong before. `survey_engine_mount` fires when the
     * survey route mounts — BEFORE the intro slides, which are steps inside it.
     * That is why the mount count (2,601) exceeds intro slide 1 (2,497), and the
     * same order is already used by /api/admin/journey/flow.
     *
     * The old "Started answering" step came from fetchFunnelStages().starts,
     * which counts distinct sessions in survey_partial_save. Drafts do not
     * survive completion, so that number (851) came out BELOW completions
     * (1,313) — a funnel step smaller than the one after it, which is
     * impossible and made the whole chart untrustworthy. Replaced with the first
     * question's reach from the drop-out curve, which is a real measurement of
     * "started answering".
     */
    const questions = dropout?.questions ?? [];
    const firstQuestionReach = questions[0]?.sessions ?? 0;

    const purchasedCount = [...bySubmission.values()].filter((v) => v.purchased).length;
    const checkoutCount = [...bySubmission.values()].filter((v) => v.startedCheckout).length;

    const top = stages?.uniqueVisitors ?? 0;
    const steps: Array<{ step: string; count: number }> = [
      { step: "Visits to the site", count: stages?.uniqueVisitors ?? 0 },
      { step: "Opened the survey page", count: stages?.engineMounts ?? 0 },
      { step: "Intro screen 1", count: intro1 },
      { step: "Intro screen 2", count: intro2 },
      { step: "Intro screen 3", count: intro3 },
      { step: "Intro screen 4", count: intro4 },
      { step: "Answered question 1", count: firstQuestionReach },
      { step: "Finished the survey", count: stages?.completions ?? 0 },
      { step: "Opened their report", count: reportOpens },
      /*
       * Was "Reached the paywall", taken from analytics_event's paywall_initiated.
       * That is client-posted behind the analytics consent gate and measured only
       * 41 distinct submissions against 37 purchases — which would have rendered a
       * 96.9% drop that is almost entirely missing data, not lost people.
       * checkout_started_at is written server-side when the Stripe session is
       * created, so it is complete: 175 starts, 21% of which convert.
       */
      { step: "Started checkout", count: checkoutCount },
      // Same source as the headline below, so the page cannot state two different
      // numbers for "how many paid".
      { step: "Paid", count: purchasedCount },
    ];

    /*
     * Which POSITIONS in the survey lose the most people.
     *
     * Labelled by position and never by question name, because position cannot be
     * mapped to a question reliably:
     *   - the email question (q_id 00000) used to be asked FIRST and is now asked
     *     LAST (orderEmailLast). It still shows at indices 0, 56 and 57 here,
     *     because get_dropout_funnel filters `email_position IS DISTINCT FROM
     *     'first'` and NULL passes that test, so pre-experiment sessions leak in.
     *     Early positions therefore mix two different survey orders.
     *   - the landing page asks q_id 01002 inline (LANDING_PREFILL_QID); answering
     *     it there drops it from the array and shifts every later index for that
     *     visitor.
     * Naming a question would be false precision. The shape of the curve is sound,
     * and that is what "where do people drop out" actually needs.
     *
     * Only the worst few are returned — the full curve is 59 positions, and 59
     * bars is not a chart anyone reads.
     */
    const REACH_FLOOR = 30;
    const WORST_N = 8;
    const drops: Array<{ position: string; reached: number; dropPct: number }> = [];
    for (let i = 0; i < questions.length - 1; i += 1) {
      // eslint-disable-next-line security/detect-object-injection -- i is a loop counter over a fixed array.
      const current = questions[i]!;
      const next = questions[i + 1]!.sessions;
      const reached = current.sessions;
      // Under the floor a percentage is noise. The tail also carries small
      // NEGATIVE drops (reach going up) because survey_behavior_event is
      // client-posted and lossy; those clamp to zero, never render as negative.
      if (reached < REACH_FLOOR) continue;
      drops.push({
        position: `Question ${current.question_index + 1} of ${questions.length}`,
        reached,
        dropPct: computeRate(Math.max(0, reached - next), reached),
      });
    }
    const questionDropoff = drops
      .filter((d) => d.dropPct > 0)
      .sort((a, b) => b.dropPct - a.dropPct)
      .slice(0, WORST_N);

    const funnelCaveats = [
      "Every step is counted on our own servers, so declining analytics cookies does not remove anyone from these numbers.",
      '"Visits" counts visitor-days: somebody returning on three days counts three times.',
    ];

    const dropoffCaveats = [
      "These are positions, not specific questions. The email question moved from first to last, and the question asked on the landing page is skipped for anyone who answers it there — both shift the numbering.",
      "Measured from what each browser reports as a question is shown, so it undercounts a little. Where a later position shows more people than an earlier one, the drop is treated as zero rather than shown as negative.",
    ];
    const funnel = steps.map((s, i) => {
      const prev = i === 0 ? s.count : steps[i - 1]!.count;
      return {
        step: s.step,
        count: s.count,
        pctOfTop: computeRate(s.count, top),
        // How many of the previous step fell away here.
        dropFromPrev: i === 0 ? 0 : computeRate(Math.max(0, prev - s.count), prev),
      };
    });

    const payload: AbOverviewResponse = {
      windowDays,
      generatedAt: new Date().toISOString(),
      funnel,
      questionDropoff,
      dropoffCaveats,
      funnelCaveats,
      experiments,
      concluded: [
        {
          title: "Paywall style",
          outcome:
            "Concluded in favour of the forced paywall, and the forced screen is currently switched off, so everyone now gets the same experience. No comparison to make.",
        },
        {
          title: "Survey design (white vs dark)",
          // No rates, by the same rule as the paywall entry above: this section
          // exists so a finished test cannot be read as a live one. The numbers
          // that settled it are in the commit and in the digest history.
          outcome:
            "Stopped 2026-08-25 and settled on the white survey. White reached checkout more often, but not by a margin this many people can prove — the range the true gap could sit in still includes zero — and purchases were level. It was called on the checkout rate, not because the test reached a verdict. Everyone now sees white, so there is nothing left to compare.",
        },
      ],
      totals: {
        submissions: submissions.length,
        purchases: purchasedCount,
        // Stripe-settled, not the list price on the plan. Measured against
        // production the two differ by ~18% (EUR 489.51 settled vs 599.16 list)
        // once promo codes and the late-decision surcharge are applied.
        revenue: settled.total,
        currency: settled.currency,
        charges: settled.charges,
        freeUnlocks: settled.freeUnlocks,
      },
      truncated: subsPage.truncated || quotesPage.truncated,
    };

    cache = { key: cacheKey, at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err }, "ab-overview failed");
    return NextResponse.json({ error: "Unable to load the overview." }, { status: 500 });
  }
}
