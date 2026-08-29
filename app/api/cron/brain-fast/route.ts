import { NextResponse } from "next/server";
import { ingestAnalytics } from "@features/brain/server/ingest/analytics";
import { ingestDrive } from "@features/brain/server/ingest/drive";
import { ingestSlack } from "@features/brain/server/ingest/slack";
import type { IngestResult } from "@features/brain/server/ingest/upsert";
import { readVercelOidcToken } from "@shared/http/google-oauth";
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
 * GET /api/cron/brain-fast
 *
 * The sources that change CONTINUOUSLY, every 15 minutes, so the brain is minutes
 * behind reality rather than up to a day.
 *
 * Was `brain-drive`, which ran call notes alone. The other two earned their place
 * by getting cheap: an incremental Slack pass fell from 266s to ~4s once it stopped
 * re-walking all history every run, and the funnel rollup is ~2s. Measured
 * end-to-end: drive 0.6s + analytics 1.9s + slack 3.9s = 6.4s, against a 60s
 * ceiling.
 *
 * WHAT IS DELIBERATELY NOT HERE, and why this is not just "run everything often":
 *
 * - `notion` costs ~32s because it enumerates all 35 databases whether or not
 *   anything changed. It has its own hourly job — still 24x fresher than nightly,
 *   without spending 50 minutes of compute a day re-reading unchanged pages.
 * - `ga4` and `gsc` stay NIGHTLY because Google's own data lags 1-3 days. Polling
 *   them every 15 minutes would re-fetch identical numbers 96 times a day. For
 *   those two, nightly IS live; anything faster is noise.
 *
 * EACH SOURCE FAILS ALONE. They run in sequence but are caught individually, so a
 * Slack outage still leaves the funnel numbers refreshed.
 */

/** Skips that mean "not set up yet", which must never alert. Everything else does,
 *  so a new failure kind is noisy by default rather than silent. */
const DELIBERATE_SKIPS = new Set([
  "google-not-configured",
  "drive-nothing-shared",
  "drive-time-budget",
  "slack-not-configured",
  "slack-nothing-to-index",
]);

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging and production share one database, so without this the staging
  // deployment would double-write every 15 minutes.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-fast", maxDuration);
  // Well inside maxDuration: every ingester has a tail (upsert, touch, sweep) that
  // runs after this expires and cannot be interrupted.
  const isOutOfTime = () => Date.now() - startedAtMs > 40_000;

  /**
   * Once per distinct fault per DAY, not per run. At 96 runs a day a persistent
   * fault would otherwise post 96 times and train everyone to mute the channel.
   * The claim must be MARKED delivered or the stale-reclaim path fires anyway.
   */
  const dayKey = new Date().toISOString().slice(0, 10);
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_fast_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "ops", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  const results: IngestResult[] = [];
  const stampedAt = new Date().toISOString();

  const run = async (name: string, fn: () => Promise<IngestResult>): Promise<void> => {
    try {
      const result = await fn();
      results.push(result);
      if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
        status = "error";
        errorMessage = `${name} skipped: ${result.skipped}`;
        await alertOnce(
          `skip:${result.skipped}`,
          `:brain: brain-fast skipped *${escapeSlack(name)}* (${escapeSlack(result.skipped)}). ` +
            `That source is frozen but nothing failed, so it will not look broken.`
        );
      }
    } catch (err) {
      status = "error";
      const message = err instanceof Error ? err.message : String(err);
      errorMessage = message;
      logger.error({ err, ingester: name }, "brain-fast: source failed");
      await alertOnce(
        `error:${name}`,
        `:brain: brain-fast failed for *${escapeSlack(name)}*. The brain keeps answering ` +
          `from what it already has, so this will not look broken.\n> ${escapeSlack(message.slice(0, 400))}`
      );
    }
  };

  try {
    // The identity token is a REQUEST header, so it has to be read here and handed
    // down — it is not in the environment. Getting this wrong is what made the
    // keyless Google path fail silently in production.
    const oidcToken = readVercelOidcToken(request);
    await run("drive", () => ingestDrive(stampedAt, isOutOfTime, oidcToken));
    await run("analytics", () => ingestAnalytics(stampedAt));
    await run("slack", () => ingestSlack(stampedAt, isOutOfTime));

    logger.info({ results }, "brain-fast: done");
    // 200 even when a source failed: the run itself completed and Vercel must not
    // retry a job that will fail again in 15 minutes.
    return NextResponse.json({ ok: status === "success", results });
  } finally {
    await checkSlow();
    await recordCronRun("brain-fast", startedAtMs, status, errorMessage);
  }
}
