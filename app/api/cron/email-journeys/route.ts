/**
 * GET /api/cron/email-journeys
 *
 * Hourly. The email journeys' new emails (features/email-journeys/server/journeys.ts): I2, I4,
 * R2, C2, pay to start's S3 to S5 and its survey reminders. Each has its own switch in
 * system_flags, all off until the email's trial send is approved; with every switch off a run
 * reads nothing and sends nothing. Production only (staging shares Resend, not this database,
 * but its readers are test runs). Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */

import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getResend } from "@features/email-journeys/server/send";
import { runJourneys } from "@features/email-journeys/server/journeys";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun, startCronTimer } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }
  if (!safeCompare(request.headers.get("authorization") || "", `Bearer ${expected}`)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const resend = getResend();
  if (!resend) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const startedAtMs = Date.now();
  const trackDuration = startCronTimer("email-journeys", maxDuration);
  let status: "success" | "error" = "success";
  let message: string | undefined;
  try {
    const run = await runJourneys({
      resend,
      nowMs: startedAtMs,
      // The walk budget, 40 s under the 60 s ceiling (features/cron/tests/cron-budgets.test.ts).
      outOfTime: () => Date.now() - startedAtMs > 20_000,
    });
    const stages = Object.entries(run.stages)
      .map(([name, c]) => (c === "off" ? `${name}:off` : `${name}:${c.sent}/${c.candidates}`))
      .join(" ");
    message = `sent ${run.sent}, failed ${run.failed}${run.stoppedEarly ? ", stopped at the budget" : ""} · ${stages}`;
    // A run that only failed did not do its job: an error, with what failed (cron_run and ops).
    if (run.failed > 0 && run.sent === 0) {
      status = "error";
      logger.error({ run }, `email-journeys: ${run.failed} sends failed, none went`);
    } else {
      logger.info({ run }, "email-journeys finished");
    }
    return NextResponse.json({ success: true, ...run });
  } catch (err) {
    status = "error";
    message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "email-journeys cron failed");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  } finally {
    await trackDuration();
    await recordCronRun("email-journeys", startedAtMs, status, message?.slice(0, 500));
  }
}
