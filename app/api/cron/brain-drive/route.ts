import { NextResponse } from "next/server";
import { ingestDrive } from "@features/brain/server/ingest/drive";
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
/**
 * 300 seconds, not 60.
 *
 * A full company-Drive walk does not fit in a minute any more: 512 documents, PDFs
 * downloaded and parsed, then a touch of 11,000+ existing rows in batches of 100.
 * At 60s it was killed mid-run twice (504 at 01:37 inside brain-fast, and again at
 * 01:52 on its own lane) — and a killed run is not a slow one, because the upsert
 * happens after the walk, so everything fetched is thrown away.
 *
 * Hourly, so a five-minute ceiling is comfortably inside its own period.
 */
export const maxDuration = 300;

/**
 * GET /api/cron/brain-drive
 *
 * The company Drive, hourly and on its own clock.
 *
 * It used to live in the 15-minute lane, and that was right while the service
 * account could only see the 24 files someone had shared with it. Once Drive
 * started impersonating a person it began walking the WHOLE Drive — 512 documents,
 * downloading and parsing PDFs — and promptly took `brain-fast` past its 60-second
 * ceiling (observed: 504 at 01:37 on 2026-08-31). A heavy per-person walk must not
 * be able to starve the funnel numbers and Slack of their clock, which is the same
 * reasoning that gave gmail and calendar their own jobs.
 *
 * Runs at :52, clear of gmail (:11), calendar (:26) and notion (:41).
 */

/** Skips that mean "not set up yet", which must never alert. */
const DELIBERATE_SKIPS = new Set([
  "google-token-unavailable",
  "drive-nothing-shared",
  "drive-time-budget",
  "google-not-configured",
]);

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging shares this database; without the gate both projects would write.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-drive", maxDuration);
  // Notion's tail (upsert of up to 1,400 rows, touch batches, sweep) runs after
  // this expires and cannot be interrupted, so leave it room.
  /**
   * 240 seconds of FETCHING, inside a 300-second ceiling.
   *
   * The budget only bounds the walk. Everything after it — the upsert, the touch
   * batches, the sweep — cannot be interrupted, and that tail grows with how much
   * the walk fetched. Measured on gmail mid-re-walk: 58.1s total against a 40s
   * budget, so an 18s tail. With a 300s ceiling the walk gets 240s and the tail
   * keeps a full minute, which is the ratio the smaller lanes run at.
   *
   * A killed run is not a slow run: `ingestGmail` upserts AFTER its loop, so a
   * timeout throws away everything that run fetched. Trading ~25% of the walk per
   * run for never losing a whole one is the right way round.
   */
  const isOutOfTime = () => Date.now() - startedAtMs > 240_000;

  const dayKey = new Date().toISOString().slice(0, 10);
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_gmail_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "ops", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let result;

  try {
    result = await ingestDrive(new Date().toISOString(), isOutOfTime, readVercelOidcToken(request));
    logger.info({ result }, "brain-drive: done");

    if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `drive skipped: ${result.skipped}`;
      await alertOnce(
        `skip:${result.skipped}`,
        `:brain: brain-drive skipped (${escapeSlack(result.skipped)}). Notion is frozen but ` +
          `nothing failed, so this will not look broken.`
      );
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-drive failed");
    await alertOnce(
      "error",
      `:brain: brain-drive failed: ${escapeSlack(errorMessage.slice(0, 300))}`
    );
    // 200 so Vercel does not retry a job that will fail again within the hour.
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-drive", startedAtMs, status, errorMessage);
  }
}
