/**
 * GET /api/cron/start-github-jobs
 *
 * Every hour at :41: asks GitHub to start the Actions jobs due this hour
 * (features/cron/server/github-jobs.ts), because GitHub's own schedule starts this
 * repository's jobs hours late and drops some. `workflow_dispatch` starts within seconds.
 *
 * Needs GITHUB_DISPATCH_TOKEN, a fine-grained token for loveiqhq/loveiq with only
 * "Actions: read and write": it can start and stop workflows, and cannot change code or
 * read secrets. A start GitHub refuses (an expired token, a renamed workflow, an input the
 * workflow does not declare) is logged as an error, which reaches #prod-alerts, and the
 * run records `error`.
 *
 * Protected by `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse } from "next/server";
import { jobsDue } from "@features/cron/server/github-jobs";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import logger from "@shared/observability/logger";
import { recordCronRun, verifyCronAuth } from "@shared/observability/slack-alert-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REPO = "loveiqhq/loveiq";

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // The staging project runs the same crons; one clock is enough.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startMs = Date.now();
  const jobs = jobsDue(new Date(startMs));
  const failed: string[] = [];
  let started = 0;
  try {
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    if (!token) failed.push("GITHUB_DISPATCH_TOKEN is not set");
    for (const job of token ? jobs : []) {
      try {
        const res = await fetchWithTimeout(
          `https://api.github.com/repos/${REPO}/actions/workflows/${job.workflow}/dispatches`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ ref: "main", inputs: job.inputs ?? {} }),
            timeoutMs: 10_000,
          }
        );
        // 204 is the only answer that means a run was created.
        if (res.status === 204) {
          started += 1;
        } else {
          const why = (await res.text().catch(() => "")).slice(0, 160);
          failed.push(`${job.workflow}: ${res.status} ${why}`);
        }
      } catch (err) {
        failed.push(`${job.workflow}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failed.length > 0) {
      logger.error(
        { cron: "start-github-jobs" },
        `start-github-jobs: GitHub did not start ${failed.length} job(s): ${failed.join("; ")}`
      );
    }
    return NextResponse.json({
      started,
      jobs: jobs.map((j) => j.workflow),
      failed,
    });
  } finally {
    await recordCronRun(
      "start-github-jobs",
      startMs,
      failed.length > 0 ? "error" : "success",
      failed.join("; ") || undefined
    );
  }
}
