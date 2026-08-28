import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * Shared write path for every non-git ingester (Jira, Google analytics).
 *
 * The repo ingester in `scripts/brain-ingest-repo.mjs` deliberately does NOT use
 * this: it runs in a GitHub Action with no Next.js module graph, so it speaks to
 * PostgREST directly. The two implementations agree on the contract that matters
 * — upsert on (source, source_id), then sweep by `updated_at` — and that contract
 * is enforced by the UNIQUE constraint, not by shared code.
 */

export interface BrainRow {
  source: string;
  source_id: string;
  title: string;
  url: string | null;
  body: string;
  meta: Record<string, unknown>;
  updated_at: string;
  /**
   * The period this chunk DESCRIBES — not when it was ingested.
   *
   * `updated_at` cannot order by recency: it is stamped once per run, so
   * `count(distinct updated_at)` was 1 across all 171 analytics chunks and the
   * `ORDER BY score DESC, updated_at DESC` tie-break was a no-op. With scores
   * tying 0.002 apart that made "the most recent month" effectively random —
   * "revenue?" answered with May. Null where a period is meaningless (docs).
   */
  period_end?: string | null;
}

const BATCH = 200;

/** Postgres text columns reject NUL bytes outright (SQLSTATE 22021). */
const NUL_BYTE = String.fromCharCode(0);

/** Matches the ceiling the repo ingester enforces, so every source is chunked
 *  to a comparable size and no single row can dominate a prompt. */
const MAX_BODY_CHARS = 2400;

/**
 * Credential shapes that must never enter the corpus.
 *
 * Indexing a secret is not the same as sharing a document. `brain_chunk` is
 * searchable by everyone, its contents are pasted into every LLM prompt that
 * retrieves them, and the free-tier model provider may train on those prompts —
 * so one indexed key becomes several copies in places it can never be recalled
 * from. LoveIQ's open-access policy is about people reading information; it is
 * not a decision to publish credentials.
 *
 * Deliberately PREFIXED patterns only. A generic "long opaque string" rule would
 * silently drop legitimate chunks — git SHAs, base64, ids — and a guard that eats
 * real content is worse than no guard.
 */
const CREDENTIAL_PATTERNS: Array<[string, RegExp]> = [
  ["github", /gh[pousr]_[A-Za-z0-9]{16,}/],
  ["github-fine-grained", /github_pat_[A-Za-z0-9_]{20,}/],
  ["notion", /\b(?:ntn_|secret_)[A-Za-z0-9]{24,}/],
  ["google-api-key", /AIza[A-Za-z0-9_-]{30,}/],
  ["google-oauth-secret", /GOCSPX-[A-Za-z0-9_-]{20,}/],
  ["slack", /xox[baprse]-[A-Za-z0-9-]{16,}/],
  ["stripe", /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["stripe-webhook", /whsec_[A-Za-z0-9]{24,}/],
  ["openai-anthropic", /\bsk-(?:ant-)?[A-Za-z0-9_-]{24,}/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\./],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY/],
  ["aws", /\bAKIA[0-9A-Z]{16}\b/],
];

/** The credential kind found in this text, or null. */
export function credentialKind(text: string): string | null {
  for (const [kind, pattern] of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) return kind;
  }
  return null;
}

function clean(row: BrainRow): BrainRow {
  return {
    ...row,
    title: row.title.split(NUL_BYTE).join(""),
    body: row.body.split(NUL_BYTE).join("").slice(0, MAX_BODY_CHARS),
    // PostgREST rejects a bulk insert whose objects do not all carry the SAME
    // keys — "All object keys must match" (PGRST102), and it fails the whole
    // batch, not the offending row. `period_end` is optional, and JSON.stringify
    // drops `undefined`, so one row without it breaks every other row in the
    // batch. Normalising to an explicit null here means no caller has to know.
    period_end: row.period_end ?? null,
  };
}

export async function upsertChunks(rows: BrainRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  // A duplicate key inside ONE batch makes Postgres raise "ON CONFLICT DO UPDATE
  // command cannot affect row a second time" and fails the whole request, so
  // de-duplicate here rather than trusting every caller to.
  const byKey = new Map<string, BrainRow>();
  for (const row of rows) {
    // Refused at the shared write path, so every source is covered and no
    // ingester has to remember. Logged with the title and never the value, so
    // someone can go and rotate it.
    const kind = credentialKind(`${row.title}\n${row.body}`);
    if (kind) {
      logger.warn(
        { source: row.source, sourceId: row.source_id, kind, url: row.url },
        "brain: refusing to index a chunk containing a credential — rotate it and remove it from the source"
      );
      continue;
    }
    byKey.set(`${row.source} ${row.source_id}`, clean(row));
  }
  const unique = [...byKey.values()];

  let written = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const res = await supabaseFetch("/rest/v1/brain_chunk?on_conflict=source,source_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`brain_chunk upsert failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    written += batch.length;
  }
  return written;
}

