/**
 * GET /api/cron/brain-notion-reach — daily, before the morning brief.
 *
 * Finds the Notion pages the team links to (in WhatsApp, Slack, email, Drive and
 * Notion itself, plus @-mentions and relations) that Jarvis cannot open, and says so
 * in the brain channel and in a notice when something changed, and on Mondays. See
 * features/brain/server/notion-reach.ts for why.
 *
 * Its one-line result in `cron_run` is what list_sources shows beside Notion, so a
 * reader asking Jarvis what it can see is told what it cannot.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { checkNotionReach } from "@features/brain/server/notion-reach";
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
import { reportingDay } from "@shared/time/reporting-day";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * 120 with a 60 s budget, like brain-notion: the clock is checked between requests,
 * so one that starts just inside the budget can still cost 35 s (a slow 15 s answer,
 * the capped 5 s wait, a 15 s retry) before the notice and cron_run writes. A run
 * killed at the ceiling leaves no cron_run row at all, so the room is not optional.
 */
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-notion-reach", maxDuration);
  let status: "success" | "error" = "success";
  let detail: string | undefined;
  try {
    const result = await checkNotionReach(
      new Date(startedAtMs),
      () => Date.now() - startedAtMs > 60_000
    );
    detail =
      `${result.summary} · links ${result.linked}, checked ${result.checked}, ` +
      `new ${result.fresh}, fixed ${result.fixed}, unknown ${result.unknown}, ` +
      `not reached ${result.unreached}, in trash ${result.trashed}, ` +
      `visible not yet indexed ${result.visibleNotIndexed}, ` +
      `mention pages ${result.mentionPages}/${result.mentionTotal}`;

    if (result.notice) {
      // The post is what a person sees; the notice is the second sink beside it
      // (notice.ts). One post per finding per day, however often the cron is re-run.
      const day = reportingDay(new Date(startedAtMs));
      // The whole text, not the headline: two fixes of one page each read the same on top.
      const hash = createHash("sha1")
        .update(`${result.notice.headline}\n${result.notice.detail}`)
        .digest("hex")
        .slice(0, 10);
      const key = `brain_notion_reach:${hash}`;
      if (await tryClaimSlackAlert(key, "day", day)) {
        await notifySlack({
          channel: "brain",
          kind: "brain_notion_reach",
          username: "ops_alerts",
          text: `:jigsaw: *${escapeSlack(result.notice.headline)}*\n${escapeSlack(result.notice.detail)}`,
        });
        await markSlackAlertDelivered(key, "day", day);
      }
    }

    // A run that could not do its job, or could not remember what it found, is not a
    // clean bill: it fails, and the error reaches the brain channel, not only this row.
    const failures = [
      result.problem,
      result.noticeFailed ? "the notice could not be written" : null,
    ].filter((f): f is string => Boolean(f));
    if (failures.length) {
      status = "error";
      detail = `${failures.join("; ")} · ${detail}`;
      logger.error({ detail }, `brain notion-reach: ${failures.join("; ")}`);
    }
    return NextResponse.json(
      { ok: status === "success", missing: result.missing, noticed: result.noticed },
      { status: status === "success" ? 200 : 502 }
    );
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain notion-reach failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("brain-notion-reach", startedAtMs, status, detail);
    await checkSlow();
  }
}
