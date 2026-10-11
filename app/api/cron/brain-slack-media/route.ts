import { NextResponse } from "next/server";
import { describeSlackMedia, MEDIA_JOB_SEC } from "@features/brain/server/ingest/slack-media";
import { cliBinary } from "@features/brain/server/llm";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  recordCronRun,
  startCronTimer,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Only ever answers 503 on Vercel; the real ceiling is MEDIA_JOB_SEC, in GitHub Actions.
export const maxDuration = 60;

/**
 * GET /api/cron/brain-slack-media
 *
 * Describes the screenshots and screen recordings shared in the Slack channels the brain
 * indexes, so a question about a reported bug finds what the picture showed
 * (features/brain/server/ingest/slack-media.ts). Runs ONLY in GitHub Actions
 * (`brain-daily.yml`, every six hours, through scripts/brain-cron.ts): the model is the
 * `claude` binary and the frames come from ffmpeg, neither of which Vercel has, so without
 * BRAIN_LLM_CLI this refuses rather than pretending to have run.
 *
 * `cron_run` says "error" when something stopped the run: Slack refusing the listing or a
 * download, a usage limit on the seat, or the model failing three times in a row. A single
 * file that could not be described is counted, tried again next run, and is not an error.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }
  if (!cliBinary()) {
    return NextResponse.json(
      {
        ok: false,
        error: "BRAIN_LLM_CLI is not set: Slack screenshots are described in GitHub Actions only.",
      },
      { status: 503 }
    );
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-slack-media", MEDIA_JOB_SEC);
  let status: "success" | "error" = "success";
  let detail: string | undefined;
  try {
    const result = await describeSlackMedia();
    const stopped = result.error !== null;
    if (stopped) status = "error";
    // Counts only: this is printed to a public Actions log.
    detail =
      `waiting=${result.waiting} described=${result.described} skipped=${result.skipped} failed=${result.failed}` +
      (result.limited ? " stopped=rate_limited" : "") +
      (result.error ? ` error=${result.error.slice(0, 200)}` : "");
    return NextResponse.json({ ok: !stopped, ...result }, { status: stopped ? 502 : 200 });
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-slack-media failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await checkSlow();
    await recordCronRun("brain-slack-media", startedAtMs, status, detail);
  }
}
