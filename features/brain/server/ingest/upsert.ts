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
  // PostHog: phx_ is a Personal API Key (read/write on the account), phs_ a
  // session key. phc_ is the PUBLIC project token that ships in client-side
  // JavaScript, so it is deliberately NOT here — refusing it would drop real
  // documentation about our own analytics setup for no security gain.
  ["posthog", /\bph[xs]_[A-Za-z0-9]{32,}/],
  ["resend", /\bre_[A-Za-z0-9]{24,}/],
  ["calendly", /\beyJraWQ/], // Calendly PATs are JWTs; caught above too, kept for the label
  // Vercel: vcp_ is a PROJECT-scoped access token, vct_/vca_ the team and user
  // variants. Any of them can deploy or read project config, so none belongs in
  // a searchable table.
  ["vercel", /\bvc[pta]_[A-Za-z0-9]{24,}/],
  // Figma personal access token.
  ["figma", /\bfigd_[A-Za-z0-9_-]{24,}/],
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
      /**
       * The shared 8s default is a READ timeout and is far too short for this.
       * A batch of email threads is ~2,400 characters per row plus a regenerated
       * tsvector for each, and the multi-mailbox Gmail run died exactly here:
       * "Request timeout after 8000ms" — after successfully fetching every
       * mailbox, so the whole walk was thrown away at the last step.
       */
      timeoutMs: 45_000,
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
/**
 * Bump `updated_at` on rows this run deliberately did NOT rewrite.
 *
 * WHY THIS EXISTS. The sweep deletes any row of a source whose `updated_at` is
 * older than the current run's stamp, which means "keep this row" and "re-fetch
 * this row's content" are the same act — and for Notion that is 1,000+ HTTP
 * requests a night to re-download pages nobody edited. Touching lets a run say
 * "still there, unchanged" for the cost of one request per 100 rows, so a full
 * corpus stays live inside a 45-second cron budget.
 *
 * Batched because the ids travel in the URL as `in.(…)`; 100 uuids is ~4 KB,
 * comfortably inside any proxy's limit.
 *
 * Returns how many rows were confirmed, which the caller adds to its write count
 * before sweeping — otherwise a run that touched 1,000 rows and rewrote 3 looks
 * to `sweepStale` like a run that wrote almost nothing.
 */
export async function touchChunks(
  source: string,
  sourceIds: string[],
  stampedAt: string,
  /**
   * Whether the caller will actually sweep this run. Defaults true, so a caller
   * that always sweeps needs no argument.
   *
   * TOUCHING IS ONLY EVER FOR THE SWEEP, and it is far from free. `updated_at` is
   * an indexed column -- `idx_brain_chunk_source` is `btree (source, updated_at
   * DESC)` -- so a touch can NEVER be a HOT update. Every one rewrites the row and
   * its entries in a 42 MB GIN full-text index, a 30 MB HNSW vector index and a
   * 13 MB trigram index: 227 MB of indexes over a 51 MB heap.
   *
   * Measured on 2026-08-31, after Supabase warned the project was exhausting its
   * Disk IO budget: 30,213 live rows had absorbed 991,115 updates, 0.3% of them
   * HOT -- every row rewritten ~33 times purely to say "still here".
   *
   * Gmail and Drive were mid-re-walk at the time, so `complete` was false and
   * their sweeps never ran, while the touch still did: ~25,000 index-rewriting
   * updates an hour with no consumer whatsoever. Skipping those costs nothing,
   * because when a sweep does run the touch runs in the same pass and stamps
   * everything it saw.
   *
   * The rows still count as CONFIRMED when the write is skipped -- the caller saw
   * them in the walk; only the stamp, which nothing will read, is what we drop.
   */
  willSweep = true
): Promise<number> {
  if (sourceIds.length === 0) return 0;
  if (!willSweep) return sourceIds.length;

  let touched = 0;
  for (let i = 0; i < sourceIds.length; i += 100) {
    const batch = sourceIds.slice(i, i + 100);
    // PostgREST `in.()` needs each value quoted, or a comma or paren inside an
    // id would split the list. Notion ids are uuids, but the ingester prefixes
    // them (`task:`/`page:`) and a future source may not be so tidy.
    const list = batch.map((id) => `"${id.replace(/"/g, '""')}"`).join(",");
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}&source_id=in.(${encodeURIComponent(list)})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=headers-only,count=exact" },
        body: JSON.stringify({ updated_at: stampedAt }),
      }
    );
    if (!res.ok) {
      /**
       * FAIL CLOSED. This used to `continue`, which was the most dangerous line in
       * the ingester: the batch's rows were left with a stale `updated_at` AND
       * excluded from `touched`, so the sweep later in the same run deleted them as
       * orphans. The majority guard only refuses losses above ~50%, so a single
       * transient PostgREST 5xx could silently delete up to half a source.
       *
       * The circuit breaker cannot catch this either — it counts THROWN errors, and
       * `fetchWithTimeout` resolves normally with a 503 Response, so a run of 5xx
       * looks like a series of successes.
       *
       * Throwing aborts before the sweep and surfaces through the cron route's
       * existing catch, which alerts. A stale row is repaired by the next run; a
       * deleted one is gone.
       */
      throw new Error(
        `brain touch failed for ${source} (status ${res.status}, ${batch.length} rows) — ` +
          `aborting before the sweep so those rows are not deleted as orphans`
      );
    }
    // Trust the server's count, not the batch length: a row that no longer
    // exists must not be counted as kept.
    const range = res.headers.get("content-range");
    const n = range ? Number(range.split("/")[1]) : NaN;
    touched += Number.isFinite(n) ? n : batch.length;
  }
  return touched;
}

