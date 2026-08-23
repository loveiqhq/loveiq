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
import { computeRate, fetchFunnelStages } from "@features/admin/server/digest-metrics";
import { formatSignalSummary, twoProportionSignal } from "@features/admin/server/statistics";
import { supabaseFetch } from "@features/admin/server/supabase";
import {
  activeArms,
  armLabel,
  AXIS_TITLES,
  type ExperimentAxis,
} from "@features/attribution/server/labels";
import { readStampedArms } from "@features/attribution/server/traffic";
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
const QUOTE_COLUMNS = [
  "survey_submission_id",
  "experiment_group",
  "base_price_bucket",
  "forced_paywall_arm",
  "current_price",
  "purchased_at",
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

export interface AbOverviewResponse {
  windowDays: number;
  generatedAt: string;
  funnel: Array<{ step: string; count: number; pctOfTop: number; dropFromPrev: number }>;
  experiments: ExperimentReadout[];
  totals: { submissions: number; purchases: number; revenue: number; currency: string };
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

    if (signal.significance === "insufficient-data") {
      verdict = `Not enough data to call this yet — the smallest group has ${smallest.n} ${
        smallest.n === 1 ? "person" : "people"
      }. Treat any difference as noise for now.`;
    } else if (smallest.n < TINY_ARM) {
      /*
       * The combined-sample check inside twoProportionSignal is satisfied by a big
       * arm alone: 828 vs 9 clears n>=50 and comes back "inconclusive", so without
       * this branch the page would read "Current homepage is ahead (2.1% vs 0.0%)"
       * and never mention that the comparison rests on nine people. That is exactly
       * the wrong impression to leave with a non-technical reader.
       */
      verdict = `Too early to compare — ${smallest.label} has only ${smallest.n} ${
        smallest.n === 1 ? "person" : "people"
      } so far. Ignore the difference until that grows.`;
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
    const [stages, subsPage] = await Promise.all([
      fetchFunnelStages(since, new Date().toISOString()),
      fetchAllPages<SubmissionRow>(
        (offset, pageSize) =>
          `/rest/v1/survey_submission?created_date_time=gte.${since}` +
          `&select=id,created_date_time,utm_tracker&order=id.asc&offset=${offset}&limit=${pageSize}`,
        "survey_submission"
      ),
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
      { pricing: string | null; paywall: string | null; purchased: boolean; revenue: number }
    >();
    for (const q of quotes) {
      const key = q.survey_submission_id;
      const existing = bySubmission.get(key) ?? {
        pricing: null,
        paywall: null,
        purchased: false,
        revenue: 0,
      };
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
      return buildReadout(
        axis,
        arms.filter((a) => !a.retired || a.n > 0),
        unattributed
      );
    }

    const experiments: ExperimentReadout[] = [
      tally("landing", (_id, tracker) => readStampedArms(tracker).landing),
      tally("survey", (_id, tracker) => readStampedArms(tracker).survey),
      tally("pricing", (id) => bySubmission.get(id)?.pricing ?? null),
      tally("paywall", (id) => bySubmission.get(id)?.paywall ?? null),
    ];

    const top = stages?.uniqueVisitors ?? 0;
    const steps: Array<{ step: string; count: number }> = [
      { step: "Visited the site", count: stages?.uniqueVisitors ?? 0 },
      { step: "Opened the survey", count: stages?.engineMounts ?? 0 },
      { step: "Started answering", count: stages?.starts ?? 0 },
      { step: "Finished the survey", count: stages?.completions ?? 0 },
      { step: "Opened their report", count: stages?.reportViewed ?? 0 },
      { step: "Reached the paywall", count: stages?.paywallInitiated ?? 0 },
      { step: "Paid", count: stages?.purchased ?? 0 },
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

    const purchasedSubs = [...bySubmission.values()].filter((v) => v.purchased);
    const payload: AbOverviewResponse = {
      windowDays,
      generatedAt: new Date().toISOString(),
      funnel,
      experiments,
      totals: {
        submissions: submissions.length,
        purchases: purchasedSubs.length,
        revenue: Math.round(purchasedSubs.reduce((sum, v) => sum + v.revenue, 0) * 100) / 100,
        currency: "EUR",
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
