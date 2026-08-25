import { NextResponse } from "next/server";
import { ingestAnalytics } from "@features/brain/server/ingest/analytics";
import { ingestGa4, ingestSearchConsole } from "@features/brain/server/ingest/google";
import { ingestJira } from "@features/brain/server/ingest/jira";
import type { IngestResult } from "@features/brain/server/ingest/upsert";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { escapeSlack, notifySlack } from "@shared/observability/slack";
import {
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
 * GET /api/cron/brain-ingest
 *
 * Nightly ingest of the parts of the company-brain corpus that do NOT live in
 * git: the funnel numbers, and Jira. The other half — 107 markdown docs and 1,476
 * commit messages — is ingested by `.github/workflows/brain-ingest.yml` on push,
 * because only inside an Action are the files and the history actually on disk.
 *
 * EACH SOURCE FAILS ALONE. They are run in sequence but caught individually, so a
 * Jira outage or a rotated token still leaves the analytics rollup refreshed. A
 * single try/catch around both would have made every ingester only as reliable as
 * the least reliable one.
 *
 * ORDER IS DELIBERATE. Analytics is one RPC against our own database and always
 * finishes, so it goes first. Jira goes last because it is a paginated walk of a
 * third-party API and is the one that can run out of time — anything after it
 * would be starved on a slow night.
 */

/** Leaves ~15s of the 60s budget for the response and the cron bookkeeping. */
const TIME_BUDGET_MS = 45_000;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isProdCronHost()) {
    // Staging shares this Supabase database; without the gate both projects would
    // write the same rows.
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-ingest", maxDuration);
  const isOutOfTime = () => Date.now() - startedAtMs > TIME_BUDGET_MS;

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  const stampedAt = new Date().toISOString();
  const results: IngestResult[] = [];

  const dayKey = stampedAt.slice(0, 10);

  const run = async (name: string, fn: () => Promise<IngestResult>) => {
    try {
      results.push(await fn());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, ingester: name }, "brain-ingest: source failed");
      results.push({ source: name, rows: 0, swept: 0, error: message });
      status = "error";
      errorMessage = errorMessage ? `${errorMessage}; ${message}` : message;

      // A source that quietly stops is the real failure mode here: the brain
      // keeps answering, just from data that is silently months stale, and
      // nobody notices because nothing is broken. Alert once per source per day
      // — an expired Google credential would otherwise page every night.
      //
      // The message deliberately carries the source error verbatim, because for
      // the Google ingesters that text IS the fix (the scope hint names the
      // exact command to re-run).
      if (await tryClaimSlackAlert(`brain_ingest_failed:${name}`, "day", dayKey)) {
        await notifySlack({
          channel: "ops",
          kind: "brain_ingest_failed",
          text: `:brain: Company-brain ingest failed for *${escapeSlack(name)}*. The brain will keep answering from whatever it already has, so this will not look broken.\n> ${escapeSlack(message.slice(0, 500))}`,
        });
      }
    }
  };

  try {
    await run("analytics", () => ingestAnalytics(stampedAt));
    await run("ga4", () => ingestGa4(stampedAt));
    await run("gsc", () => ingestSearchConsole(stampedAt));
    await run("jira", () => ingestJira(stampedAt, isOutOfTime));

    logger.info({ results }, "brain-ingest: done");
    // 200 even when a source failed: the run itself completed and Vercel must not
    // retry it. The failure is visible in `cron_run` and in the response body.
    return NextResponse.json({ ok: status === "success", results });
  } finally {
    await checkSlow();
    await recordCronRun("brain-ingest", startedAtMs, status, errorMessage);
  }
}
