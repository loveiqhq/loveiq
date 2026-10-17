/**
 * Fill `brain_chunk.exact_terms` on the rows written before the column existed.
 *
 * WHY. The column's trigger fills it on every insert and on every change of title or body
 * (supabase/migrations/20261017120000_brain_chunk_exact_terms.sql), so only the rows
 * stored before the migration lack it, and find_text cannot see a text buried in their
 * links, addresses and file names until they have it.
 *
 * HOW. One call of `brain_backfill_exact_terms` per 1,000 rows, in id order, with a pause
 * between calls. Its UPDATE sets exact_terms only, and only where it differs: title, body,
 * updated_at and the embedding are never written, so the embedding trigger keeps every
 * vector and the source sweeps see nothing change. It waits at most 2 seconds for a row an
 * ingester holds; a failed batch is tried again, and after three failures the run stops
 * and prints where to resume.
 *
 * RUN IT WHILE NO INGEST JOB IS WRITING: no `cron_run` row started in the last two minutes
 * and none due in the next three (vercel.json, features/cron/server/github-jobs.ts). A batch
 * and an ingest upsert that lock the same rows in opposite orders can deadlock, and Postgres
 * may cancel the ingest's write instead of the batch (8 of 24 overlapping runs, #605 review).
 *
 * Safe to stop and re-run: a batch that is already filled writes nothing.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/brain-backfill-exact-terms.ts
 *   npx tsx --env-file-if-exists=.env.local scripts/brain-backfill-exact-terms.ts --after=123456
 *
 * Writes to whatever SUPABASE_URL points at, which it prints first.
 */
import { supabaseFetch } from "@features/admin/server/supabase";

const BATCH = 1000;
const PAUSE_MS = 500;
const ATTEMPTS = 3;

type Batch = { last_id: number | null; scanned: number; written: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One batch, tried up to three times; why it failed when it never succeeded. */
async function fill(after: number): Promise<Batch | string> {
  let why = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(PAUSE_MS * 4 * attempt);
    const res = await supabaseFetch("/rest/v1/rpc/brain_backfill_exact_terms", {
      method: "POST",
      body: JSON.stringify({ p_after: after, p_limit: BATCH }),
      timeoutMs: 30_000,
      breaker: "supabase-backfill",
    }).catch((err: unknown) => String(err));
    if (typeof res !== "string" && res.ok) {
      const [row] = (await res.json()) as Batch[];
      if (row) return row;
      why = "the call returned no row";
    } else {
      why =
        typeof res === "string"
          ? res
          : `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
    }
    console.error(`  the batch after id ${after} failed (attempt ${attempt}): ${why}`);
  }
  return why;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--after="));
  let after = arg ? Number(arg.slice("--after=".length)) : 0;
  if (!Number.isSafeInteger(after) || after < 0) {
    console.error(`  --after must be a row id, got "${arg}"`);
    process.exitCode = 1;
    return;
  }
  console.log(`  filling exact_terms on ${process.env.SUPABASE_URL ?? "(SUPABASE_URL unset)"}`);

  let scanned = 0;
  let written = 0;
  const started = Date.now();
  for (;;) {
    const t0 = Date.now();
    const batch = await fill(after);
    if (typeof batch === "string") {
      console.error(`  stopped. Resume with --after=${after}`);
      process.exitCode = 1;
      return;
    }
    if (batch.last_id === null) break;
    console.log(
      `  after=${batch.last_id}  ${batch.written} of ${batch.scanned} written  ${Date.now() - t0} ms`
    );
    after = batch.last_id;
    scanned += batch.scanned;
    written += batch.written;
    await sleep(PAUSE_MS);
  }
  const secs = Math.round((Date.now() - started) / 1000);
  console.log(`\n  done: ${written} of ${scanned} rows written in ${secs} s`);
}

void main();