/**
 * Roughly once a day, not every run.
 *
 * The sweep deletes rows whose source document is gone. That is rare, and the touch
 * it depends on is the brain's most expensive write (see `touchChunks`). Paying a
 * full-corpus rewrite up to 96 times a day to notice a rare deletion is what
 * exhausted the project's Disk IO budget on 2026-08-31.
 *
 * Twenty hours rather than twenty-four so a source does not drift a slot later each
 * day and skip one entirely.
 */
const SWEEP_INTERVAL_MS = 20 * 60 * 60 * 1000;

/**
 * FAILS CLOSED. Any unreadable state answers "do not sweep", because the cost of
 * skipping a sweep is that a deleted document lingers one more day, while the cost
 * of sweeping on bad information is deleted corpus.
 *
 * A source with no row has never swept, so it sweeps on its next complete walk.
 */
export async function shouldSweep(source: string, nowMs = Date.now()): Promise<boolean> {
  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_sweep_state?source=eq.${encodeURIComponent(source)}&select=swept_at`
    );
    if (!res.ok) {
      logger.warn({ source, status: res.status }, "brain sweep state unreadable, not sweeping");
      return false;
    }
    const rows = (await res.json().catch(() => null)) as Array<{ swept_at?: string }> | null;
    if (!Array.isArray(rows)) return false;
    if (rows.length === 0) return true;
    const last = Date.parse(rows[0]?.swept_at ?? "");
    if (!Number.isFinite(last)) return false;
    return nowMs - last >= SWEEP_INTERVAL_MS;
  } catch (err) {
    logger.warn({ err, source }, "brain sweep state threw, not sweeping");
    return false;
  }
}

/**
 * Recorded on ATTEMPT, not on success. The expensive part -- the touch -- has already
 * happened by the time the sweep runs, so retrying in an hour would repeat the whole
 * cost to reach the same refusal. A sweep the majority guard declined is a signal to
 * look, not a reason to hammer the disk.
 */
export async function recordSweep(source: string, at = new Date().toISOString()): Promise<void> {
  try {
    await supabaseFetch("/rest/v1/brain_sweep_state?on_conflict=source", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ source, swept_at: at }),
    });
  } catch (err) {
    // A lost write means one extra sweep tomorrow. Never worth failing the run.
    logger.warn({ err, source }, "brain sweep state not recorded");
  }
}

/**
 * Delete rows of `source` whose id this run did not see. The touchless sweep.
 *
 * WHY THIS EXISTS ALONGSIDE `sweepStale`. The timestamp sweep needs every surviving
 * row stamped first, and that stamp is the most expensive write in the brain (see
 * `touchChunks`). For the large sources it does not even fit in one invocation:
 * drive is 16,117 rows in 161 batches and gmail 9,074, and both hit the 8s
 * per-request timeout on 2026-08-31 -- gmail at 11:11, drive at 14:52, 15:52 and
 * 16:52. No amount of scheduling fixes a job that cannot finish.
 *
 * The set of ids the run saw is what the sweep always actually meant, and every
 * ingester already holds it in memory. So: zero writes, one paged read, and a DELETE
 * that normally matches nothing.
 *
 * Same two guards as the timestamp version. FAIL CLOSED on any unreadable page,
 * because a short read makes live rows look like orphans; and refuse a majority
 * deletion, because a mass id change (a re-chunking, a shorter window) and a broken
 * collection are indistinguishable from here. Stale rows are recoverable; deleted
 * ones are not.
 */
/**
 * ONE PAGE OF A PAGED `brain_chunk` LISTING, OR THROW.
 *
 * Every ingester builds its "do not delete this" keep set by paging this table, and
 * five of them guarded the STATUS with a carefully-worded fail-closed throw and then
 * swallowed a bad BODY on the very next line:
 *
 *     if (!res.ok) throw new Error("... aborting before the sweep ...");
 *     const batch = (await res.json().catch(() => [])) as Row[];
 *     ...
 *     if (batch.length < 1000) break;
 *
 * `fetchWithTimeout` deliberately leaves the AbortController armed through the body
 * read, so a response that stalls AFTER its headers resolves `ok: true` and then
 * rejects inside `res.json()`. The catch yields `[]`, `0 < 1000` ends the loop, and a
 * TRUNCATED keep set is returned as the complete corpus. The sweep in that same run
 * then deletes every row the missing pages never mentioned, records success, and
 * alerts nobody: page 12 of a 17-page read stalling costs about a quarter of the
 * largest source.
 *
 * Throwing is the right failure. The ingest already turns a throw into a failed run
 * with an ops alert, and a stale row is repaired by the next run while a deleted one
 * is gone.
 *
 * This exists as ONE function because there were eight copies of the read and only
 * two of them had been fixed. Eight copies is the reason the other six were still
 * wrong.
 */
export async function chunkPage<T>(source: string, res: Response): Promise<T[]> {
  if (!res.ok) {
    throw new Error(
      `brain-ingest ${source}: could not read the existing chunk list (status ${res.status}) — ` +
        `aborting before the sweep rather than treating the corpus as empty`
    );
  }
  const batch = (await res.json().catch(() => null)) as T[] | null;
  if (!Array.isArray(batch)) {
    throw new Error(
      `brain-ingest ${source}: a page of the existing chunk list was unreadable — ` +
        `aborting before the sweep rather than treating a truncated list as complete`
    );
  }
  return batch;
}

/**
 * The one line a run leaves behind in `cron_run.error_message`: what it did, and
 * whether it finished.
 *
 * `IngestResult.complete` exists because drive computed the flag and dropped it, so
 * a run that fetched one of three documents recorded a byte-identical row to a
 * complete one. The flag now reaches the routes — and every route then dropped it
 * again, which is the same bug one level up. Gmail is what that cost: its walk had
 * never once completed, and 24 consecutive runs recorded `success` with no message,
 * because a converging re-walk is a deliberate skip and deliberate skips said
 * nothing at all.
 *
 * `status` still answers "should anyone worry". This answers "what happened", which
 * is the question you cannot go back and ask. Counts and flags only — never a value.
 */
export function ingestNote(r: IngestResult): string {
  return (
    r.detail ??
    [
      `rows=${r.rows}`,
      `swept=${r.swept}`,
      r.complete === undefined ? null : `complete=${r.complete}`,
      r.skipped ? `skipped=${r.skipped}` : null,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

/**
 * A scope losing EVERY one of its rows at once is an access change, not a cleanup.
 *
 * `meta.owner` on drive, `meta.mailbox` on gmail, `meta.database` on notion: each names
 * where a row came from. Documents do not all get deleted on the same day, so a scope
 * emptying completely means the walk stopped being able to SEE it — a permission
 * revoked, a share removed, a credential swapped.
 *
 * The majority guard below does not cover this. Measured 2026-09-06, drive's largest
 * owner holds 48.5% of the source — it would be deleted whole and the guard would miss
 * it by 1.5 points. And this is not hypothetical: production Drive once listed 24
 * documents where a laptop listed 512, and only the majority guard stopped each run
 * removing the other ~11,000 chunks. At 48% it would not have.
 *
 * Two conditions, because scopes legitimately empty. A one-off file gets unshared and
 * its single row should not block every future sweep — so the vanishing scope must hold
 * BOTH at least 5% of the source AND at least 20 rows before it is read as lost access.
 * Rows with no scope are never judged: absence of evidence is not evidence of deletion.
 */
const SCOPE_VANISH_SHARE = 0.05;
const SCOPE_VANISH_MIN_ROWS = 20;

export async function sweepMissing(
  source: string,
  seenIds: Set<string>,
  opts: { scopeKey?: string } = {}
): Promise<number> {
  const stored: string[] = [];
  /** source_id -> the scope it belongs to, when this source names one. */
  const scopeOf = new Map<string, string>();
  for (let offset = 0; offset < 200_000; offset += 1000) {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,meta&source=eq.${encodeURIComponent(source)}` +
        `&order=source_id.asc&limit=1000&offset=${offset}`
    );
    if (!res.ok) {
      logger.warn({ source, status: res.status }, "brain sweep skipped: could not list stored ids");
      return 0;
    }
    const batch = (await res.json().catch(() => null)) as Array<{
      source_id?: string;
      meta?: Record<string, unknown> | null;
    }> | null;
    if (!Array.isArray(batch)) {
      logger.warn({ source }, "brain sweep skipped: unreadable stored-id page");
      return 0;
    }
    for (const r of batch) {
      if (!r?.source_id) continue;
      stored.push(r.source_id);
      const scope = opts.scopeKey ? r.meta?.[opts.scopeKey] : undefined;
      if (typeof scope === "string" && scope) scopeOf.set(r.source_id, scope);
    }
    if (batch.length < 1000) break;
  }
  if (stored.length === 0) return 0;

  const orphans = stored.filter((id) => !seenIds.has(id));

  if (opts.scopeKey && orphans.length > 0) {
    const held = new Map<string, number>();
    for (const id of stored) {
      const sc = scopeOf.get(id);
      if (sc) held.set(sc, (held.get(sc) ?? 0) + 1);
    }
    const losing = new Map<string, number>();
    for (const id of orphans) {
      const sc = scopeOf.get(id);
      if (sc) losing.set(sc, (losing.get(sc) ?? 0) + 1);
    }
    const vanishing = [...losing.entries()].filter(
      ([sc, n]) =>
        n === held.get(sc) && n >= SCOPE_VANISH_MIN_ROWS && n >= stored.length * SCOPE_VANISH_SHARE
    );
    if (vanishing.length > 0) {
      logger.warn(
        {
          source,
          scopeKey: opts.scopeKey,
          vanishing: vanishing.map(([sc, n]) => `${sc}=${n}`),
          stored: stored.length,
        },
        "brain sweep skipped: an entire scope would disappear at once, which is lost access rather than deleted documents"
      );
      return 0;
    }
  }
  if (orphans.length === 0) return 0;
  if (orphans.length > stored.length - orphans.length) {
    logger.warn(
      { source, orphans: orphans.length, stored: stored.length },
      "brain sweep skipped: it would delete the majority of this source, which is either a mass id change or a broken collection"
    );
    return 0;
  }

  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const list = orphans
      .slice(i, i + 100)
      .map((id) => `"${id.replace(/"/g, '""')}"`)
      .join(",");
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?source=eq.${encodeURIComponent(source)}` +
        `&source_id=in.(${encodeURIComponent(list)})`,
      { method: "DELETE", headers: { Prefer: "return=representation" } }
    );
    if (!res.ok) {
      // Stop rather than continue: a partial failure mid-sweep is not a reason to
      // keep deleting, and whatever is left is swept on the next attempt.
      logger.warn({ source, status: res.status }, "brain sweep failed partway");
      return deleted;
    }
    const gone = (await res.json().catch(() => [])) as unknown[];
    deleted += Array.isArray(gone) ? gone.length : 0;
  }
  return deleted;
}

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
  /**
   * false when the walk did not see everything it meant to — a listing page cap, an
   * export that failed, or the time budget running out mid-fetch.
   *
   * Deliberately NOT a `skipped`, because a partial walk still indexed real work and
   * `skipped` alerts. It exists so the two cases are distinguishable at all: drive
   * computed this flag, logged it, and then dropped it from the result, so a run that
   * fetched one of three documents returned a byte-identical object to a complete one
   * and `cron_run` recorded success for both.
   */
  complete?: boolean;
  /**
   * One line of WHY, for `cron_run.error_message`.
   *
   * Same channel `google-oauth.ts` already uses, and for the same reason: Vercel's
   * log query times out, so a diagnosis that only ever reaches the logs is a
   * diagnosis nobody reads. Recorded whatever the status, so a run that is skipping
   * on purpose still says what it saw. Never a secret — counts and flags only.
   */
  detail?: string;
}
