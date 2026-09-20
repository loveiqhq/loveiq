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
    /**
     * TWELVE, not eight: eight per day could never spend a twenty-a-day allowance.
     *
     * One document costs one model call, the free tier allows 20 a day, and this cron is
     * the only scheduled consumer of any size. At 8 the ceiling was the LIMIT rather than
     * the quota — measured 2026-09-15, four runs averaged 6.5 documents, 81% of the cap,
     * while a dozen requests a day went unused. 97 documents remain; 12 a day drains them
     * in about eight days against fifteen.
     *
     * Not 20. `brain-brief` and `/api/slack/events` draw on the same allowance, and the
     * Slack bot answers on demand — taking the whole quota here would leave the team's
     * questions unanswerable for the rest of the Pacific day. Twelve leaves roughly eight.
     *
     * Time is not the constraint: ~3s per document plus a ~32s per-minute wait every five
     * puts twelve at ~100s against a 240s budget and a 300s ceiling.
     */
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 12);
    result = await mineDecisions(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 40) : 12);
    logger.info(result, "brain: decision mining run");
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain: decision mining failed");
  }

  /**
   * A RUN THAT READ NOTHING IS NOT A SUCCESSFUL RUN.
   *
   * `skipped` alone is not a failure — stopping on the per-minute quota after mining
   * five meetings is this cron working as designed, and marking that an error would
   * fire an alert every night on a healthy drain. Stopping having read ZERO is the
   * other thing entirely, and it looked identical from the outside: `status` only
   * became "error" on a thrown exception, so two consecutive days of
   * `stopped early: error:HTTP 503` — 1.5s runs that mined nothing — recorded as
   * success and alerted nobody. The miner had been dead since 2026-09-18 and the only
   * way to know was to read `error_message` by hand.
   *
   * AND IT HAS TO BE LOGGED, NOT ONLY RECORDED. `recordCronRun` writes a row and
   * nothing else; the mirror to Slack lives in `logger`, and fires on level 50. The
   * first version of this fix set the status and returned — which made the truth
   * available to anyone who thought to query `cron_run`, the exact audit that found
   * the outage in the first place, and told nobody. `cron-stall` does not cover it
   * either: that watches for a cron that STOPS FIRING, and this one fires happily.
   *
   * The message has to begin with "brain" for `isBrainMessage` to route it to the
   * brain channel rather than ops. No day-key dedup as the ingest crons use, because
   * this one runs once a day, so at worst it says so once a day.
   */
  if (status === "success" && result.skipped && result.scanned === 0) {
    status = "error";
    errorMessage = `mined nothing: ${result.skipped}`;
    logger.error({ skipped: result.skipped }, "brain-mine: read no meetings at all");
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
