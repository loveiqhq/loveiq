/**
 * GET /api/cron/conversion-digest
 *
 * The daily conversion report asked for in the 2026-08-24 strategy meeting:
 * longitudinal conversion funnels for the landing pages, plus automated alerts on
 * statistical significance and test performance.
 *
 * WHY THIS IS A NEW ROUTE RATHER THAN A REVIVAL. `funnel-digest` already posts a
 * rail of 8-10 charts, and it was unscheduled "per the strategy lead" for being
 * FYI-only (commit 25a9ca64). Two things follow. First, another chart wall gets
 * muted again, so this message leads with a DECISION and puts one chart
 * underneath. Second, `funnel-digest`'s per-arm chart splits on
 * `landing_variant = 'white'` vs everything-else-as-'control' — round 1's shape —
 * so it now plots `white_prev` as "Dark". It must not be un-paused as-is.
 *
 * Significance is computed, never narrated by a model: `twoProportionSignal` plus
 * the TINY_ARM guard, rendered in plain English by `buildArmVerdict`. A language
 * model asked to summarise these numbers can restate one wrongly, and this is a
 * surface people use to decide where to spend money.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`, skipped on the staging host
 * (it shares the prod DB), and idempotent via `slack_alert_sent` keyed by UTC day.
 */

import { NextResponse } from "next/server";
import logger from "@shared/observability/logger";
import { notifySlack, escapeSlack, type SlackBlock } from "@shared/observability/slack";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { signImagePayload } from "@shared/url/signed-image-url";
import {
  context,
  divider,
  fields,
  fitBlocks,
  header,
  section,
} from "@shared/observability/slack-blocks";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import { computeRate, dayString } from "@features/admin/server/digest-metrics";
import {
  AMBIGUOUS_VISITOR_ARM,
  type ArmVerdict,
  type AxisCohort,
  type DigestAlert,
  type FunnelStep,
  type LandingArmFunnel,
  biggestLeak,
  buildAlerts,
  buildArmVerdict,
  buildFunnel,
  delta,
  fetchArmCohorts,
  fetchLandingArmFunnel,
  TINY_ARM,
  sumDays,
  sumVisitors,
} from "@features/admin/server/conversion-digest";
import { armLabel, type ExperimentAxis } from "@features/attribution/server/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Trends need history to read as trends; matches funnel-digest's window. */
const WINDOW_DAYS = 30;

/**
 * The axes worth a verdict. `paywall` is deliberately absent — that experiment
 * concluded in favour of the forced paywall and nothing randomises it any more,
 * so presenting it as a live test is exactly the mistake the /admin dashboard
 * made before it was corrected.
 */
const VERDICT_AXES: ExperimentAxis[] = ["landing", "survey", "pricing"];

/**
 * When report prices last changed. Pre- and post-change arm A are different
 * products, so the digest says the pricing comparison restarts rather than
 * pooling two prices into one rate. Update this on the next price change.
 */
const PRICING_CUTOVER_ISO = "2026-08-24T02:46:49Z";

/**
 * Makes each preview's Slack `kind` distinct so notifySlack's 60-second dedup
 * (which keys on channel + kind + the first 100 chars of the fallback text)
 * cannot swallow a repeat send while the wording is being iterated on.
 *
 * A counter rather than a timestamp alone: two previews inside the same
 * millisecond produced the same kind, and the whole point is that a second look
 * always arrives.
 */
let previewSequence = 0;

function deployStamp(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha && sha.length >= 7) return sha.slice(0, 7);
  return `dev-${process.env.HOSTNAME ?? "local"}`;
}

/**
 * Slack's image proxy is anonymous, so authenticity has to travel in the URL.
 * `v` is the deploy stamp, which busts the proxy cache on each deploy.
 */
