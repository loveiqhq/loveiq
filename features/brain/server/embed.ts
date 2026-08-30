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
export const EMBED_BATCH = 8;

/** Rows fetched per pass. Larger than EMBED_BATCH so one database read feeds
 *  several embedding calls and one write puts them all back. */
const READ_BATCH = 100;

/** How much of a chunk is embedded. `gte-small` truncates past ~512 tokens, so
 *  sending more costs time and changes nothing. The title leads because it carries
 *  the most distinguishing words. */
export function embedText(title: string | null, body: string): string {
  return `${title ?? ""}\n${body}`.slice(0, 1500);
}

/** Postgres reads a vector literal as `[0.1,0.2,…]`. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.map((n) => (Number.isFinite(n) ? n.toFixed(6) : "0")).join(",")}]`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(
  texts: string[],
  opts: { attempts?: number; timeoutMs?: number } = {}
): Promise<number[][] | null> {
  // The BACKFILL wants persistence -- losing a batch means those chunks stay
  // unsearchable. A QUESTION wants to fail fast: it sits in front of a person
  // waiting for an answer, and lexical search is a perfectly good fallback. Same
  // call, different patience, so the caller sets it.
  const attempts = Math.max(1, opts.attempts ?? 6);
  const timeoutMs = opts.timeoutMs ?? 120_000;
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
    const res = await fetchWithTimeout(`${url}/functions/v1/brain-embed`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
      timeoutMs,
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { embeddings?: number[][] } | null;
      return json?.embeddings ?? null;
    }
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    const transient =
      res.status === 546 || /WORKER_RESOURCE_LIMIT|BOOT_ERROR|timed out/i.test(detail);
    if (!transient || attempt === attempts - 1) {
      logger.warn({ status: res.status, detail, attempt }, "brain-embed: edge function refused");
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
  maxBatches = 1000
): Promise<EmbedResult> {
  let embedded = 0;

  for (let batch = 0; batch < maxBatches; batch++) {
    if (isOutOfTime()) return { embedded, remaining: await countMissing(), complete: false };

    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=id,title,body&embedding=is.null&order=id.asc&limit=${READ_BATCH}`
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

    const ids: number[] = [];
    const vecs: string[] = [];

    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      if (isOutOfTime()) break;
      const slice = rows.slice(i, i + EMBED_BATCH);
      const vectors = await embedBatch(slice.map((r) => embedText(r.title, r.body)));
      if (!vectors || vectors.length !== slice.length) {
        logger.warn(
          { asked: slice.length, got: vectors?.length ?? 0 },
          "brain-embed: batch returned the wrong number of vectors"
        );
        break;
      }
      for (let j = 0; j < slice.length; j++) {
        ids.push(slice[j]!.id);
        vecs.push(toVectorLiteral(vectors[j]!));
      }
    }

    if (ids.length === 0) return { embedded, remaining: -1, complete: false };

    // ONE round trip for the whole read batch. PostgREST cannot update many rows
    // with differing values, so a PATCH per row meant ~21,000 requests.
    const wrote = await supabaseFetch("/rest/v1/rpc/brain_set_embeddings", {
      method: "POST",
      body: JSON.stringify({ ids, vecs }),
    });
    if (!wrote.ok) {
      logger.warn(
        { status: wrote.status, detail: (await wrote.text().catch(() => "")).slice(0, 200) },
        "brain-embed: could not store the vectors"
      );
      return { embedded, remaining: -1, complete: false };
    }
    embedded += ids.length;
  }
  return { embedded, remaining: await countMissing(), complete: false };
}

async function countMissing(): Promise<number> {
  const res = await supabaseFetch("/rest/v1/brain_chunk?select=id&embedding=is.null", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) return -1;
  return Number(res.headers.get("content-range")?.split("/")[1] ?? "-1");
}

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
  // One attempt, four seconds. Retrying here the way the backfill does would put
  // 22s of backoff in front of a waiting person on a cold edge worker.
  const vectors = await embedBatch([text], { attempts: 1, timeoutMs: 4_000 });
  const first = vectors?.[0];
  return first ? toVectorLiteral(first) : null;
}