/**
 * Delete rows of one source that this run did not rewrite — a deleted Jira issue,
 * a date that fell out of the window.
 *
 * ONLY CALL THIS AFTER A COMPLETE RUN. Sweeping after a partial run deletes
 * everything the run never reached, which silently empties the corpus.
 *
 * `wroteRows` is required rather than advisory, because "the upstream answered"
 * is not the same as "the run was complete". GA4 omits `rows` entirely for an
 * empty result set and returns 200, so an accessible-but-empty property yielded
 * zero chunks, zero writes, and then a sweep that deleted every ga4 row — and
 * the cron reported `{ok: true}`, so nothing alerted. Refusing to sweep on a
 * zero-write run makes that unreachable for every caller instead of asking four
 * of them to remember.
 */
export async function sweepStale(
  source: string,
  stampedAt: string,
  wroteRows: number
): Promise<number> {
  if (wroteRows <= 0) {
    logger.warn(
      { source },
      "brain sweep skipped: run wrote no rows, refusing to delete the source"
    );
    return 0;
  }

  // HOW MANY ROWS WOULD THIS DELETE, asked with the DELETE's own predicate.
  //
  // A `wroteRows > 0` check closes only the empty case, and the partial case is
  // both likelier and nearly as damaging: a GA4 report truncated to 5 of 90 days
  // writes 5 chunks, clears the zero check, and the sweep removes the other 85.
  const wouldDelete = await countChunks(source, stampedAt);
  const total = await countChunks(source, null);
  if (wouldDelete === null || total === null) {
    logger.warn(
      { source },
      "brain sweep skipped: could not count existing rows, refusing to delete"
    );
    return 0;
  }
  if (wouldDelete === 0) return 0;

  // Counts cannot distinguish a legitimate mass id change (a shorter `DAYS`
  // window, a re-chunking) from a broken collection — both leave most rows
  // orphaned. Refuse and say so: stale rows are recoverable, deleted rows are
  // not. The cron surfaces this as a zero-row/skip alert.
  if (wouldDelete > total - wouldDelete) {
    logger.warn(
      { source, wouldDelete, keeps: total - wouldDelete, wroteRows },
      "brain sweep skipped: it would delete the majority of this source, which is either a mass id change or a broken collection"
    );
    return 0;
  }

  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}&updated_at=lt.${encodeURIComponent(stampedAt)}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } }
    );
    if (!res.ok) {
      logger.warn({ source, status: res.status }, "brain sweep failed");
      return 0;
    }
    const deleted = (await res.json().catch(() => [])) as unknown[];
    return Array.isArray(deleted) ? deleted.length : 0;
  } catch (err) {
    logger.warn({ err, source }, "brain sweep threw");
    return 0;
  }
}

/**
 * Rows for a source, optionally only those older than `before` — the same
 * predicate the DELETE uses, so after an upsert it counts precisely the orphans.
 *
 * Returns NULL on any failure, never 0. The previous version returned 0, and the
 * caller read 0 as "nothing stored, nothing to protect" and swept. A 503, a
 * missing `Content-Range`, or PostgREST answering `0-0/*` therefore turned the
 * safety check into a no-op — measured on the repo ingester, 1,448 rows deleted
 * with no warning and a healthy-looking exit 0. A failed DELETE is fatal here; a
 * failed safety check must not be "proceed".
 */
async function countChunks(source: string, before: string | null): Promise<number | null> {
  const filter = before ? `&updated_at=lt.${encodeURIComponent(before)}` : "";
  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=id&source=eq.${encodeURIComponent(source)}${filter}`,
      { headers: { Prefer: "count=exact", Range: "0-0" } }
    );
    if (!res.ok) return null;
    const raw = res.headers.get("content-range")?.split("/")[1];
    if (!raw || raw === "*") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export interface IngestResult {
  source: string;
  rows: number;
  swept: number;
  skipped?: string;
  error?: string;
}
