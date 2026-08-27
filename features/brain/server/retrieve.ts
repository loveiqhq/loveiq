import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * Retrieval half of the company brain: turn a question into the handful of
 * corpus chunks most likely to contain the answer.
 *
 * Ranking itself lives in the `brain_search` RPC (full-text + trigram, see
 * 20260825215317_brain_chunk.sql). What lives HERE is the shaping that SQL is a
 * clumsy place for, and that measurably changes answer quality:
 *
 *   1. DEDUPE BY PARENT. Long docs and long commit messages are stored as several
 *      chunks, and a query that matches one part usually matches its siblings.
 *      Measured on this corpus, "how do I add a new landing section" returned the
 *      same commit at ranks 2 AND 3 -- which wastes prompt budget on a duplicate
 *      and shows the reader the same citation twice.
 *   2. SOURCE DIVERSITY. There are 1,475 commit chunks against 454 doc chunks, and
 *      commit titles are short subject lines that score well on word-similarity.
 *      So commits crowd the top even when the authoritative answer is a doc: for
 *      "why is the data retention purge turned off" the CLAUDE.md
 *      "Postponed / TODO" section -- which literally answers it -- placed 4th
 *      behind three commits. Rather than invent a fudge factor per source, this
 *      caps how much of the result set any one source may take, so the model sees
 *      the policy doc AND the history and can pick.
 */

export interface BrainChunk {
  source: string;
  sourceId: string;
  title: string | null;
  url: string | null;
  body: string;
  meta: Record<string, unknown>;
  score: number;
}

/**
 * Candidates requested per (source, grain) bucket, and the global ceiling on the
 * candidate set.
 *
 * These two must be sized TOGETHER. The SQL ranks within each bucket and then
 * applies a global LIMIT, so a global limit that is too tight throws away exactly
 * the rows the bucketing just protected: measured, the August revenue row ranked
 * 61st globally and a limit of 56 discarded it, after which the model answered
 * "what did we spend and what did we earn" from partial weeks. With ~11 buckets
 * and 3 candidates each, 100 comfortably clears the whole set.
 */
const PER_BUCKET_CANDIDATES = 3;
const CANDIDATE_CEILING = 100;

/**
 * No single BUCKET — a source at one grain — may exceed this share of the
 * returned set, so long as other buckets have candidates left to fill the gap.
 *
 * TUNED BY MEASUREMENT, not taste. With 1,475 commit chunks against 454 doc and
 * 171 analytics chunks, and commit titles being short subject lines that score
 * well on word-similarity, commits take every top slot unchecked. Measured on
 * four representative questions: at 0.6 the answering chunk landed 5th, at 0.4
 * 4th, at 0.3 3rd. Lowering it costs nothing on a genuinely single-source
 * question — "what did we change about the daily digest" still returns eight
 * commits at every setting, because the backfill below refuses to return a short
 * list when no other source has candidates.
 */
const MAX_SOURCE_SHARE = 0.3;

/**
 * Diversity bucket: source AND grain.
 *
 * Source alone is not enough. The daily, weekly and monthly rows of one period
 * are near-identical text differing only in their numbers — measured, the August
 * daily, weekly and monthly chunks scored ts_rank 0.0507 / 0.0524 / 0.0507, a
 * spread of 0.002. No weighting can separate a tie that small, so the monthly
 * total lost to a weekly on noise and "what did we spend in August" got summed
 * from partial weeks instead of read from the row that already has the answer.
 * Reserving a slot per grain is the only tie-break that survives.
 */
function bucketKey(row: BrainChunk): string {
  const grain = typeof row.meta?.grain === "string" ? row.meta.grain : "";
  return `${row.source}:${grain}`;
}

/**
 * The thing a chunk is part of, so several pieces of one document or one commit
 * collapse to their best-scoring piece.
 *
 * ONLY `doc` AND `commit` ARE SPLIT, so only they need collapsing. An earlier
 * version stripped a trailing `-<digits>` from every id to undo the `<sha>-2`
 * part suffix, and that silently ate real keys: `monthly:2026-08` became
 * `monthly:2026`, so EVERY month of a year collapsed into one parent and all but
 * the best-scoring month was discarded before it could ever be returned. Same for
 * `daily:2026-08-05`. Date-keyed sources are already unique — they must be passed
 * through untouched.
 */
function parentKey(row: BrainChunk): string {
  // `<sha>` and `<sha>-2` are the same commit; the sha is exactly 40 hex chars.
  if (row.source === "commit") return `commit:${row.sourceId.slice(0, 40)}`;

  // Two headings of one document are the same document.
  if (row.source === "doc") {
    const path = typeof row.meta?.path === "string" ? row.meta.path : null;
    return `doc:${path ?? row.sourceId.split("#")[0]}`;
  }

  // analytics / ga4 / gsc / jira: the id is already the natural key.
  return `${row.source}:${row.sourceId}`;
}

