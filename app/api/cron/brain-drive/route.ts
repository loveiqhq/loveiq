import { NextResponse } from "next/server";
import { ingestDrive } from "@features/brain/server/ingest/drive";
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
 * GET /api/cron/brain-drive
 *
 * Drive on its own, every 15 minutes, so the Gemini notes written after a call are
 * searchable within minutes instead of the following morning.
 *
 * WHY A SEPARATE CRON AND NOT A FASTER `brain-ingest`. That job crawls all 35
 * Notion databases and both Google properties and costs ~30s a run; at
 * 15-minute intervals it would spend an hour of compute a day re-reading things
 * that change daily at most, and hammer Notion's rate limit for nothing. Drive is
 * the opposite shape: ONE list call, and the incremental check means content is
 * only fetched for documents whose `modifiedTime` actually moved. A run with
 * nothing new is a single HTTP request.
 *
 * Nightly `brain-ingest` still ingests Drive too. That is deliberate redundancy,
 * not an oversight: if this job is ever disabled or failing, the corpus still
 * catches up once a day rather than silently stopping.
 *
 * NOTHING SHARED IS NOT AN ALERT. Until somebody shares a folder with
 * `ga4-reader@loveiq-brain.iam.gserviceaccount.com`, every run reports
 * `drive-nothing-shared` — the expected state, and one that must not page anyone
 * 96 times a day.
 */

/** Skips that mean "not set up yet", which must never alert. Everything else does,
 *  so a new failure kind is noisy by default rather than silent. */
const DELIBERATE_SKIPS = new Set([
  "google-not-configured",
  "drive-nothing-shared",
  "drive-time-budget",
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
  const checkSlow = startCronTimer("brain-drive", maxDuration);
  // Well inside maxDuration: the tail (upsert, touch, sweep) runs after this and
  // cannot be interrupted.
  const isOutOfTime = () => Date.now() - startedAtMs > 40_000;

  /**
   * Once per distinct fault per DAY, not per run. At 96 runs a day a persistent
   * fault would otherwise post 96 times and train everyone to mute the channel —
   * the same reasoning as brain-ingest, and the claim must be MARKED delivered or
   * the stale-reclaim path fires on the next run anyway.
   */
  const dayKey = new Date().toISOString().slice(0, 10);
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_drive_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "ops", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let result;

  try {
    result = await ingestDrive(new Date().toISOString(), isOutOfTime);
    logger.info({ result }, "brain-drive: done");

    if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `drive skipped: ${result.skipped}`;
      await alertOnce(`skip:${result.skipped}`, `brain-drive skipped: ${escapeSlack(result.skipped)}`);
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-drive failed");
    await alertOnce("error", `brain-drive failed: ${escapeSlack(errorMessage.slice(0, 300))}`);
    // 200 so Vercel does not retry a job that will fail again in 15 minutes; the
    // failure is in cron_run and in the body.
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-drive", startedAtMs, status, errorMessage);
  }
}
