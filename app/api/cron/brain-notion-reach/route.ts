/**
 * GET /api/cron/brain-notion-reach — daily, before the morning brief.
 *
 * Finds the Notion pages the team links to (in WhatsApp, Slack, email, Drive and
 * Notion itself, plus @-mentions) that Jarvis cannot open, and says so in a notice
 * when something changed. See features/brain/server/notion-reach.ts for why.
 *
 * Its one-line result in `cron_run` is what list_sources shows beside Notion, so a
 * reader asking Jarvis what it can see is told what it cannot.
 */
import { NextResponse } from "next/server";
import { checkNotionReach } from "@features/brain/server/notion-reach";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  recordCronRun,
  startCronTimer,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

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
      `not reached ${result.unreached}, ` +
      `visible not yet indexed ${result.visibleNotIndexed}, mention pages ${result.mentionPages}`;
    if (result.noticeFailed) {
      // The finding exists and nobody will hear about it: that is a failure, and it
      // must reach a person (the brain channel), not only this row.
      status = "error";
      detail = `the notice could not be written · ${detail}`;
      logger.error(
        { detail },
        "brain notion-reach: found pages Jarvis cannot open but could not record the notice"
      );
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