async function signedChartUrl(payload: Record<string, unknown>): Promise<string | null> {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) {
    logger.warn("conversion-digest: NEXT_PUBLIC_SITE_URL unset; skipping chart");
    return null;
  }
  try {
    const { d, s } = await signImagePayload({
      kind: "conversion-by-arm",
      v: deployStamp(),
      ...payload,
    });
    const u = new URL("/api/admin/digest-image/conversion-by-arm", base);
    u.searchParams.set("d", d);
    u.searchParams.set("s", s);
    return u.toString();
  } catch (err) {
    logger.warn({ err }, "conversion-digest: chart signing failed; skipping chart");
    return null;
  }
}

/** "3 Aug" — short enough for ~5 x-axis ticks. */
function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
}

/**
 * Step names carry an "…of those," prefix so each row states what its number
 * actually is, but that reads badly inside a sentence — "Biggest drop: …of
 * those, opened their report → …of those, started checkout".
 */
function shortStep(step: string): string {
  return step.replace(/^…of those,\s*/, "");
}

function money(amount: number): string {
  return `EUR ${amount.toFixed(2)}`;
}

/**
 * The two-arm trend chart: completion→paid conversion per day for the two live
 * landing arms, on a shared y-scale.
 *
 * Daily rates on a handful of purchases are extremely spiky, so this plots a
 * 7-day trailing rate — a single purchase on a 3-completion day is 33%, which
 * would dominate the y-scale and make the chart lie about the trend.
 */
export function buildArmSeries(
  funnel: LandingArmFunnel,
  arms: [string, string]
): { labels: string[]; first: Array<number | null>; last: Array<number | null> } {
  const days = Array.from(new Set(funnel.daily.map((r) => r.day))).sort();
  const dayIndex = new Map(days.map((day, i) => [day, i]));

  /**
   * A day with NO finishers in the arm's trailing window returns null, not 0.
   *
   * Zero and "not running" are different facts and the chart cannot say so if
   * they share a value. The second homepage arm only began on 2026-08-21, so
   * filling its earlier days with 0% drew a flat line a month long and claimed a
   * month of zero conversion for an arm that did not exist — which is exactly
   * how the first version read.
   */
  const rateFor = (arm: string): Array<number | null> =>
    days.map((_, idx) => {
      const from = Math.max(0, idx - 6);
      let completions = 0;
      let paid = 0;
      for (const row of funnel.daily) {
        if (row.arm !== arm) continue;
        const i = dayIndex.get(row.day);
        if (i === undefined || i < from || i > idx) continue;
        completions += row.completions;
        paid += row.paid;
      }
      return completions > 0 ? computeRate(paid, completions) : null;
    });

  return {
    labels: days.map(shortDay),
    first: rateFor(arms[0]),
    last: rateFor(arms[1]),
  };
}

interface DigestInput {
  dayKey: string;
  funnel: LandingArmFunnel | null;
  cohorts: AxisCohort[] | null;
  now: Date;
}

export interface BuiltDigest {
  text: string;
  blocks: SlackBlock[];
  trimmed: boolean;
}

