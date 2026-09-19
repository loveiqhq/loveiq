import { NextResponse } from "next/server";
import { glossaryTerms } from "@/data/glossary-data";
import {
  ingestEvidence,
  researchableConstructs,
  CYCLE_DAYS,
} from "@features/brain/server/ingest/evidence";
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
/** Ten searches at 300ms apart plus one upsert is a few seconds; the ceiling is here for a
 *  slow Europe PMC, and the run's own budget stops well short of it. */
export const maxDuration = 120;

/**
 * GET /api/cron/brain-evidence
 *
 * The published literature behind the constructs we sell.
 *
 * A thirtieth of the glossary a day, so every construct is refreshed monthly — far faster
 * than the literature on one actually moves, and small enough that a run is seconds. The
 * slice is taken from the day of the year, so the rotation needs no cursor and a run that
 * dies loses that day rather than losing its place.
 *
 * 04:20 UTC, off every other job's lane: brain-fast is on the quarter hours, gmail at :11,
 * calendar at :26, notion at :41, drive at :52, clarity at 05:40 and the brief at 06:10.
 */

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging shares this database; without the gate both projects would write the same rows.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-evidence", maxDuration);
  // Well inside the ceiling: the tail (upsert) cannot be interrupted, and a search can
  // take its full 20-second timeout if Europe PMC is unwell.
  const isOutOfTime = () => Date.now() - startedAtMs > 80_000;

  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  /**
   * Days since the epoch, not `getDate()`. A day-of-month index would visit slots 1-31 and
   * never 0, and would repeat the same slots every month in a 30-slot cycle — so a handful
   * of constructs would be refreshed twice and the rest never.
   */
  const dayIndex = Math.floor(now.getTime() / 86_400_000);

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  try {
    const constructs = researchableConstructs(
      glossaryTerms as unknown as Array<Record<string, unknown>>
    );
    const result = await ingestEvidence(constructs, dayIndex, now.toISOString(), isOutOfTime);
    logger.info({ result, dayIndex, cycle: CYCLE_DAYS }, "brain-evidence: done");

    errorMessage =
      `${result.looked} looked at, ${result.written} written, ` +
      `${result.belowFloor} below the evidence floor, ${result.failed} failed`;

    /**
     * ALERT ONLY WHEN THE SOURCE ITSELF IS DOWN, not when the literature is thin.
     *
     * `belowFloor` is a finding, not a fault — it is how "we claim this and nobody has
     * published on it" becomes visible. `failed` is Europe PMC refusing or timing out, and
     * a whole slice failing means the ingest is dead while looking healthy.
     */
    if (result.looked > 0 && result.failed === result.looked) {
      status = "error";
      errorMessage = `every Europe PMC search failed (${result.looked} of ${result.looked})`;
      const key = "brain_evidence_all_failed";
      if (await tryClaimSlackAlert(key, "day", dayKey)) {
        await notifySlack({
          channel: "brain",
          kind: "brain_ingest_failed",
          text:
            `:brain: brain-evidence could not reach Europe PMC — ${escapeSlack(String(result.looked))} ` +
            `searches, all failed. The research cards stop being refreshed, and nothing else ` +
            `about the brain looks wrong while that happens.`,
        });
        await markSlackAlertDelivered(key, "day", dayKey);
      }
    }

    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    // `slack: false` so the generic api_5xx mirror does not post a second message for the
    // same failure — the dedicated alert above is the one to read.
    logger.error({ err, slack: false }, "brain-evidence failed");
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-evidence", startedAtMs, status, errorMessage);
  }
}
