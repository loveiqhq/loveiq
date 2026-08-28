import { NextResponse } from "next/server";
import { ingestAnalytics } from "@features/brain/server/ingest/analytics";
import { ingestDrive } from "@features/brain/server/ingest/drive";
import { ingestGa4, ingestSearchConsole } from "@features/brain/server/ingest/google";
import { ingestJira } from "@features/brain/server/ingest/jira";
import { ingestNotion } from "@features/brain/server/ingest/notion";
import type { IngestResult } from "@features/brain/server/ingest/upsert";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { escapeSlack, notifySlack } from "@shared/observability/slack";
import {
  markSlackAlertDelivered,
  recordCronRun,
  startCronTimer,
  tryClaimSlackAlert,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Skips that mean "we chose not to configure this", which must never alert — the
 * team knows, and a daily reminder trains everyone to ignore the channel.
 *
 * Everything NOT in here alerts, including `google-token-unavailable` (a revoked
 * credential) and `jira-time-budget` (a run that ran out of clock). New skip
 * strings therefore alert by default, which is the safe direction.
 */
const DELIBERATE_SKIPS = new Set([
  "jira-not-configured",
  "google-not-configured",
  "ga4-no-property-id",
  "gsc-no-site",
  "notion-not-configured",
]);

/**
 * GET /api/cron/brain-ingest
 *
 * Nightly ingest of the parts of the company-brain corpus that do NOT live in
 * git: the funnel numbers, and Jira. The other half — 107 markdown docs and 1,476
 * commit messages — is ingested by `.github/workflows/brain-ingest.yml` on push,
 * because only inside an Action are the files and the history actually on disk.
 *
 * EACH SOURCE FAILS ALONE. They are run in sequence but caught individually, so a
 * Jira outage or a rotated token still leaves the analytics rollup refreshed. A
 * single try/catch around both would have made every ingester only as reliable as
 * the least reliable one.
 *
 * ORDER IS DELIBERATE. GA4 goes first because `analytics` reads its ad-spend
 * numbers back out of the chunks it wrote, so that one row can answer "what did
 * we spend and what did we earn". Jira goes last because it is a paginated walk
 * of a third-party API and the only one that can run out of time — anything
 * after it would be starved on a slow night.
 */

/** Leaves ~15s of the 60s budget for the response and the cron bookkeeping. */
/**
 * When to STOP STARTING new work, not when the run ends.
 *
 * Every ingester has a tail that runs after this expires and cannot be
 * interrupted: it must finish writing the rows it already fetched, confirm the
 * ones it did not, and sweep. Measured for Notion at 1,062 chunks that tail is
 * ~6s (11 touch batches plus the upsert and the sweep), and it grows with the
 * corpus, so the gap to `maxDuration` is the margin that keeps a run from being
 * killed mid-write.
 *
 * 38s against a 60s ceiling leaves ~22s. Raise `maxDuration` here AND in
 * `vercel.json` before raising this.
 */
const TIME_BUDGET_MS = 38_000;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    // Staging shares this Supabase database; without the gate both projects would
    // write the same rows.
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-ingest", maxDuration);
  const isOutOfTime = () => Date.now() - startedAtMs > TIME_BUDGET_MS;

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  const stampedAt = new Date().toISOString();
  const results: IngestResult[] = [];

  const dayKey = stampedAt.slice(0, 10);

  /**
   * Claim, notify, MARK. The mark was missing, so the claim row stayed
   * `delivered = false` and the ">10 min stale reclaim" path matched on every
   * later run — the "once per source per day" the comment promises was happening
   * only by accident of the daily cadence, and broke the moment anyone pressed
   * Run twice in the Vercel dashboard.
   */
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_ingest_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "ops", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  const run = async (name: string, fn: () => Promise<IngestResult>) => {
    try {
      const result = await fn();
      results.push(result);

      // A SOURCE THAT QUIETLY DOES NOTHING NEVER THREW, so it never alerted.
      // Three separate paths land here: credentials unset (`skipped`), a revoked
      // Google refresh token (also `skipped`, because getGoogleAccessToken just
      // returns null), and a run that wrote zero rows. All three returned
      // `status: "success"` and `{ok: true}`, which is how Jira sat at zero
      // chunks indefinitely while the brain told askers "nothing in Jira".
      // AN EXPLICIT LIST, NOT A SUFFIX TEST. `endsWith("not-configured")` was
      // wrong in BOTH directions: it alerted every day for `ga4-no-property-id`
      // and `gsc-no-site`, which are deliberately unset, and it stayed SILENT for
      // `google-not-configured`, which at the time also covered a revoked refresh
      // token — the one case the comment below says is worth waking someone for.
      // A channel that cries wolf daily gets muted, taking the real alerts with it.
      if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
        logger.warn({ ingester: name, skipped: result.skipped }, "brain-ingest: source skipped");
        await alertOnce(
          name,
          `:brain: Company-brain ingest SKIPPED *${escapeSlack(name)}* (${escapeSlack(result.skipped)}). Nothing failed, so this will not look broken — but that source is frozen and the brain will keep answering without it.`
        );
      } else if (result.skipped) {
        // Logged, not alerted: visible in the response body and in `cron_run`.
        logger.info(
          { ingester: name, skipped: result.skipped },
          "brain-ingest: source not configured, skipping"
        );
      } else if (result.rows === 0) {
        logger.warn({ ingester: name }, "brain-ingest: source wrote zero rows");
        await alertOnce(
          name,
          `:brain: Company-brain ingest wrote *0 rows* for *${escapeSlack(name)}*. The run succeeded, so nothing else will report this.`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, ingester: name }, "brain-ingest: source failed");
      results.push({ source: name, rows: 0, swept: 0, error: message });
      status = "error";
      errorMessage = errorMessage ? `${errorMessage}; ${message}` : message;

      // A source that quietly stops is the real failure mode here: the brain
      // keeps answering, just from data that is silently months stale, and
      // nobody notices because nothing is broken. Alert once per source per day
      // — an expired Google credential would otherwise page every night.
      //
      // The message deliberately carries the source error verbatim, because for
      // the Google ingesters that text IS the fix (the scope hint names the
      // exact command to re-run).
      await alertOnce(
        name,
        `:brain: Company-brain ingest failed for *${escapeSlack(name)}*. The brain will keep answering from whatever it already has, so this will not look broken.\n> ${escapeSlack(message.slice(0, 500))}`
      );
    }
  };

  try {
    // GA4 first: `analytics` reads the ad spend back off the ga4 chunks to put
    // spend and revenue in one row, so it must run after them.
    await run("ga4", () => ingestGa4(stampedAt, isOutOfTime));
    await run("gsc", () => ingestSearchConsole(stampedAt, isOutOfTime));
    await run("analytics", () => ingestAnalytics(stampedAt));
    await run("jira", () => ingestJira(stampedAt, isOutOfTime));
    // Notion last, and given the run's clock: it is the only source whose cost
    // scales with page COUNT rather than row count (one request per page for
    // block content), so it is the one most likely to need cutting short.
    await run("notion", () => ingestNotion(stampedAt, isOutOfTime));

    logger.info({ results }, "brain-ingest: done");
    // 200 even when a source failed: the run itself completed and Vercel must not
    // retry it. The failure is visible in `cron_run` and in the response body.
    return NextResponse.json({ ok: status === "success", results });
  } finally {
    await checkSlow();
    await recordCronRun("brain-ingest", startedAtMs, status, errorMessage);
  }
}
