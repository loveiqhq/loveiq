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
export const maxDuration = 60;

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

    if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `gmail skipped: ${result.skipped}`;
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
