import { NextResponse } from "next/server";
import { BACKFILL_DAYS, ingestGa4 } from "@features/brain/server/ingest/google";
import { readVercelOidcToken } from "@shared/http/google-oauth";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import {
  recordCronRun,
  startCronTimer,
  verifyCronAuth,
} from "@shared/observability/slack-alert-dedup";
import logger from "@shared/observability/logger";

/**
 * GA4's whole history (BACKFILL_DAYS), once: run after a change to what the GA4 day chunks
 * hold (15 Oct 2026: users per channel, Ads campaigns), so earlier days are rewritten the new
 * way. brain-fast takes `?days=` for the same, but only with the cron secret, which Vercel
 * stores hidden: this path lets the platform authorise it instead, with
 * `vercel crons run /api/cron/brain-ga4-backfill`. Scheduled once a year only so the platform
 * knows the path, as journey-backfill is.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Well inside maxDuration: the ingest's tail (upsert, sweep) runs after this and can't stop. */
const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Staging and production share one brain: only production writes it.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-ga4-backfill", maxDuration);
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;
  try {
    const result = await ingestGa4(
      new Date(startedAtMs).toISOString(),
      () => Date.now() - startedAtMs > BUDGET_MS,
      BACKFILL_DAYS,
      // The identity token is a request header, read here and handed down (see brain-fast).
      readVercelOidcToken(request)
    );
    if (result.skipped) {
      status = "error";
      errorMessage = result.skipped;
    }
    return NextResponse.json(result, { status: result.skipped ? 503 : 200 });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "brain-ga4-backfill failed");
    return NextResponse.json({ error: "Backfill failed." }, { status: 500 });
  } finally {
    await checkSlow();
    await recordCronRun("brain-ga4-backfill", startedAtMs, status, errorMessage);
  }
}
