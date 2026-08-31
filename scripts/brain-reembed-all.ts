/**
 * Recompute EVERY embedding after a change to how text is prepared.
 *
 * `embedMissing` only ever looks at rows where `embedding IS NULL`, which is right
 * for keeping up but useless after the embedding INPUT changes: every existing row
 * still holds a vector, so nothing is reconsidered. When `embedText` widened from
 * 1,500 to 2,400 characters, 24,800 rows kept vectors that describe only the first
 * half of their own text.
 *
 * This overwrites in place rather than nulling first, so semantic search never has a
 * window where rows are missing vectors. Safe to stop and re-run: pass the id it
 * last printed as the starting cursor.
 *
 *   npx tsx scripts/brain-reembed-all.ts [afterId]
 */

import { writeFileSync } from "node:fs";

import { EMBED_BATCH, embedText, toVectorLiteral } from "@features/brain/server/embed";

const READ = 100;

/**
 * PER-INVOCATION CAP, and the pause between pages.
 *
 * This loop used to run until it hit an error, which under launchd meant essentially
 * continuously. `embedding` carries an HNSW index, so every re-embed rewrites an
 * index entry -- among the most expensive writes Postgres makes -- and it was
 * measured at ~180/min. That was a material share of the Disk IO exhaustion Supabase
 * warned about on 2026-08-31, on the database that also serves the survey, the
 * reports and checkout.
 *
 * A backfill that improves semantic recall on older chunks is worth doing, and worth
 * doing slowly. The cursor is persisted per page, so stopping early is free.
 */
const MAX_PER_RUN = Number(process.env.REEMBED_MAX ?? 500);
const PAGE_PAUSE_MS = Number(process.env.REEMBED_PAUSE_MS ?? 2_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const { supabaseFetch } = await import("@features/admin/server/supabase");
  let after = Number(process.argv[2] ?? 0);
  let done = 0;
  const startedAt = Date.now();

  for (;;) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=id,title,body&id=gt.${after}&order=id.asc&limit=${READ}`
    );
    if (!res.ok) {
      console.error(`read failed (${res.status}) — re-run with cursor ${after}`);
      process.exitCode = 1;
      return;
    }
    const rows = (await res.json().catch(() => [])) as Array<{
      id: number;
      title: string | null;
      body: string;
    }>;
    if (rows.length === 0) break;

    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      const slice = rows.slice(i, i + EMBED_BATCH);
      const { embedBatchForTest } = await import("@features/brain/server/embed");
      const vectors = await embedBatchForTest(slice.map((r) => embedText(r.title, r.body)));
      if (!vectors || vectors.length !== slice.length) {
        console.error(`embed failed near id ${slice[0]!.id} — re-run with cursor ${after}`);
        process.exitCode = 1;
        return;
      }
      const write = await supabaseFetch("/rest/v1/rpc/brain_set_embeddings", {
        method: "POST",
        body: JSON.stringify({
          ids: slice.map((r) => r.id),
          vecs: vectors.map((v) => toVectorLiteral(v)),
        }),
      });
      if (!write.ok) {
        console.error(`write failed (${write.status}) — re-run with cursor ${after}`);
        process.exitCode = 1;
        return;
      }
      done += slice.length;
    }

    after = rows[rows.length - 1]!.id;
    /**
     * Persist the cursor after every batch, not just at the end.
     *
     * stdout is block-buffered when this is run by launchd, so the log stays empty
     * for as long as the process lives — which makes a job that IS working look
     * identical to one that is stuck. The cursor file is the progress signal, and
     * it is also what makes a killed run resume instead of restarting.
     */
    if (process.env.REEMBED_CURSOR_FILE) {
      try {
        writeFileSync(process.env.REEMBED_CURSOR_FILE, String(after));
      } catch {
        /* progress reporting must never fail the work */
      }
    }
    // Checked AFTER the cursor is persisted, so pausing never re-does a finished page.
    if (done >= MAX_PER_RUN) {
      console.log(`paused at the per-run cap (${done}), cursor ${after}`);
      break;
    }
    if (PAGE_PAUSE_MS > 0) await sleep(PAGE_PAUSE_MS);
    const rate = done / Math.max(1, (Date.now() - startedAt) / 60_000);
    console.log(`  ${done} re-embedded (${Math.round(rate)}/min), cursor ${after}`);
  }
  console.log(`done: ${done} chunks re-embedded with the full ${2400}-character window`);
}

void main();
