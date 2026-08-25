import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * Retrieval half of the company brain: turn a question into the handful of
 * corpus chunks most likely to contain the answer.
 *
 * Ranking itself lives in the `brain_search` RPC (full-text + trigram, see
 * 20260826090000_brain_chunk.sql). What lives HERE is the shaping that SQL is a
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

/** Over-fetch factor. Dedupe and the per-source cap both discard rows, so asking
 *  for exactly `limit` would routinely return fewer than `limit`. */
const OVERFETCH = 4;

/**
 * No single source may exceed this share of the returned set, so long as other
 * sources have candidates left to fill the gap.
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
 * The thing a chunk is part of. Splitting produced `<sha>-2` and
 * `path#heading-2`, so the parent is the id with any trailing part index removed;
 * docs additionally collapse to their file so two headings of one doc do not both
 * land in a short result set.
 */
function parentKey(row: BrainChunk): string {
  if (row.source === "commit") return `commit:${row.sourceId.slice(0, 40)}`;
  const path = typeof row.meta?.path === "string" ? row.meta.path : null;
  if (path) return `doc:${path}`;
  return `${row.source}:${row.sourceId.replace(/-\d+$/, "")}`;
}

export async function retrieve(question: string, limit = 12): Promise<BrainChunk[]> {
  const trimmed = question.trim();
  if (trimmed.length < 2) return [];

  let rows: Array<Record<string, unknown>> = [];
  try {
    const res = await supabaseFetch("/rest/v1/rpc/brain_search", {
      method: "POST",
      body: JSON.stringify({ query_text: trimmed, k: limit * OVERFETCH }),
    });
    if (!res.ok) {
      logger.error({ status: res.status }, "brain_search RPC failed");
      return [];
    }
    rows = (await res.json()) as Array<Record<string, unknown>>;
  } catch (err) {
    logger.error({ err }, "brain retrieval failed");
    return [];
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

  const cap = Math.max(1, Math.floor(limit * MAX_SOURCE_SHARE));
  const picked: BrainChunk[] = [];
  const perSource = new Map<string, number>();
  const deferred: BrainChunk[] = [];

  for (const row of bestPerParent) {
    if (picked.length >= limit) break;
    const used = perSource.get(row.source) ?? 0;
    if (used >= cap) {
      deferred.push(row);
      continue;
    }
    perSource.set(row.source, used + 1);
    picked.push(row);
  }

  // If the cap left room unused because no other source had candidates, fill it
  // back in by score rather than returning a short list.
  for (const row of deferred) {
    if (picked.length >= limit) break;
    picked.push(row);
  }

  return picked;
}
