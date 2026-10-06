import { supabaseFetch } from "@features/admin/server/supabase";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";
import logger from "@shared/observability/logger";

/**
 * Vector embeddings for the corpus.
 *
 * Lexical search can only match words that are actually present. Ask "why are
 * people dropping at checkout" and `tsvector` finds documents containing those
 * words — not the one about "cart abandonment" or "friction in the payment step",
 * which is the document you wanted. That gap is the ceiling on answer quality, and
 * embeddings are what remove it.
 *
 * Computed IN Supabase by the `brain-embed` edge function, which runs `gte-small`
 * from the edge runtime: 384 dimensions, no API key, no per-token bill, no rate
 * limit — and no third party ever sees the corpus. That last point is not
 * incidental: the brain holds revenue, ad spend, every internal document and the
 * company's email.
 */

/**
 * Texts per edge-function call.
 *
 * Measured against REALISTIC text, which turned out to be the point: 8 chunks of
 * 1,500 characters succeed, while 25 of them answer WORKER_RESOURCE_LIMIT. An
 * earlier measurement using short synthetic sentences suggested 10 was safe and was
 * misleading — the limit is total text volume, not item count.
 */
/**
 * Three, not eight — because the TEXT per item got longer (see `embedText`).
 *
 * MEASURED, and it disproved the obvious guess. The intuition was that the edge
 * worker cares about bytes per REQUEST, so 5 x 2400 (12,031 B) should behave like
 * 8 x 1500 (12,043 B). It does not: at the same payload size, 8 x 1500 succeeded 2/3
 * while 5 x 2400 succeeded 0/3. The cost is per-TEXT length, not total bytes —
 * transformer attention is quadratic in sequence length, so one long text costs far
 * more than two short ones of the same total size.
 *
 * Sweeping at full 2,400-char length: 4 -> 3/4, 3 -> 3/4, 2 -> 4/4. Three is the
 * balance; `embedBatch` already retries six times with backoff on 546, which covers
 * the rest.
 */
export const EMBED_BATCH = 3;

/**
 * Embed the WHOLE chunk, not the first 1,500 characters of it.
 *
 * Chunks are built up to BODY_LIMIT (2,400), but this sliced at 1,500 — so the tail
 * of every long chunk was invisible to semantic search. Measured on the live corpus:
 * **17,859 of 25,015 chunks (71%) were longer than the window, and 12.1 million
 * characters — roughly a third of everything the brain holds — could not be matched
 * by meaning at all.**
 *
 * 1,500 looks like a guess at the model's token limit. It is not one: embedding the
 * same text truncated at 1000/1500/1800/2000/2400 characters produces vectors that
 * keep MOVING all the way out (cosine against the 1000-char version: 0.9891, 0.9894,
 * 0.9862, 0.9577), so `gte-small` is demonstrably reading past 1,500 and the slice
 * was simply throwing that text away.
 *
 * Matched to BODY_LIMIT so the unit of chunking and the unit of embedding are the
 * same thing — which is the property that stops this drifting apart again.
 */
export const EMBED_CHARS = 2400;

/** Rows fetched per pass. Larger than EMBED_BATCH so one database read feeds
 *  several embedding calls and one write puts them all back. */
const READ_BATCH = 100;

/** How much of a chunk is embedded. `gte-small` truncates past ~512 tokens, so
 *  sending more costs time and changes nothing. The title leads because it carries
 *  the most distinguishing words. */
export function embedText(title: string | null, body: string): string {
  return `${title ?? ""}\n${body}`.slice(0, EMBED_CHARS);
}

