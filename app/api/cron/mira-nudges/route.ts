/**
 * GET /api/cron/mira-nudges: Mira's daily nudge emails (features/mira/server/nudges.ts).
 *
 * Every 30 minutes; each person is due in the hour from their chosen time, in their own time
 * zone, so every slot gets two runs. Off unless MIRA_NUDGES_ENABLED is "true" (and Mira's model
 * key is set), and only on the production host, like every cron here. Protected by
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runJournalReminders } from "@features/mira/server/journal";
import { runNudges } from "@features/mira/server/nudges";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  if (!safeCompare(request.headers.get("authorization") || "", `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const startedAtMs = Date.now();
  if (process.env.MIRA_NUDGES_ENABLED !== "true") {
    // Recorded, so the stall watch tells "switched off" from "stopped running".
    await recordCronRun("mira-nudges", startedAtMs, "success");
    return NextResponse.json({ skipped: true, reason: "nudges-off" });
  }

  const trackDuration = startCronTimer("mira-nudges", maxDuration);
  let status: "success" | "error" = "success";
  let message: string | undefined;
  try {
    // The daily journal's reminders first (features/mira/server/journal.ts): no model call, so
    // seconds, inside the same budget; a failure of theirs never keeps the nudges from going.
    const journal = await runJournalReminders(new Date(startedAtMs), {
      outOfTime: () => Date.now() - startedAtMs > 225_000,
    }).catch((err: unknown) => {
      logger.error({ err }, "mira-nudges: the journal reminders failed");
      return null;
    });
    const summary = await runNudges(new Date(startedAtMs), {
      // Nobody new after 225 s: one person's worst case (the model's ~65 s with its fallback,
      // plus the reads and the send) still ends inside the 300 s ceiling, which would kill the
      // run without a cron_run row (features/cron/tests/cron-budgets.test.ts).
      outOfTime: () => Date.now() - startedAtMs > 225_000,
    });
    const { stoppedEarly, errors, skipped } = summary;
    // People left out or failed is an error: in cron_run, and one line to ops (logger.error).
    if (stoppedEarly || errors > 0 || skipped["no-model"] || skipped["no-email-setup"]) {
      status = "error";
      message =
        `sent ${summary.sent} of ${summary.due} due, ${errors} failed` +
        (stoppedEarly ? ", stopped at the time budget (the rest wait for the next run)" : "") +
        (Object.keys(skipped).length ? `; skipped ${JSON.stringify(skipped)}` : "");
      logger.error({ cron: "mira-nudges", reason: message }, "mira-nudges: people were left out");
    }
    // Journal reminders left out or failed are an error too, in the same row.
    if (
      !journal ||
      journal.errors > 0 ||
      journal.stoppedEarly ||
      journal.skipped["no-email-setup"]
    ) {
      status = "error";
      const said = journal
        ? `sent ${journal.sent} of ${journal.due} due, ${journal.errors} failed` +
          (journal.stoppedEarly ? ", stopped at the time budget" : "") +
          (Object.keys(journal.skipped).length
            ? `, skipped ${JSON.stringify(journal.skipped)}`
            : "")
        : "could not run";
      message = [message, `journal reminders: ${said}`].filter(Boolean).join("; ");
      if (journal)
        logger.error(
          { cron: "mira-nudges", reason: message },
          "mira-nudges: reminders were left out"
        );
    }
    return NextResponse.json({ ok: true, ...summary, journal });
  } catch (err) {
    status = "error";
    message = (err as Error)?.message;
    logger.error({ err }, "mira-nudges cron failed");
    return NextResponse.json({ error: "Unable to send nudges." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("mira-nudges", startedAtMs, status, message);
  }
}
