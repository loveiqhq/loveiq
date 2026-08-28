/**
 * One-off: fill GA4 and Search Console back to their API limits.
 *
 * WHY THIS IS A SCRIPT AND NOT THE CRON. The nightly job deliberately reads only
 * the last 10 days and confirms everything older with a touch, because the Search
 * Console `date x query` report is one row per query per day and over 16 months
 * that is tens of thousands of rows against a 15-second paging budget. A
 * truncated report is not an error, so widening the nightly window would quietly
 * lose the query breakdown for arbitrary days.
 *
 * Depth therefore comes from here, once, with no time limit — and then persists,
 * because every subsequent nightly run touches what it does not rewrite.
 *
 * Run it again whenever the chunk SHAPE changes, or after a long outage.
 *
 *   npm run brain:backfill-google
 *   npm run brain:backfill-google -- 200      # a shallower window
 */

import {
  BACKFILL_DAYS,
  ingestGa4,
  ingestSearchConsole,
} from "@features/brain/server/ingest/google";

async function main() {
  const days = Number(process.argv[2]) || BACKFILL_DAYS;
  const budgetMs = Number(process.env.BACKFILL_BUDGET_MS ?? 600_000);
  const startedAt = Date.now();
  const isOutOfTime = () => Date.now() - startedAt > budgetMs;
  const stampedAt = new Date().toISOString();

  console.log(`backfilling ${days} days (budget ${Math.round(budgetMs / 1000)}s)\n`);

  for (const [label, run] of [
    ["ga4", () => ingestGa4(stampedAt, isOutOfTime, days)],
    ["gsc", () => ingestSearchConsole(stampedAt, isOutOfTime, days)],
  ] as const) {
    const at = Date.now();
    try {
      const res = await run();
      console.log(
        `  ${label.padEnd(4)} ${JSON.stringify(res)}  ${((Date.now() - at) / 1000).toFixed(0)}s`
      );
      if (res.skipped) {
        console.log(
          `  ${label.padEnd(4)} SKIPPED (${res.skipped}) — nothing was written, and the sweep did not run.`
        );
      }
    } catch (err) {
      // One source failing must not stop the other, and must not look like success.
      console.error(
        `  ${label.padEnd(4)} FAILED: ${err instanceof Error ? err.message : String(err)}`
      );
      process.exitCode = 1;
    }
  }
}

void main();
