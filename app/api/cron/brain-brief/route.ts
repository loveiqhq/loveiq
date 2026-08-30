import { NextResponse } from "next/server";
import { buildDailyBrief } from "@features/brain/server/brief";
import { sourceBlocks, toSlackMrkdwn, type BrainSource } from "@features/brain/server/answer";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { notifySlack } from "@shared/observability/slack";
import { context, fitBlocks, section } from "@shared/observability/slack-blocks";
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
 * GET /api/cron/brain-brief
 *
 * The one job here that PUSHES instead of waiting to be asked.
 *
 * Runs at 06:10 UTC, after the nightly Search Console ingest at 04:47 and before
 * the funnel numbers at 09:00, so the morning reads: what happened, then how it did.
 *
 * Deliberately not another numbers digest — `conversion-digest` already posts the
 * funnel and `anomaly-watcher` already watches for moves. This covers what is
 * WRITTEN rather than counted: a decision in Notion, an argument in email, a
 * commit, something a customer said on a call.
 *
 * SILENCE IS THE POINT. `buildDailyBrief` returns null on a routine day and this
 * posts nothing at all. A brief that finds something every day is one nobody reads
 * by the second week, so a quiet channel is the feature working, not failing.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging and production share one database and one Slack workspace.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-brief", maxDuration);
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  // Yesterday in UTC: the last day whose sources are all in, and the same day
  // boundary every ingester stamps `period_end` with.
  const day = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  try {
    // One brief per day even if the cron is retried or fires twice.
    if (!(await tryClaimSlackAlert("brain_brief", "day", day))) {
      return NextResponse.json({ ok: true, day, sent: false, reason: "already-sent" });
    }

    const brief = await buildDailyBrief(day);
    if (!brief) {
      // Claim stays held: a routine day is decided once, not re-litigated.
      await markSlackAlertDelivered("brain_brief", "day", day);
      return NextResponse.json({ ok: true, day, sent: false, reason: "nothing-notable" });
    }

    const sources: BrainSource[] = brief.chunks.map((c, i) => ({
      n: i + 1,
      source: c.source,
      title: c.title,
      url: c.url,
    }));
    const body = `*What the brain noticed on ${day}*\n\n${toSlackMrkdwn(brief.text)}`;
    const blocks = [
      section(body),
      ...sourceBlocks(sources),
      context("Nobody asked for this. The brain reads what the company wrote each day and speaks up when something looks worth knowing."),
    ];
    const fitted = fitBlocks(blocks, body);

    await notifySlack({
      channel: "ops",
      kind: "brain_brief",
      text: body,
      blocks: fitted.blocks,
      username: "ops_alerts",
    });
    await markSlackAlertDelivered("brain_brief", "day", day);

    logger.info({ day, sources: sources.length }, "brain-brief: posted");
    return NextResponse.json({ ok: true, day, sent: true, sources: sources.length });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, day }, "brain-brief failed");
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  } finally {
    await checkSlow();
    await recordCronRun("brain-brief", startedAtMs, status, errorMessage);
  }
}
