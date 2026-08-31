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

import { EMBED_BATCH, embedText, toVectorLiteral } from "@features/brain/server/embed";

const READ = 100;

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
    const rate = done / Math.max(1, (Date.now() - startedAt) / 60_000);
    console.log(`  ${done} re-embedded (${Math.round(rate)}/min), cursor ${after}`);
  }
  console.log(`done: ${done} chunks re-embedded with the full ${2400}-character window`);
}

void main();
