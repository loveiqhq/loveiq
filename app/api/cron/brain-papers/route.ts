import { NextResponse } from "next/server";
import { glossaryTerms } from "@/data/glossary-data";
import { researchableConstructs } from "@features/brain/server/ingest/evidence";
import { ingestPapers, MAX_PAPERS_PER_RUN } from "@features/brain/server/ingest/papers";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A dozen papers at up to 20 s a fetch is the worst case; the run's clock stops at 80 s. */
export const maxDuration = 120;

/**
 * GET /api/cron/brain-papers
 *
 * The full text of open-access papers (CC BY and CC0 only) behind today's slice of
 * constructs, the same thirtieth of the glossary that brain-evidence looks at, so a month
 * covers them all. Up to MAX_PAPERS_PER_RUN new papers a run, written one paper at a time.
 *
 * 04:50 UTC, after brain-evidence at 04:20 and clear of every other lane: brain-fast is on
 * the quarter hours, gmail at :11, calendar at :26, notion at :41 and drive at :52.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  // Only production writes the brain; a staging build must not run the same job.
  if (!isProdCronHost()) {
    return NextResponse.json({ skipped: true, reason: "non-prod-cron-host" });
  }

  const startedAtMs = Date.now();
  const checkSlow = startCronTimer("brain-papers", maxDuration);
  // Checked before each paper: its fetch (up to 20 s) and write cannot be interrupted once
  // started, and they need the 40 s the budget test reserves.
  const isOutOfTime = () => Date.now() - startedAtMs > 80_000;
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const dayIndex = Math.floor(now.getTime() / 86_400_000);

  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  const alert = async (key: string, text: string) => {
    if (await tryClaimSlackAlert(key, "day", dayKey)) {
      await notifySlack({ channel: "brain", kind: "brain_ingest_failed", text });
      await markSlackAlertDelivered(key, "day", dayKey);
    }
  };

  try {
    const constructs = researchableConstructs(
      glossaryTerms as unknown as Array<Record<string, unknown>>
    );
    const result = await ingestPapers(constructs, dayIndex, now.toISOString(), isOutOfTime);
    logger.info({ result, dayIndex }, "brain-papers: done");
    const s = result.skipped;
    errorMessage =
      `${result.written} of up to ${MAX_PAPERS_PER_RUN} papers written (${result.parts} parts) ` +
      `from ${result.searches} of ${result.constructs} constructs searched; skipped ` +
      `${s.stored} already stored, ${s.license} on the license, ${s.noText} with no full ` +
      `text, ${s.tooLong} too long, ${s.unread} unreadable, ${s.withheld} withheld for a ` +
      `credential; ${result.failedSearches} ` +
      `searches failed`;

    // Thin open literature is a finding; every search failing is Europe PMC being down.
    if (result.searches > 0 && result.failedSearches === result.searches) {
      status = "error";
      errorMessage = `every Europe PMC search failed (${result.searches} of ${result.searches})`;
      await alert(
        "brain_papers_all_failed",
        `:brain: brain-papers could not reach Europe PMC: ${escapeSlack(String(result.searches))} ` +
          `searches, all failed. No research papers are being added until it can.`
      );
    }
    return NextResponse.json({ ok: status === "success", result });
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, slack: false }, "brain-papers failed");
    await alert(
      "brain_papers_threw",
      `:brain: brain-papers stopped with an error: ${escapeSlack(errorMessage.slice(0, 300))}. ` +
        `No research papers are being added until it runs clean.`
    );
    return NextResponse.json({ ok: false, error: "Ingest failed." });
  } finally {
    await checkSlow();
    await recordCronRun("brain-papers", startedAtMs, status, errorMessage);
  }
}
