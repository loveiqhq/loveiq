import { NextResponse } from "next/server";
import { ingestCalendar } from "@features/brain/server/ingest/calendar";
import { ingestNote } from "@features/brain/server/ingest/upsert";
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
 * GET /api/cron/brain-calendar
 *
 * The meetings behind everything else. The rest of the corpus records what was
 * WRITTEN; this records who actually sat down with whom, and when — the frame a lot
 * of that writing only makes sense inside.
 *
 * HOURLY, AND ITS OWN JOB. It walks every calendar in the domain over delegation,
 * which is the same per-mailbox cost as Gmail — and `brain-gmail` already uses 48 of
 * its 60 seconds, so sharing a lane would starve one of them. Hourly rather than
 * quarter-hourly because a meeting moved five minutes ago is not a question anyone
 * asks the brain; a meeting last Tuesday is.
 *
 * Runs at :26, between gmail (:11) and notion (:41), so the three Google-credential
 * jobs never contend.
 */

/** Skips that mean "not set up yet", which must never alert. */
const DELIBERATE_SKIPS = new Set([
  "google-token-unavailable",
  "calendar-nothing-to-index",
  "calendar-time-budget",
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
  const checkSlow = startCronTimer("brain-calendar", maxDuration);
  // The tail — upsert, touch batches, sweep — runs after this expires and cannot be
  // interrupted, so leave it room.
  /**
   * 30 seconds of FETCHING, not 40.
   *
   * The budget only bounds the walk. Everything after it — the upsert, the touch
   * batches, the sweep — cannot be interrupted, and that tail grows with how much
   * the walk fetched. Measured on gmail mid-re-walk: 58.1s total against a 40s
   * budget, so an 18s tail, against a 60s ceiling. Two seconds of margin is not
   * margin.
   *
   * A killed run is not a slow run: `ingestGmail` upserts AFTER its loop, so a
   * timeout throws away everything that run fetched. Trading ~25% of the walk per
   * run for never losing a whole one is the right way round.
   */
  const isOutOfTime = () => Date.now() - startedAtMs > 30_000;

  const dayKey = new Date().toISOString().slice(0, 10);
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_calendar_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "ops", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let result;

  try {
    result = await ingestCalendar(
      new Date().toISOString(),
      isOutOfTime,
      readVercelOidcToken(request)
    );
    logger.info({ result }, "brain-calendar: done");

    // What the run saw, recorded whatever the status. Overwritten below if it failed.
    errorMessage = ingestNote(result);

    if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `calendar skipped: ${result.skipped} — ${ingestNote(result)}`;
      await alertOnce(
        `skip:${result.skipped}`,
        `:brain: brain-calendar skipped (${escapeSlack(result.skipped)}). Meetings are frozen ` +
          `but nothing else failed, so this will not look broken.\n` +
          `> If this says \`calendar-walk-incomplete\` on the very first run, the delegation grant ` +
          `in the Google Admin console is probably missing \`.../auth/calendar.readonly\` — mailbox ` +
          `discovery uses a different scope, so the domain list works and every calendar is then refused.`
      );
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-calendar failed");
    await alertOnce(
      "error",
      `:brain: brain-calendar failed: ${escapeSlack(errorMessage.slice(0, 300))}`
    );
    // 200 so Vercel does not retry a job that will fail again within the hour.
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-calendar", startedAtMs, status, errorMessage);
  }
}
