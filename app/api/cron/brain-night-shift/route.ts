import { NextResponse } from "next/server";
import { NIGHT_BUDGET_SEC, runNightShift } from "@features/brain/server/night-shift";
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
// Only ever answers 503 on Vercel; the real ceiling is NIGHT_BUDGET_SEC, in GitHub Actions.
export const maxDuration = 60;

/**
 * GET /api/cron/brain-night-shift
 *
 * Answers the research questions queued with `queue_research`, overnight, on the Team
 * subscription. Runs ONLY in GitHub Actions (`brain-daily.yml`, 00:30 UTC, through
 * scripts/brain-cron.ts): the research agent is the `claude` binary, which Vercel does not
 * have, so without BRAIN_LLM_CLI this refuses rather than pretending to have run.
 *
 * `cron_run` says "error" when the agent itself failed or a usage limit stopped the night.
 * A question answered without a single source is a content failure, not a broken job: it
 * is recorded against the question, the asker is told, and the run stays "success".
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
        error: "BRAIN_LLM_CLI is not set: the Night Shift runs in GitHub Actions only.",
      },
      { status: 503 }
    );
  }

  const startedAtMs = Date.now();
  // The night's real budget, not the Vercel ceiling: one real question takes minutes, and a
  // 300s budget would post "investigate slowness" on every ordinary night.
  const checkSlow = startCronTimer("brain-night-shift", NIGHT_BUDGET_SEC);
  let status: "success" | "error" = "success";
  let detail: string | undefined;
  try {
    const result = await runNightShift();
    const agentFailed = result.error !== null;
    status = agentFailed ? "error" : "success";
    detail =
      `queued=${result.queued} answered=${result.answered} failed=${result.failed}` +
      (result.limited ? " stopped=rate_limited" : "") +
      (result.error ? ` error=${result.error.slice(0, 200)}` : "");
    logger.info({ ...result }, "brain-night-shift: done");
    return NextResponse.json({ ok: !agentFailed, ...result }, { status: agentFailed ? 502 : 200 });
  } catch (err) {
    status = "error";
    detail = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-night-shift failed");
    return NextResponse.json({ ok: false, error: "Internal" }, { status: 500 });
  } finally {
    await checkSlow();
    await recordCronRun("brain-night-shift", startedAtMs, status, detail);
  }
}
