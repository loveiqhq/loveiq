import { NextResponse } from "next/server";
import { ingestFreshMeetingNotes } from "@features/brain/server/ingest/drive";
import { linkMeetings } from "@features/brain/server/ingest/link";
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
/**
 * 120, though reading stops at 20 s: a Drive request started just inside that can spend
 * three 20 s tries (about 62 s), and a run killed at the ceiling records nothing.
 */
export const maxDuration = 120;

/**
 * GET /api/cron/brain-meeting-notes
 *
 * New Gemini meeting notes into the brain every ten minutes, instead of up to an hour
 * later with the hourly Drive walk (`brain-drive`), which stays the authority: this
 * only adds and updates notes, and never sweeps. See `ingestFreshMeetingNotes`.
 *
 * At :00, :10 … :50, so the :50 run is done well before the walk starts at :52.
 */

/** Skips that mean "not set up here", which must never alert. */
const DELIBERATE_SKIPS = new Set(["google-not-configured"]);

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging shares this database; without the gate both projects would write.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-meeting-notes", maxDuration);
  // Reading stops here; the write and the meeting links after it need the rest.
  const isOutOfTime = () => Date.now() - startedAtMs > 20_000;

  const dayKey = new Date().toISOString().slice(0, 10);
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_meeting_notes_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "brain", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  try {
    const result = await ingestFreshMeetingNotes(
      new Date().toISOString(),
      isOutOfTime,
      readVercelOidcToken(request)
    );
    logger.info({ result }, "brain-meeting-notes: done");

    // A written note has no meeting link yet, and a rewritten one has lost its link,
    // since a write replaces `meta`. Secondary, like in brain-drive: logged, never thrown.
    if (result.rows > 0) {
      try {
        const linked = await linkMeetings();
        logger.info({ linked }, "brain-meeting-notes: meeting links");
      } catch (err) {
        logger.error({ err }, "brain-meeting-notes: linking meetings failed");
      }
    }

    errorMessage = ingestNote(result);
    if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `meeting notes skipped: ${result.skipped} — ${ingestNote(result)}`;
      await alertOnce(
        `skip:${result.skipped}`,
        `:brain: brain-meeting-notes skipped (${escapeSlack(result.skipped)}). New meeting ` +
          `notes now wait for the hourly Drive walk.`
      );
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    // `slack: false`: the alert below is the one message; see brain-drive.
    logger.error({ err, slack: false }, "brain-meeting-notes failed");
    await alertOnce(
      "error",
      `:brain: brain-meeting-notes failed: ${escapeSlack(errorMessage.slice(0, 300))}`
    );
    // 200 so Vercel does not retry a job that runs again in ten minutes.
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-meeting-notes", startedAtMs, status, errorMessage);
  }
}
