/**
 * GET /api/cron/mira-nudges: Mira's daily nudge emails (features/mira/server/nudges.ts).
 *
 * Every 30 minutes; each person is due in the half hour from their chosen time, in their own
 * time zone. Off unless MIRA_NUDGES_ENABLED is "true" (and Mira's model key is set), and only
 * on the production host, like every cron here. Protected by `Authorization: Bearer
 * ${CRON_SECRET}`.
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runNudges } from "@features/mira/server/nudges";
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
  const startMs = Date.now();
  if (process.env.MIRA_NUDGES_ENABLED !== "true") {
    // Recorded, so the stall watch tells "switched off" from "stopped running".
    await recordCronRun("mira-nudges", startMs, "success");
    return NextResponse.json({ skipped: true, reason: "nudges-off" });
  }

  const trackDuration = startCronTimer("mira-nudges", 60);
  try {
    const summary = await runNudges(new Date(), { budgetMs: 45_000 });
    await recordCronRun("mira-nudges", startMs, "success");
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    logger.error({ err }, "mira-nudges cron failed");
    await recordCronRun("mira-nudges", startMs, "error", (err as Error)?.message);
    return NextResponse.json({ error: "Unable to send nudges." }, { status: 500 });
  } finally {
    await trackDuration();
  }
}
