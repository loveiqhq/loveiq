/**
 * GET /api/cron/mira-session-reminders: the weekly session's reminder emails, 30 to 60 minutes
 * before each start (features/mira/server/session-emails.ts runSessionReminders).
 *
 * Every 15 minutes, so each start's window holds two runs; a start is claimed before its email
 * goes, so it gets one. People booked these themselves, so there is no switch beyond the cron
 * itself; only the production host sends, like every cron here. Protected by
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runSessionReminders } from "@features/mira/server/session-emails";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const trackDuration = startCronTimer("mira-session-reminders", maxDuration);
  let status: "success" | "error" = "success";
  let message: string | undefined;
  try {
    const summary = await runSessionReminders(new Date(startedAtMs), {
      // Nobody new after 20 s: an email in flight still ends well inside the 60 s ceiling.
      outOfTime: () => Date.now() - startedAtMs > 20_000,
    });
    const { stoppedEarly, errors, skipped } = summary;
    if (stoppedEarly || errors > 0 || skipped["no-email-setup"]) {
      status = "error";
      message =
        `sent ${summary.sent} of ${summary.due} due, ${errors} failed` +
        (stoppedEarly
          ? ", stopped at the time budget (the window's next run sends the rest)"
          : "") +
        (Object.keys(skipped).length ? `; skipped ${JSON.stringify(skipped)}` : "");
      logger.error(
        { cron: "mira-session-reminders", reason: message },
        "mira-session-reminders: reminders were left out"
      );
    }
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    status = "error";
    message = (err as Error)?.message;
    logger.error({ err }, "mira-session-reminders cron failed");
    return NextResponse.json({ error: "Unable to send reminders." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("mira-session-reminders", startedAtMs, status, message);
  }
}
