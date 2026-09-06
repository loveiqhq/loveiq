import { NextResponse } from "next/server";
import { ingestGmail } from "@features/brain/server/ingest/gmail";
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
 * 300, not 60 — the same ceiling `brain-drive` already runs at, for the same reason.
 *
 * At 60 this job was in a DEADLOCK, which the walk detail made visible the moment it
 * was recorded: `stopped=time-budget@mo@loveiq.org:p2:mid-page`. The walk restarts at
 * the first mailbox every run and dies partway down the list, so every mailbox after
 * the cut is never reached — and a thread whose row is stale-version is refetched on
 * EVERY run, because "not current" forces a refetch and a refetch that produces no
 * rows leaves it stale. Those permanent refetches consume the budget that would have
 * carried the walk further. The sweep is what resolves such a row, the sweep needs a
 * complete walk, and the walk cannot complete while it is paying for them: the loop
 * feeds itself.
 *
 * Measured on the 11:11 run: 10 mailboxes, 4,032 threads listed, 156 fetched, 31.9s
 * against a 30s budget. Three of the ten mailboxes have no current-version row at
 * all — the walk has never once reached them.
 */
export const maxDuration = 300;

/**
 * GET /api/cron/brain-gmail
 *
 * Company email, hourly. Investor threads, customer replies, the supplier who said
 * yes — where a startup's decisions and relationships actually live, and the last
 * large source the brain could not see.
 *
 * WHY ITS OWN JOB RATHER THAN THE 15-MINUTE LANE. The first full walk of 2,000
 * threads took 462 seconds. Later runs are far cheaper because Gmail's `historyId`
 * lets an unchanged thread cost one listing entry and no fetch at all — but a
 * mailbox with a burst of new mail can still be slow, and it must not be able to
 * starve drive, slack and the funnel numbers of their clock.
 *
 * It also passes the OIDC token down: Gmail goes through the same Google credential
 * chain as GA4, Search Console and Drive, so in production it authenticates
 * keylessly rather than holding a refresh token that Workspace reauth would kill.
 */

/** Skips that mean "not set up yet", which must never alert. */
// `gmail-walk-in-progress` is deliberate: a multi-run re-walk that is advancing.
// `gmail-walk-incomplete` (no rows written) stays loud — that is the outage shape.
const DELIBERATE_SKIPS = new Set([
  "google-token-unavailable",
  "gmail-nothing-to-index",
  "gmail-walk-in-progress",
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
  const checkSlow = startCronTimer("brain-gmail", maxDuration);
  // Notion's tail (upsert of up to 1,400 rows, touch batches, sweep) runs after
  // this expires and cannot be interrupted, so leave it room.
  /**
   * 220 seconds of FETCHING against a 300s ceiling.
   *
   * The budget only bounds the walk. Everything after it — the upsert, the touch
   * batches, the sweep — cannot be interrupted, and that tail grows with how much
   * the walk fetched. Measured on gmail mid-re-walk: 58.1s total against a 40s
   * budget, so an 18s tail. 80 seconds of margin is four times the worst tail seen,
   * which matters most on the FIRST run to get this far: it has the whole backlog to
   * fetch and is the one run that will actually sweep.
   *
   * A killed run is not a slow run: `ingestGmail` upserts AFTER its loop, so a
   * timeout throws away everything that run fetched. Trading ~25% of the walk per
   * run for never losing a whole one is the right way round.
   */
  const isOutOfTime = () => Date.now() - startedAtMs > 220_000;

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
    result = await ingestGmail(new Date().toISOString(), isOutOfTime, readVercelOidcToken(request));
    logger.info({ result }, "brain-gmail: done");

    /**
     * Record WHY even when nothing is wrong.
     *
     * `gmail-walk-in-progress` is a deliberate skip, so it left `error_message`
     * empty — and a walk that has never once completed looked byte-identical in
     * `cron_run` to a healthy one, for weeks. `status` still says whether to worry;
     * this says what was seen. Overwritten below if the run is a real failure.
     */
    if (result.detail) errorMessage = result.detail;

    if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `gmail skipped: ${result.skipped} — ${result.detail ?? "no detail"}`;
      await alertOnce(
        `skip:${result.skipped}`,
        `:brain: brain-gmail skipped (${escapeSlack(result.skipped)}). Gmail is frozen but ` +
          `nothing failed, so this will not look broken.`
      );
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-gmail failed");
    await alertOnce(
      "error",
      `:brain: brain-gmail failed: ${escapeSlack(errorMessage.slice(0, 300))}`
    );
    // 200 so Vercel does not retry a job that will fail again within the hour.
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-gmail", startedAtMs, status, errorMessage);
  }
}
