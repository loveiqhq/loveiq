import { NextResponse } from "next/server";
import { ingestNotion } from "@features/brain/server/ingest/notion";
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
  const isOutOfTime = () => Date.now() - startedAtMs > 40_000;

  const dayKey = new Date().toISOString().slice(0, 10);
  const alertOnce = async (name: string, text: string) => {
    const key = `brain_notion_failed:${name}`;
    if (!(await tryClaimSlackAlert(key, "day", dayKey))) return;
    await notifySlack({ channel: "ops", kind: "brain_ingest_failed", text });
    await markSlackAlertDelivered(key, "day", dayKey);
  };

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  let result;

  try {
    result = await ingestNotion(new Date().toISOString(), isOutOfTime);
    logger.info({ result }, "brain-notion: done");

    if (result.skipped && !DELIBERATE_SKIPS.has(result.skipped)) {
      status = "error";
      errorMessage = `notion skipped: ${result.skipped}`;
      await alertOnce(
        `skip:${result.skipped}`,
        `:brain: brain-notion skipped (${escapeSlack(result.skipped)}). Notion is frozen but ` +
          `nothing failed, so this will not look broken.`
      );
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-notion failed");
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
