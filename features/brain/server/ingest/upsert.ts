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
}

const BATCH = 200;

/** Postgres text columns reject NUL bytes outright (SQLSTATE 22021). */
const NUL_BYTE = String.fromCharCode(0);

/** Matches the ceiling the repo ingester enforces, so every source is chunked
 *  to a comparable size and no single row can dominate a prompt. */
const MAX_BODY_CHARS = 2400;

function clean(row: BrainRow): BrainRow {
  return {
    ...row,
    title: row.title.split(NUL_BYTE).join(""),
    body: row.body.split(NUL_BYTE).join("").slice(0, MAX_BODY_CHARS),
  };
}

export async function upsertChunks(rows: BrainRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  // A duplicate key inside ONE batch makes Postgres raise "ON CONFLICT DO UPDATE
  // command cannot affect row a second time" and fails the whole request, so
  // de-duplicate here rather than trusting every caller to.
  const byKey = new Map<string, BrainRow>();
  for (const row of rows) byKey.set(`${row.source} ${row.source_id}`, clean(row));
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
 */
export async function sweepStale(source: string, stampedAt: string): Promise<number> {
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

export interface IngestResult {
  source: string;
  rows: number;
  swept: number;
  skipped?: string;
  error?: string;
}
