import { NextResponse } from "next/server";
import { ingestNotion } from "@features/brain/server/ingest/notion";
import { ingestNote, sweptAt } from "@features/brain/server/ingest/upsert";
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
 * 120, not 60. The BUDGET is unchanged — what was missing is room for the tail.
 *
 * `maxDuration` does not make a run longer; it decides when the run is killed, and a
 * kill writes NO `cron_run` row, so the worst runs are the ones that leave no trace.
 * Measured over 7 days on 2026-09-06: brain-notion's worst completed run was 59,117ms
 * against a 60,000ms ceiling — 883 milliseconds of margin — and brain-fast reached
 * 56,596ms with a p95 of 44,141ms. Those are the SURVIVORS; anything that actually hit
 * the ceiling is invisible by construction.
 *
 * 80s of tail room against a measured worst tail of 18s, and `brain-brief` has run at
 * 120 since it was written. Raising the ceiling is close to free on Fluid Compute
 * because billing follows active CPU, not the ceiling.
 */
export const maxDuration = 120;

/**
 * GET /api/cron/brain-notion
 *
 * Notion hourly — 24x fresher than the nightly job it moved out of, so an edit
 * made this morning is searchable this morning.
 *
 * WHY NOT IN `brain-fast` WITH THE OTHERS. Notion costs ~32s a run whether or not
 * anything changed, because it enumerates all 35 databases to find what moved. At
 * 15-minute intervals that is ~50 minutes of compute a day spent re-reading
 * unchanged pages, and it would sit against Notion's rate limit for no benefit.
 * Hourly is the point where freshness stops being worth the spend.
 *
 * The cheap fix would be a `/search`-by-last-edited crawl instead of querying every
 * database — but that can never notice a DELETED page, and the sweep depends on
 * knowing the full set. Cost was the right thing to trade here.
 */

/** Skips that mean "not set up yet", which must never alert. */
const DELIBERATE_SKIPS = new Set(["notion-not-configured"]);

/** The sweep is due every 20 hours (upsert.ts); six hours of grace before it counts as stopped. */
const SWEEP_STALE_MS = 26 * 3_600_000;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging shares this database; without the gate both projects would write.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-notion", maxDuration);
  // Notion's tail (upsert of up to 1,400 rows, touch batches, sweep) runs after
  // this expires and cannot be interrupted, so leave it room.
  //
  // 65 s, up from 40. The crawl alone now takes most of 40 s (39 databases plus a full page
  // listing, ~63 requests in sequence), so seven runs in the fortnight to 2026-10-05 stopped
  // DURING the crawl at 40.4-40.9 s, and the rest left the fetch only a few seconds: runs
  // wrote 1-18 pages each, and a database created that morning was still unindexed three
  // runs later. The clock is checked between requests, so one that starts just inside the
  // budget can still cost 35 s (a slow 15 s answer, the capped 5 s wait, a 15 s retry), and
  // the tail after it measured at most ~18 s: 65 + 35 + 18 = 118 s, under the 120 s ceiling.
  const isOutOfTime = () => Date.now() - startedAtMs > 65_000;

  const dayKey = new Date().toISOString().slice(0, 10);
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_notion_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "brain", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let result;

  try {
    result = await ingestNotion(new Date().toISOString(), isOutOfTime);
    logger.info({ result }, "brain-notion: done");

    // What the run saw, recorded whatever the status. Overwritten below if it failed.
    errorMessage = ingestNote(result);

    /**
     * A PARTIAL CRAWL IS NOT A FAULT; A SWEEP THAT STOPPED IS. A crawl the clock cut short
     * leaves the sweep for the next complete one, and every partial crawl in the fortnight to
     * 2026-10-05 was followed by a complete one within the hour, with the sweep still running
     * daily. Reporting each as an error, with an alert saying Notion was frozen, was a false
     * alarm. What matters is whether deletions are still being noticed, so a partial crawl
     * counts as success with a note while the sweep ran recently, and as an error once it
     * has not run for SWEEP_STALE_MS (it is due every 20 hours) or its state cannot be read.
     */
    if (result.skipped === "notion-crawl-incomplete") {
      const last = await sweptAt("notion");
      const fresh = typeof last === "number" && Date.now() - last <= SWEEP_STALE_MS;
      errorMessage =
        `partial crawl, sweep deferred to the next complete one ` +
        `(last sweep ${typeof last === "number" ? new Date(last).toISOString() : "unknown"}) — ` +
        ingestNote(result);
      if (!fresh) {
        status = "error";
        await alertOnce(
          "sweep-stale",
          `:brain: Notion's deletion sweep has not run for over ` +
            `${SWEEP_STALE_MS / 3_600_000} hours, and this crawl stopped before it had listed ` +
            `everything (${escapeSlack(errorMessage)}). Pages edited in Notion still arrive, ` +
            `but pages deleted there are staying in the corpus.`
        );
      }
    } else if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `notion skipped: ${result.skipped} — ${ingestNote(result)}`;
      await alertOnce(
        `skip:${result.skipped}`,
        `:brain: brain-notion skipped (${escapeSlack(result.skipped)}). Notion is frozen but ` +
          `nothing failed, so this will not look broken.`
      );
    }

    // A PARTIAL WALK IS NOT A SKIP. `sweepMissing` only runs after a walk that
    // finished -- deliberately, so an outage cannot delete the corpus -- which means a
    // permanently incomplete walk silently disables deletion for this source. Branched
    // on nowhere until 2026-09-07; see brain-drive for the run that exposed it.
    // `sweepBlocked ?? complete === false`, not `complete` alone: the two are
    // different questions and keying on the wrong one raised a false alarm within a
    // day. Drive sweeps normally while reporting `complete=false stopped=export-failed`.
    if (!result.skipped && (result.sweepBlocked ?? result.complete === false)) {
      await alertOnce(
        "incomplete",
        `:brain: brain-notion walked only part of Notion (${escapeSlack(ingestNote(result))}). ` +
          `Nothing failed, so this looks healthy -- but the sweep only runs after a ` +
          `complete walk, so pages deleted in Notion are staying in the corpus.`
      );
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    // A dedicated `:brain: brain-notion failed` alert is posted just below; without
    // `slack: false` the generic api_5xx mirror in logger.ts posts a SECOND
    // message for the same failure, which is how one broken run became two pings.
    logger.error({ err, slack: false }, "brain-notion failed");
    await alertOnce(
      "error",
      `:brain: brain-notion failed: ${escapeSlack(errorMessage.slice(0, 300))}`
    );
    // 200 so Vercel does not retry a job that will fail again within the hour.
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-notion", startedAtMs, status, errorMessage);
  }
}
