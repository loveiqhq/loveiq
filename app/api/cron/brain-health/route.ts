import { NextResponse } from "next/server";
import { RELEVANCE_FLOOR } from "@/app/api/mcp/route";
import { recordNotice } from "@features/brain/server/notice";
import { renderSelfReport, selfReport } from "@features/brain/server/self-report";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/brain-health
 *
 * The brain's weekly report on itself, written as a notice so it reaches Claude on its own
 * (whats_new, the session hook, the "noticed without being asked" block). Runs in GitHub
 * Actions on Mondays (`brain-daily.yml`, job brain-health), straight after the week's test
 * batteries have recorded their results, so the report carries this week's accuracy.
 *
 * The notice leaves out the text of the questions asked: it is stored in the searchable
 * corpus, and `brain_health` lists them live instead. `cron_run` says "error" when the
 * usage log could not be read, because a report without it would be mostly blanks.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  const startedAtMs = Date.now();
  let status: "success" | "error" = "success";
  let detail: string | undefined;
  try {
    const report = await selfReport(7, RELEVANCE_FLOOR, startedAtMs);
    if (!report.now) {
      status = "error";
      detail = "the usage log could not be read, so no report was written";
      return NextResponse.json({ ok: false, error: detail }, { status: 502 });
    }
    const written = await recordNotice({
      // The same headline all day, so a re-run replaces the notice instead of adding one.
      headline: `How the brain did in the week to ${report.until}`,
      detail: renderSelfReport(report, RELEVANCE_FLOOR, {
        withQuestions: false,
        nowMs: startedAtMs,
      }),
      kind: "brain-health",
      evidence: "brain_query and cron_run; the brain_health tool gives the same report live",
    });
    if (!written) {
      status = "error";
      detail = "the notice could not be written";
      return NextResponse.json({ ok: false, error: detail }, { status: 502 });
    }
    detail = `calls=${report.now.calls} searches=${report.now.searches} weak=${report.now.weak} empty=${report.now.empty} failures=${report.now.failures}`;
    return NextResponse.json({ ok: true, until: report.until });
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-health failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await recordCronRun("brain-health", startedAtMs, status, detail);
  }
}
