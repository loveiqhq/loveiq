import { NextResponse } from "next/server";
import { ingestClarity } from "@features/brain/server/ingest/clarity";
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
/** One HTTP request and one upsert. 60 is already generous; the vendor call is capped
 *  at 30s inside the ingest, so a hung Clarity cannot reach this ceiling. */
export const maxDuration = 60;

/**
 * GET /api/cron/brain-clarity
 *
 * The only thing we have that measures FRUSTRATION rather than volume.
 *
 * ONCE A DAY, AND THAT IS A HARD CONSTRAINT, not a preference. Clarity's export API
 * allows ten requests per project per day and cannot be raised by paying, because
 * Clarity has no paid tier. This job spends exactly one of the ten and leaves nine for
 * a person who needs to look at something directly. Running it hourly would spend the
 * budget by mid-morning and return 429 for the rest of the day, which is the failure
 * the decision miner already hit against Gemini's daily cap.
 *
 * 05:40 UTC: after midnight in every timezone we sell to, so the three-day window is as
 * settled as it will get, and off the :07/:22/:37/:52 lanes the brain-fast ingest uses.
 */

/** Skips that mean "not configured", which must never wake anyone. */
const DELIBERATE_SKIPS = new Set([
  // No token is the unconfigured state, not a fault. The tag still records into Clarity;
  // only the automatic read-back is off, and the dashboard still works.
  "no_token",
  // The ten were spent by a person pulling data by hand. Tomorrow's run gets a fresh
  // budget and the window it reads is three days wide, so nothing is actually lost.
  "daily_cap",
]);

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging shares this database; without the gate both projects would write — and
  // would also spend two of the ten daily requests instead of one.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-clarity", maxDuration);
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  /**
   * YESTERDAY, not today. The API returns the last three days INCLUDING a partial
   * today, and dating a partial window as if it were complete is how a half-counted
   * figure gets quoted as a whole one.
   */
  const windowEnd = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  try {
    const result = await ingestClarity(windowEnd, now.toISOString());
    logger.info({ result }, "brain-clarity: done");

    if (!result.ok && !DELIBERATE_SKIPS.has(result.reason ?? "")) {
      status = "error";
      errorMessage = `clarity export failed: ${result.reason}`;
      const key = `brain_clarity_failed:${result.reason}`;
      if (await tryClaimSlackAlert(key, "day", dayKey)) {
        await notifySlack({
          channel: "brain",
          kind: "brain_ingest_failed",
          text:
            `:brain: brain-clarity could not read the export API (${escapeSlack(result.reason ?? "unknown")}). ` +
            `Clarity itself keeps recording, so nothing is lost — but the brain stops being able to ` +
            `answer where the site frustrates people, and it will not look broken.`,
        });
        await markSlackAlertDelivered(key, "day", dayKey);
      }
    } else if (!result.ok) {
      errorMessage = `skipped: ${result.reason}`;
    } else {
      errorMessage = `${result.pages} pages with a signal, ${result.rows} row(s) written`;
    }

    return NextResponse.json({ ok: result.ok, result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    // `slack: false` so the generic api_5xx mirror does not post a second message for
    // the same failure — the dedicated alert above is the one to read.
    logger.error({ err, slack: false }, "brain-clarity failed");
    // 200 so Vercel does not retry: a retry would spend another of the ten.
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-clarity", startedAtMs, status, errorMessage);
  }
}
