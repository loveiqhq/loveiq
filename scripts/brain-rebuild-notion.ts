/**
 * Re-read every Notion page and rewrite its chunks, in as many passes as it takes.
 *
 * WHEN YOU NEED THIS. The nightly ingest is incremental: it skips any page whose
 * `last_edited_time` and `BUILDER_VERSION` both match what is already indexed, and
 * only re-reads the rest. That is what keeps 1,000+ pages inside a 45-second cron —
 * a page's content costs ~1.9s, because Notion paginates nested block children and
 * rate-limits to roughly 3 requests a second.
 *
 * The consequence is that BUMPING `BUILDER_VERSION` marks every page stale at once,
 * and the nightly job would then need ~45 nights to work through them at ~24 a
 * night. Nothing is lost while it converges — every page is either rewritten or
 * confirmed, so the sweep stays safe and stale rows keep their old content — but
 * the new shape does not actually arrive until it finishes.
 *
 * So: bump the version, deploy, then run this once. Measured on the real workspace,
 * 1,062 pages converge in 4 passes.
 *
 *   npm run brain:rebuild-notion
 *   BUDGET_MS=120000 npm run brain:rebuild-notion   # shorter passes
 *
 * Safe to interrupt and safe to re-run: an interrupted pass leaves every page
 * either rewritten or confirmed, and a completed corpus makes this a no-op that
 * touches everything and fetches nothing.
 */

import { ingestNotion } from "@features/brain/server/ingest/notion";

const MAX_PASSES = 12;

async function main() {
  const budgetMs = Number(process.env.BUDGET_MS ?? 540_000);
  console.log(`rebuilding Notion, up to ${MAX_PASSES} passes of ${Math.round(budgetMs / 1000)}s\n`);

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const startedAt = Date.now();
    const res = await ingestNotion(
      new Date().toISOString(),
      () => Date.now() - startedAt > budgetMs
    );
    const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`  pass ${pass}: ${JSON.stringify(res)}  ${secs}s`);

    if (res.skipped) {
      console.log(`\n  stopped: ${res.skipped}. Nothing was written and the sweep did not run.`);
      process.exitCode = 1;
      return;
    }
    // `complete` is not part of the result, so convergence is checked directly:
    // every chunk carrying the current builder version means nothing is left to
    // rebuild. Checked from pass 1, so running this on a finished corpus costs one
    // pass rather than two. (`res.swept >= 0` was in an earlier version of this
    // condition and is always true — a clause that reads as a check and is not.)
    if (res.rows > 0 && (await noFetchesLeft())) {
      console.log(`\n  converged after ${pass} pass(es).`);
      return;
    }
  }
  console.log(`\n  hit the ${MAX_PASSES}-pass ceiling. Re-run to continue — progress is kept.`);
}

/**
 * True when every indexed Notion chunk carries the CURRENT builder version, which
 * is the only reliable "nothing left to rebuild" signal available from outside the
 * ingester.
 */
async function noFetchesLeft(): Promise<boolean> {
  const { supabaseFetch } = await import("@features/admin/server/supabase");
  const { BUILDER_VERSION } = await import("@features/brain/server/ingest/notion");
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=id&source=eq.notion&meta->>v=neq.${BUILDER_VERSION}&limit=1`,
    { headers: { Prefer: "count=exact", Range: "0-0" } }
  );
  if (!res.ok) return false;
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? "1");
  if (total > 0) console.log(`      ${total} chunk(s) still on an older shape`);
  return total === 0;
}

void main();
