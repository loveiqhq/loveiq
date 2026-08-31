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
// 120s so a 100s model call fits with room for the corpus read. Daily job, one
// invocation, so the extra ceiling costs nothing.
export const maxDuration = 120;

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

  /**
   * Yesterday in UTC by default: the last day whose sources are all in, and the same
   * day boundary every ingester stamps `period_end` with.
   *
   * `?day=YYYY-MM-DD` overrides it, because a day this job FAILS is otherwise lost
   * forever -- the schedule only ever asks for yesterday, so nothing retries it. That
   * happened on the very first run: 2026-08-31 06:11 died on a 45s model timeout and
   * 2026-08-30's brief was simply never posted.
   *
   * Requires the same cron bearer as everything else here, and refuses future dates.
   * The per-day claim below still applies, so a replay cannot double-post.
   */
  const requested = new URL(request.url).searchParams.get("day");
  const today = new Date().toISOString().slice(0, 10);
  /**
   * Round-tripped through Date, not just shape-matched. `1999-13-45` satisfies
   * /^\d{4}-\d{2}-\d{2}$/ and sorts before today, so a regex plus an ordering check
   * accepted a month 13 and a day 45 -- caught by widening this route's own test.
   */
  const isRealDate = (d: string) => {
    const parsed = new Date(`${d}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d;
  };
  const validDay = Boolean(requested) && isRealDate(requested!) && requested! < today;
  const day = validDay ? requested! : new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

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
      context(
        "Nobody asked for this. The brain reads what the company wrote each day and speaks up when something looks worth knowing."
      ),
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