/** Postgres reads a vector literal as `[0.1,0.2,…]`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((n) => (Number.isFinite(n) ? n.toFixed(6) : "0")).join(",")}]`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(
  texts: string[],
  opts: { attempts?: number; timeoutMs?: number; isOutOfTime?: () => boolean } = {}
): Promise<number[][] | null> {
  // The BACKFILL wants persistence -- losing a batch means those chunks stay
  // unsearchable. A QUESTION wants to fail fast: it sits in front of a person
  // waiting for an answer, and lexical search is a perfectly good fallback. Same
  // call, different patience, so the caller sets it.
  //
  // Patience is attempts, not one long wait. Under load the edge can leave a call hanging
  // with no answer at all (2026-09-28, loading the books): at 120 s a call, the backfill sat
  // on 1,478 waiting rows for twelve minutes and embedded none. At 30 s the same queue drained
  // while a cold worker still gets eight tries, about five minutes, to load its model.
  const attempts = Math.max(1, opts.attempts ?? 8);
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  /**
   * WORKER_RESOURCE_LIMIT IS TRANSIENT, NOT A SIZE ERROR.
   *
   * The edge worker loads a ~130MB model on cold start; back-to-back calls arrive
   * before it is ready and the runtime refuses them. It reads exactly like "your
   * batch is too big", which sent me shrinking batches that were never the problem
   * — the same eight chunks succeed when spaced out and fail when hurried.
   *
   * So: back off and retry rather than shrink. Giving up loses the batch entirely.
   */
  for (let attempt = 0; attempt < attempts; attempt++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${url}/functions/v1/brain-embed`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
        timeoutMs,
      });
    } catch (err) {
      // A timeout or a dropped connection THROWS rather than returning a status, so it was
      // never retried: the hourly job exited on its first try, and brain-fast threw away
      // the vectors it had already made for that read. Same patience as a 503.
      if (attempt === attempts - 1 || opts.isOutOfTime?.()) {
        logger.warn({ err, attempt }, "brain-embed: edge function unreachable");
        return null;
      }
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { embeddings?: number[][] } | null;
      return json?.embeddings ?? null;
    }
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    // 503 with an empty body is the platform's own "not now", and it counted as final:
    // on 2026-09-27 15:42 one ended the hourly catch-up on its first try and posted a
    // FAILED alert to #brain, after eight clean runs.
    //
    // EVERY 5xx IS RETRIED. Loading the books on 2026-09-28, back-to-back batches alternated
    // 200 and 546, with a 500 WORKER_ERROR ("Function exited due to an error") and a 500
    // "expected value at line 1 column 1" among them, and each of those rows embedded on its
    // own a moment later. A 500 counted as final, so the batch was lost. Our own function
    // (supabase/functions/brain-embed) also answers 500 for any error its model throws, so a
    // text the model rejects every time is retried too: that costs its attempts, and then
    // it waits for the next run like any other failed row. A 4xx stays final.
    const transient =
      res.status >= 500 ||
      res.status === 429 ||
      /WORKER_RESOURCE_LIMIT|BOOT_ERROR|timed out/i.test(detail);
    if (!transient || attempt === attempts - 1) {
      logger.warn({ status: res.status, detail, attempt }, "brain-embed: edge function refused");
      return null;
    }
    /**
     * STOP RETRYING WHEN THE CALLER IS OUT OF TIME.
     *
     * The backoff totals 22.5s across six attempts, and `embedMissing` only checked
     * its budget BETWEEN batches — so one bad batch late in a run pushed the cron
     * from its 40s budget past the 60s ceiling and Vercel killed it mid-flight
     * (observed: brain-fast, 504 at 00:37). Giving up here costs nothing: the chunk
     * stays NULL and the next run collects it, which is what the whole
     * `embedding IS NULL` design is for.
     */
    if (opts.isOutOfTime?.()) {
      logger.warn({ attempt }, "brain-embed: out of time, leaving the rest for the next run");
      return null;
    }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

export interface EmbedResult {
  embedded: number;
  remaining: number;
  complete: boolean;
}

/**
 * Embed chunks that have none yet.
 *
 * Deliberately driven by `embedding IS NULL` rather than by a timestamp: it is
 * restartable, it cannot skip a row because of a clock, and a new chunk from any
 * ingester is picked up automatically without that ingester knowing embeddings
 * exist.
 */
export async function embedMissing(
  isOutOfTime: () => boolean = () => false,
  maxBatches = 1000,
  /**
   * Per-request bounds for ONE embed call, for callers that live inside a function
   * ceiling.
   *
   * The default here is the BACKFILL's patience: 8 attempts at 30s each, plus
   * 42s of backoff. That is correct for `scripts/brain-embed-backfill.ts`, which
   * has no ceiling and would rather wait than lose a batch. It is catastrophic
   * inside `brain-fast`, whose `maxDuration` is 60s: a single cold edge worker --
   * the model is ~130MB and loads on first call -- hangs longer than the function
   * is allowed to live, Vercel kills it, and `recordCronRun` sits in the `finally`
   * that never runs. The run then counts as neither success nor failure. It does
   * not exist.
   *
   * Observed exactly that on 2026-09-06: retitling 187 analytics chunks nulled
   * their embeddings, the 08:52 brain-fast run had real work for the first time in
   * a while, and it left NO cron_run row while every neighbouring run recorded
   * 7-10s and success. `isOutOfTime` cannot save it -- that is checked BETWEEN
   * attempts, never during one.
   */
  opts: { attempts?: number; timeoutMs?: number } = {}
): Promise<EmbedResult> {
  let embedded = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    if (isOutOfTime()) return { embedded, remaining: await countMissing(), complete: false };

    /**
     * NEWEST WRITTEN FIRST, and the direction is the whole point.
     *
     * A chunk with no embedding still matches lexically, but scores ZERO on the semantic
     * term while its rivals score 0.4-0.8 — so it is not merely less findable, it is
     * actively outranked by older rows saying the same thing. Ordering the queue
     * `id.asc` put every freshly-written chunk at the BACK of it, which aimed that
     * penalty squarely at the newest facts.
     *
     * MEASURED 2026-09-09: "how many signups so far this month" returned AUGUST's monthly
     * total and September's daily rows, while September's own monthly total — written
     * that morning, matching "September" and "signups" lexically — did not appear at all.
     * It was 181 rows down a queue drained oldest-first.
     *
     * `id.desc` only fixed that for rows INSERTED fresh. The totals people ask about most
     * (all time, this month, today) are UPDATED in place every fifteen minutes and keep
     * their old id, so behind any backlog they waited again. Measured 2026-09-27: after 70
     * evidence cards were rebuilt, "alltime" and "monthly:2026-09" sat unembedded behind
     * them and four funnel questions failed the battery. So the order is `updated_at`,
     * read off a partial index that holds only the unembedded rows
     * (20260927170500_brain_chunk_unembedded_queue).
     *
     * The tail is guarded by the backlog alarm in brain-fast rather than by fairness
     * here: if new rows ever arrive faster than they can be embedded, `remaining` grows
     * and says so, and that is a problem no ordering fixes.
     */
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=id,title,body&embedding=is.null&order=updated_at.desc,id.desc&limit=${READ_BATCH}`
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "brain-embed: could not read chunks");
      return { embedded, remaining: -1, complete: false };
    }
    const rows = (await res.json().catch(() => [])) as Array<{
      id: number;
      title: string | null;
      body: string;
    }>;
    if (rows.length === 0) return { embedded, remaining: 0, complete: true };

    const done: typeof rows = [];
    const vecs: string[] = [];

    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      if (isOutOfTime()) break;
      const slice = rows.slice(i, i + EMBED_BATCH);
      const texts = slice.map((r) => embedText(r.title, r.body));
      const bounds = { isOutOfTime, attempts: opts.attempts, timeoutMs: opts.timeoutMs };
      let vectors: Array<number[] | null> | null = await embedBatch(texts, bounds);
      if (!vectors || vectors.length !== slice.length) {
        logger.warn(
          { asked: slice.length, got: vectors?.length ?? 0 },
          "brain-embed: batch returned the wrong number of vectors"
        );
        /**
         * ONE TEXT MUST NOT HOLD THE QUEUE. It is read newest first, so a batch that always
         * fails sits at the head of every later read: breaking here left every row behind
         * it unembedded for good. Each row gets a try of its own, a row that fails alone
         * waits for the next run, and the batch after it goes on. Only a whole batch of rows
         * that each fail alone still stops the run, as an edge that is down does.
         */
        vectors = [];
        for (const text of slice.length > 1 ? texts : []) {
          if (isOutOfTime()) break;
          vectors.push((await embedBatch([text], bounds))?.[0] ?? null);
        }
      }
      let got = 0;
      slice.forEach((row, j) => {
        const vector = vectors?.[j];
        if (!vector) return;
        done.push(row);
        vecs.push(toVectorLiteral(vector));
        got++;
      });
      // Not one row, even alone: the edge is down rather than the text. Stop, as before.
      if (got === 0) break;
    }

    if (done.length === 0) return { embedded, remaining: -1, complete: false };

    const kept = await storeVectors(done, vecs);
    if (kept === null) return { embedded, remaining: -1, complete: false };
    embedded += kept;
  }
  return { embedded, remaining: await countMissing(), complete: false };
}

