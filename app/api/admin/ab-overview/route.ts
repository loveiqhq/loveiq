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
  CONCLUDED,
  concludedReadouts as finalReadouts,
  fetchAllPages,
  liveReadouts,
  loadArmOutcomes,
  num,
  type ConcludedExperiment,
  type ExperimentReadout,
} from "@features/admin/server/experiment-readouts";
import { supabaseFetch } from "@features/admin/server/supabase";
import { surveyQuestions } from "@/data/survey-data";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

export type {
  ArmStat,
  ConcludedExperiment,
  ExperimentReadout,
} from "@features/admin/server/experiment-readouts";

const CACHE_TTL_MS = 60_000;

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
        `/rest/v1/payment?is_test=is.false&created_date_time=gte.${sinceIso}&status=eq.succeeded` +
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
  /** Tests being randomised right now. Empty as of 2026-09-19. */
  experiments: ExperimentReadout[];
  /** Final per-arm numbers for tests that have ended, retired arms included. */
  concludedReadouts: ExperimentReadout[];
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
    const [stages, outcomes, dropout, reportOpens, settled, intro1, intro2, intro3, intro4] =
      await Promise.all([
        fetchFunnelStages(since, nowIso),
        loadArmOutcomes(since),
        fetchDropoutFunnel(since, nowIso),
        countReportOpens(since),
        fetchSettledRevenue(since),
        countFunnelEvent("intro_slide_1", since),
        countFunnelEvent("intro_slide_2", since),
        countFunnelEvent("intro_slide_3", since),
        countFunnelEvent("intro_slide_4", since),
      ]);

    // Live and concluded readouts come from experiment-readouts.ts, shared with the brain's
    // `experiments` tool so a test reads the same in both places.
    const experiments = liveReadouts(outcomes);
    const concludedReadouts = finalReadouts(outcomes);

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

    const purchasedCount = [...outcomes.bySubmission.values()].filter((v) => v.purchased).length;
    const checkoutCount = [...outcomes.bySubmission.values()].filter(
      (v) => v.startedCheckout
    ).length;

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

    /*
     * The first line here USED TO SAY "every step is counted on our own
     * servers, so declining analytics cookies does not remove anyone from these
     * numbers". That is false for five of the steps and it is the most
     * reassuring sentence on the page.
     *
     * "Opened the survey page" and the four intro screens come from
     * `funnel_event.survey_engine_mount` / `intro_slide_*`, which the BROWSER
     * posts using the `__liq_vid` cookie — and proxy.ts mints that cookie only
     * after the visitor clicks Accept. So declining analytics removes you from
     * exactly those rows. Measured 2026-09-19 over 30 days: 637 visitors reached
     * the consent-gated mount step against 977 server-written survey drafts, so
     * the client path sees roughly two thirds of the people.
     *
     * "Visits" is the opposite: `recordUniqueVisit` writes it server-side with a
     * throwaway per-day UUID precisely so it does NOT depend on consent — which
     * is also why the two cannot be joined, and why the rate between them is a
     * ratio of two different id spaces rather than a conversion of one
     * population.
     */
    const funnelCaveats = [
      "Visits, survey drafts, submissions, report opens, checkouts and payments are counted on our own servers, so declining analytics cookies does not remove anyone from those.",
      "“Opened the survey page” and the four intro screens are the exception: the browser reports those, and only after someone accepts cookies. Roughly a third of people are missing from those five rows, so the drop between “Visits” and “Opened the survey page” is mostly consent, not people leaving.",
      '"Visits" counts visitor-days: somebody returning on three days counts three times.',
      "“Visits” and the survey steps are counted with different identifiers and cannot be matched person to person, so a percentage between them is a ratio of two measurements, not a conversion rate of one group.",
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
      concludedReadouts,
      concluded: CONCLUDED,
      totals: {
        submissions: outcomes.submissions.length,
        purchases: purchasedCount,
        // Stripe-settled, not the list price on the plan. Measured against
        // production the two differ by ~18% (EUR 489.51 settled vs 599.16 list)
        // once promo codes and the late-decision surcharge are applied.
        revenue: settled.total,
        currency: settled.currency,
        charges: settled.charges,
        freeUnlocks: settled.freeUnlocks,
      },
      truncated: outcomes.truncated,
    };

    cache = { key: cacheKey, at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    logger.error({ err }, "ab-overview failed");
    return NextResponse.json({ error: "Unable to load the overview." }, { status: 500 });
  }
}
