import { NextResponse } from "next/server";
import { mineDecisions } from "@features/brain/server/ingest/mine-decisions";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  recordCronRun,
  startCronTimer,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Eight meetings at up to 60s each will not fit; the loop stops when the clock does
 *  and the rest are simply still unmined tomorrow. */
export const maxDuration = 300;

/**
 * GET /api/cron/brain-mine
 *
 * Turns meeting notes into decision records, eight meetings a night.
 *
 * The decision record is the best evidence this corpus holds and the thinnest thing in
 * it — FOUR records against 22,951 chunks — because it depends on somebody remembering
 * to write one. Meanwhile 121 meeting documents carry 356 passages of explicit decision
 * language that nobody ever promoted to a record.
 *
 * EIGHT PER RUN, AND THE BACKLOG DRAINS IN A FORTNIGHT. The model runs on Google's free
 * tier, which is rate-limited by request; a burst of 121 calls simply fails partway and
 * leaves the corpus half-mined with no record of where it stopped. Steady state is about
 * 0.5 meetings a day, so eight is ~16x headroom and absorbs any backlog on its own.
 *
 * A RATE LIMIT IS NOT AN EMPTY MEETING. When the model refuses, the loop stops and the
 * unread meetings keep no tombstone — otherwise a quota exhaustion would mark a dozen
 * meetings "scanned, nothing found" and they would never be read again.
 *
 * Nothing here posts to Slack. Mined decisions appear in search like any other, marked
 * as reconstructed; a nightly "I read eight meetings" message is the kind of noise that
 * gets a channel muted.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging and production share one database, so both would mine into the same corpus.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-mine", maxDuration);
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let result = { scanned: 0, written: 0, dropped: 0, skipped: null as string | null };

  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 8);
    result = await mineDecisions(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 40) : 8);
    logger.info(result, "brain: decision mining run");
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain: decision mining failed");
  }

  await checkSlow();
  await recordCronRun(
    "brain-mine",
    startedAtMs,
    status,
    errorMessage ??
      (result.skipped
        ? `stopped early: ${result.skipped}`
        : `scanned ${result.scanned}, wrote ${result.written}, dropped ${result.dropped}`)
  );

  return NextResponse.json({ ok: status === "success", ...result });
}