export async function buildConversionDigest(input: DigestInput): Promise<BuiltDigest> {
  const { dayKey, funnel, cohorts, now } = input;
  const windowLabel = `${WINDOW_DAYS}-day window ending ${dayKey} UTC`;

  const verdicts: ArmVerdict[] = [];
  if (cohorts) {
    for (const axis of VERDICT_AXES) {
      const rows = cohorts
        .filter((c) => c.axis === axis && c.arm !== "unknown")
        .map((c) => ({ arm: c.arm, n: c.n, conversions: c.conversions }));
      if (rows.length === 0) continue;
      verdicts.push(buildArmVerdict(axis, rows));
    }
  }

  const blocks: SlackBlock[] = [header(`📈 Conversion — ${dayKey}`)];
  // Definitions ride at the TOP, not the bottom. fitBlocks keeps from the front,
  // so as the last block this was the first thing dropped when a message ran
  // long — leaving every number in place and no statement of what any of them
  // meant.
  blocks.push(
    context(
      `${windowLabel} · counted server-side, no analytics-consent gap · "visits" are visitor-days, not people · arms are compared on finished surveys → ever paid`
    )
  );

  // ---- The decision, first ----
  if (verdicts.length > 0) {
    blocks.push(
      section(`*Where the tests stand*\n${verdicts.map((v) => `• ${v.sentence}`).join("\n")}`)
    );
  } else {
    // `cohorts === null` means the read FAILED; an empty array means there is
    // genuinely nothing. Saying "no experiment data" for a failed read tells the
    // reader the experiments are dead.
    blocks.push(
      section(
        cohorts === null
          ? "*Where the tests stand*\n• Could not read the experiment data — this is a measurement failure, not a result."
          : "*Where the tests stand*\n• No experiment data in this window."
      )
    );
  }

  // ---- Yesterday vs the usual ----
  let yesterday = { visitors: 0, completions: 0, paid: 0 };
  let baseline = { visitors: 0, completions: 0, paid: 0 };
  if (funnel) {
    const y = sumDays(funnel.daily, (d) => d === dayKey);
    const yVisitors = sumVisitors(funnel.visitors, (d) => d === dayKey);
    // Prior 7 days, as a daily average, so "yesterday" is compared with a normal
    // day rather than with a single (possibly freak) previous day.
    const priorDays: string[] = [];
    for (let i = 1; i <= 7; i += 1) {
      const d = new Date(`${dayKey}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      priorDays.push(d.toISOString().slice(0, 10));
    }
    const p = sumDays(funnel.daily, (d) => priorDays.includes(d));
    const pVisitors = sumVisitors(funnel.visitors, (d) => priorDays.includes(d));

    yesterday = { visitors: yVisitors, completions: y.completions, paid: y.paid };
    baseline = {
      visitors: pVisitors / 7,
      completions: p.completions / 7,
      paid: p.paid / 7,
    };

    blocks.push(divider());
    blocks.push(section("*Yesterday, against the usual day*"));
    blocks.push(
      fields([
        { label: "Visits", value: `${yVisitors}  _(${delta(yVisitors, pVisitors / 7)})_` },
        {
          label: "Finished survey",
          value: `${y.completions}  _(${delta(y.completions, p.completions / 7)})_`,
        },
        { label: "Paid", value: `${y.paid}  _(${delta(y.paid, p.paid / 7)})_` },
        {
          label: "Revenue",
          value: `${money(y.revenue)}  _(${delta(y.revenue, p.revenue / 7)})_`,
        },
      ])
    );
  }

  // ---- The funnel ----
  let steps: FunnelStep[] = [];
  if (funnel) {
    // Visits are attributable to an arm only from the recordVisit fix onwards, but
    // the TOTAL is sound either way, so the whole-population funnel uses it.
    const totalVisits = funnel.visitors.reduce((t, v) => t + v.n, 0);
    steps = buildFunnel(funnel.cohort, totalVisits);
    // Skip the visits -> finished step. It is the largest drop by construction
    // (most visitors never start a survey) and would be the headline every single
    // day, which is how a digest becomes wallpaper. The full funnel is printed
    // right below, so nothing is hidden — only the HEADLINE moves to a step
    // someone can act on.
    const leak = biggestLeak(steps.slice(1));
    blocks.push(divider());
    blocks.push(
      section(
        `*The funnel — ${WINDOW_DAYS} days*${
          leak
            ? `\nBiggest drop: ${escapeSlack(shortStep(leak.from))} → ${escapeSlack(shortStep(leak.to))}, losing ${leak.pct}%`
            : ""
        }`
      )
    );
    const rows = steps.map((s) => {
      const drop = s.dropFromPrev > 0 ? `  ▼ ${s.dropFromPrev}%` : "";
      return `\`${String(s.count).padStart(6)}\`  ${String(s.pctOfTop).padStart(5)}%  ${escapeSlack(s.step)}${drop}`;
    });
    blocks.push(section(rows.join("\n")));
  }

  // ---- One chart, underneath ----
  if (funnel) {
    const liveArms = ["white", "white_prev"] as const;
    const series = buildArmSeries(funnel, [liveArms[0], liveArms[1]]);

    // An arm with no sales yet plots as a flat line along the bottom, and a flat
    // line against a real curve reads as "this homepage converts at nothing" when
    // the truth is "13 people, far too few to say". Hiding the chart until both
    // arms have a sale would cost weeks of the other arm's trend, so the sample
    // sizes go in the HEADLINE instead and the flat line explains itself.
    const cohortFor = (arm: string) => funnel.cohort.find((c) => c.arm === arm);
    const armSummary = (arm: string) => {
      const label = armLabel("landing", arm).short;
      const row = cohortFor(arm);
      if (!row || row.completions === 0) return `${label} no finishers yet`;
      return `${label} ${row.paid}/${row.completions} paid`;
    };
    const smallest = Math.min(
      cohortFor(liveArms[0])?.completions ?? 0,
      cohortFor(liveArms[1])?.completions ?? 0
    );
    const headline =
      `${armSummary(liveArms[0])}  ·  ${armSummary(liveArms[1])}` +
      (smallest < TINY_ARM ? "  —  too early to compare" : "");

    // Chart whenever EITHER arm has something to show; the headline above carries
    // the caveat when one of them is effectively empty.
    const hasAnySignal =
      series.first.some((v) => v != null && v > 0) || series.last.some((v) => v != null && v > 0);
    if (hasAnySignal && series.labels.length > 1) {
      const url = await signedChartUrl({
        windowLabel,
        labels: series.labels,
        // null survives to the renderer as a genuine gap in the line.
        first: series.first.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        last: series.last.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
        title: "Purchases per finished survey, by homepage",
        legendFirst: armLabel("landing", liveArms[0]).short,
        legendLast: armLabel("landing", liveArms[1]).short,
        headline,
        footnote:
          // NOT "% of finishers who paid": numerator and denominator are both
          // counted on the day they happened, so the payers are not drawn from
          // that window's finishers. Nurture mail runs to 78h and post-call
          // coupons last 14 days, so a real share of any week's sales come from
          // earlier weeks' finishers — and the most recent days are depressed
          // because their finishers have not had time to buy yet.
          "purchases ÷ finished surveys, both counted on the day they happened — not a cohort rate; recent days read low · 7-day trailing · shared y-scale (peak {peak}%)",
      });
      if (url) {
        blocks.push({
          type: "image",
          image_url: url,
          alt_text: "Conversion rate by homepage arm over the last 30 days",
        });
      }
    }
  }

  // ---- Alerts ----
  const visitorArms = funnel
    ? Object.entries(
        funnel.visitors.reduce<Record<string, number>>((acc, v) => {
          acc[v.arm] = (acc[v.arm] ?? 0) + v.n;
          return acc;
        }, {})
      ).map(([arm, n]) => ({ arm, n }))
    : [];
  const alerts: DigestAlert[] = buildAlerts({
    verdicts,
    visitorArms,
    yesterday,
    baseline,
    pricingCutoverIso: PRICING_CUTOVER_ISO,
    now,
  });
  blocks.push(divider());
  blocks.push(
    section(
      `*Alerts*\n${alerts.map((a) => `${a.severity === "warn" ? "⚠️" : "•"} ${escapeSlack(a.message)}`).join("\n")}`
    )
  );

  const paidTotal = steps.length > 0 ? (steps[steps.length - 1]?.count ?? 0) : 0;
  // The fallback text is what lands in the dead-letter table when delivery fails
  // (blocks are NOT dead-lettered), and its first 100 chars are the 60s dedup key,
  // so the day goes early to keep it both standalone and unique per day.
  //
  // When the data could not be read this must NOT say "0 finished, 0 paid" —
  // that is the same falsehood as plotting a missing day as zero, and it is the
  // line that shows up in push notifications and sidebar previews.
  const text =
    funnel === null
      ? `:chart_with_upwards_trend: Conversion ${dayKey} — data unavailable (could not read the funnel)`
      : `:chart_with_upwards_trend: Conversion ${dayKey} — ${yesterday.completions} finished, ${yesterday.paid} paid yesterday; ${paidTotal} ever paid from ${WINDOW_DAYS} days of finishers`;

  const fitted = fitBlocks(blocks, text);
  return { text, blocks: fitted.blocks, trimmed: fitted.trimmed };
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Staging shares the prod DB, so it must not post or claim.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const trackDuration = startCronTimer("conversion-digest", 60);
  const startMs = Date.now();
  let cronError: string | undefined;

  try {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const yesterdayStart = new Date(dayStart.getTime() - 86_400_000);
    const dayKey = dayString(yesterdayStart);

    /**
     * Only the SCHEDULED run consumes the day.
     *
     * The claim in `slack_alert_sent` stops two instances both posting, but it
     * also made the first manual run of the day the only one anyone could look
     * at — and Vercel's "Run" button hits the bare path, so it cannot ask for a
     * preview. Anything fired outside the scheduled hour is therefore treated as
     * someone taking a look: no claim, no delivery mark, repeatable. `?preview=1`
     * forces that behaviour even during the scheduled hour.
     *
     * The window is two hours wide to absorb cron drift, so a run that starts a
     * few minutes late still counts as the real one and still claims exactly
     * once. A retry after 11:00 UTC would post again without claiming — a
     * duplicate digest, which is a far smaller problem than not being able to
     * preview the thing at all.
     *
     * Not a hole: the route already requires the CRON_SECRET bearer and refuses
     * to run off the production host, so the only callers are Vercel and whoever
     * holds the secret.
     */
    const SCHEDULED_HOURS_UTC = [9, 10];
    const inScheduledWindow = SCHEDULED_HOURS_UTC.includes(now.getUTCHours());
    const preview = new URL(request.url).searchParams.get("preview") === "1" || !inScheduledWindow;

    if (!preview) {
      const claimed = await tryClaimSlackAlert("conversion_digest", "day", dayKey);
      if (!claimed) {
        return NextResponse.json({ ok: true, day: dayKey, sent: false, reason: "already-claimed" });
      }
    }

    const windowStart = new Date(dayStart.getTime() - WINDOW_DAYS * 86_400_000).toISOString();
    const windowEnd = dayStart.toISOString();
    const [funnel, cohorts] = await Promise.all([
      fetchLandingArmFunnel(windowStart, windowEnd),
      fetchArmCohorts(windowStart, windowEnd),
    ]);

    const digest = await buildConversionDigest({ dayKey, funnel, cohorts, now });
    if (digest.trimmed) {
      logger.warn({ day: dayKey }, "conversion-digest: blocks trimmed to fit Slack");
    }

    await notifySlack({
      channel: "ops",
      // A distinct kind on previews so the 60s text-dedup cannot swallow a repeat
      // send while we iterate on the wording.
      kind: preview
        ? `conversion_digest_preview_${Date.now()}_${(previewSequence += 1)}`
        : "conversion_digest",
      text: digest.text,
      blocks: digest.blocks,
      username: "ops_alerts",
    });
    if (!preview) {
      await markSlackAlertDelivered("conversion_digest", "day", dayKey);
    }

    return NextResponse.json({ ok: true, day: dayKey, sent: true, preview });
  } catch (err) {
    logger.error({ err }, "conversion-digest cron failed");
    cronError = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("conversion-digest", startMs, cronError ? "error" : "success", cronError);
  }
}

/** Exported for the AMBIGUOUS bucket assertion in tests. */
export { AMBIGUOUS_VISITOR_ARM };