/**
 * Thrown when the corpus could not be QUERIED — HTTP 5xx, timeout, an open
 * circuit breaker, Supabase not configured.
 *
 * This exists because returning `[]` for both "asked, found nothing" and "could
 * not ask" made the brain reply "I couldn't find anything about that" while the
 * database was down. For a tool whose only product is trustworthiness, asserting
 * that evidence does not exist when the evidence store is unreachable is the one
 * failure that destroys it. Callers must tell the two apart.
 */
export class CorpusUnavailableError extends Error {
  constructor(detail: string) {
    super(`brain corpus unavailable: ${detail}`);
    this.name = "CorpusUnavailableError";
  }
}

export async function retrieve(question: string, limit = 12): Promise<BrainChunk[]> {
  const trimmed = question.trim();
  if (trimmed.length < 2) return [];

  let rows: Array<Record<string, unknown>> = [];
  try {
    const res = await supabaseFetch("/rest/v1/rpc/brain_search", {
      method: "POST",
      // `per_source` is what makes the cap below meaningful. Without it the
      // over-fetch is not diverse: measured, "how much did we spend on google ads
      // in august and what did we earn" returned 30 of the top 32 from `ga4`
      // alone -- every GA4 chunk carries "Google Analytics" in its title -- so the
      // revenue row was never a candidate and the model could only answer half
      // the question. Capping candidates PER SOURCE in SQL, before truncation,
      // is the only place that can be fixed.
      body: JSON.stringify({
        query_text: trimmed,
        k: CANDIDATE_CEILING,
        per_source: PER_BUCKET_CANDIDATES,
      }),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "brain_search RPC failed");
      throw new CorpusUnavailableError(`rpc ${res.status}`);
    }
    rows = (await res.json()) as Array<Record<string, unknown>>;
  } catch (err) {
    if (err instanceof CorpusUnavailableError) throw err;
    // CircuitOpenError lands here too, which is exactly right: an open breaker
    // means we did not ask, so we cannot claim there is nothing to find.
    logger.error({ err }, "brain retrieval failed");
    throw new CorpusUnavailableError(err instanceof Error ? err.message : "unknown");
  }
  if (!Array.isArray(rows)) return [];

  const candidates: BrainChunk[] = rows.map((r) => ({
    source: String(r.source ?? ""),
    sourceId: String(r.source_id ?? ""),
    title: typeof r.title === "string" ? r.title : null,
    url: typeof r.url === "string" ? r.url : null,
    body: String(r.body ?? ""),
    meta: (r.meta ?? {}) as Record<string, unknown>,
    score: typeof r.score === "number" ? r.score : 0,
  }));

  // Rows arrive already ordered by score, so first-seen wins on both passes.
  const bestPerParent: BrainChunk[] = [];
  const seenParents = new Set<string>();
  for (const row of candidates) {
    const key = parentKey(row);
    if (seenParents.has(key)) continue;
    seenParents.add(key);
    bestPerParent.push(row);
  }

  // TWO caps, because either alone fails.
  //   * Source only: the three time grains of one source are near-identical text,
  //     so the monthly total loses a coin-flip tie to a weekly and the answer gets
  //     summed from partial weeks instead of read whole.
  //   * Bucket only: a source with three grains quietly gets three times the
  //     allowance -- measured, ga4 took 12 of 14 slots that way and squeezed the
  //     revenue row out entirely.
  // Capping both keeps every grain reachable AND every source represented.
  const sourceCap = Math.max(1, Math.floor(limit * MAX_SOURCE_SHARE));
  // ONE per bucket on the first pass, then backfill by score. Anything higher
  // lets a source spend its whole allowance on the grain that happens to score
  // marginally best: measured, `analytics` filled all four of its slots with two
  // weekly and two daily rows (0.850/0.845/0.797/0.793) and never reached the
  // monthly total at 0.786 — the one row that actually held the answer. The
  // spread is noise; reserving a slot per grain is what makes it deterministic.
  const grainCap = 1;

  const picked: BrainChunk[] = [];
  const perSource = new Map<string, number>();
  const perBucket = new Map<string, number>();
  const deferred: BrainChunk[] = [];

  for (const row of bestPerParent) {
    if (picked.length >= limit) break;
    const bucket = bucketKey(row);
    if ((perSource.get(row.source) ?? 0) >= sourceCap || (perBucket.get(bucket) ?? 0) >= grainCap) {
      deferred.push(row);
      continue;
    }
    perSource.set(row.source, (perSource.get(row.source) ?? 0) + 1);
    perBucket.set(bucket, (perBucket.get(bucket) ?? 0) + 1);
    picked.push(row);
  }

  // If the cap left room unused because no other source had candidates, fill it
  // back in by score rather than returning a short list.
  for (const row of deferred) {
    if (picked.length >= limit) break;
    picked.push(row);
  }

  // The backfill appends AFTER every capped pick, so a deferred row scoring 1.02
  // could sit at slot 12 while slot 3 scored 0.99. Citations are rendered [1]…[n]
  // in this order, and a reader reasonably assumes [1] is the most relevant.
  // Sorting at the end costs nothing and cannot change WHICH rows were chosen.
  picked.sort((a, b) => b.score - a.score);

  return picked;
}