/**
 * Stores each row's vector, then clears any row rewritten while it was being embedded, and
 * returns how many kept theirs (null when the write failed). Every embedding writer goes
 * through here.
 *
 * Such a row would hold the OLD text's vector, and a row with an embedding never re-enters
 * the queue: the trigger clears a vector only when the text changes, and that change had
 * already happened. So the batch is read back, and a row whose text moved is cleared for the
 * next run to embed as it reads now.
 */
export async function storeVectors(
  rows: Array<{ id: number; title: string | null; body: string }>,
  vecs: string[]
): Promise<number | null> {
  const ids = rows.map((r) => r.id);
  // ONE round trip for the whole batch. PostgREST cannot update many rows with differing
  // values, so a PATCH per row meant ~21,000 requests.
  const wrote = await supabaseFetch("/rest/v1/rpc/brain_set_embeddings", {
    method: "POST",
    body: JSON.stringify({ ids, vecs }),
  });
  if (!wrote.ok) {
    logger.warn(
      { status: wrote.status, detail: (await wrote.text().catch(() => "")).slice(0, 200) },
      "brain-embed: could not store the vectors"
    );
    return null;
  }

  // The vectors are stored by now, so a check that fails or throws must not fail the call.
  try {
    const sent = new Map(rows.map((r) => [r.id, embedText(r.title, r.body)]));
    const back = await supabaseFetch(
      `/rest/v1/brain_chunk?select=id,title,body&id=in.(${ids.join(",")})`
    );
    if (!back.ok) {
      logger.warn({ status: back.status }, "brain-embed: could not re-read a batch");
      return ids.length;
    }
    const now = (await back.json().catch(() => [])) as typeof rows;
    const moved = now.filter((r) => embedText(r.title, r.body) !== sent.get(r.id)).map((r) => r.id);
    // A row deleted since the write is not in `now`, and kept no vector.
    if (moved.length === 0) return now.length;
    const cleared = await supabaseFetch(`/rest/v1/brain_chunk?id=in.(${moved.join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ embedding: null }),
    });
    if (!cleared.ok) {
      logger.warn({ status: cleared.status, moved }, "brain-embed: could not clear stale vectors");
      return ids.length;
    }
    return now.length - moved.length;
  } catch (err) {
    logger.warn({ err }, "brain-embed: could not check a stored batch for rewritten rows");
    return ids.length;
  }
}

async function countMissing(): Promise<number> {
  const res = await supabaseFetch("/rest/v1/brain_chunk?select=id&embedding=is.null", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) return -1;
  return Number(res.headers.get("content-range")?.split("/")[1] ?? "-1");
}

/**
 * THE SAME QUESTION IS EMBEDDED ONCE PER INSTANCE. A narrowed search that comes back weak
 * asks the same question again with no filter, and that second search embedded it again,
 * in sequence: measured 2026-10-05, that class of search went from 0.87 s to 6.37 s p50.
 * `gte-small` gives the same text the same vector, so a vector made once stays right.
 * Only successes are kept, so a failed call is tried afresh next time.
 * ponytail: oldest-first eviction, not LRU; a repeat comes within seconds of the first.
 */
const EMBEDDED_KEPT = 64;
const embedded = new Map<string, string>();

/**
 * Embed a QUESTION, for the semantic arm of `brain_search`.
 *
 * Returns null on any failure, and the caller passes that straight through: with a
 * null vector the search degrades to exactly its previous lexical behaviour. An
 * embedding outage therefore makes answers worse, never broken — which matters
 * because this now sits on the path of every question the team asks.
 */
export async function embedQuery(question: string): Promise<string | null> {
  const text = question.trim().slice(0, 1500);
  if (text.length < 2) return null;
  const known = embedded.get(text);
  if (known) return known;
  // One attempt, four seconds. Retrying here the way the backfill does would put
  // 22s of backoff in front of a waiting person on a cold edge worker.
  const vectors = await embedBatch([text], { attempts: 1, timeoutMs: 4_000 });
  const first = vectors?.[0];
  if (!first) return null;
  const literal = toVectorLiteral(first);
  embedded.set(text, literal);
  if (embedded.size > EMBEDDED_KEPT) embedded.delete(embedded.keys().next().value!);
  return literal;
}

/** Exposed for the one-off re-embed script; see scripts/brain-reembed-all.ts. */
export const embedBatchForTest = embedBatch;
