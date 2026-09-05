import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * The `brain_query` table does two jobs, and both are here.
 *
 * 1. IDEMPOTENCY. Slack retries an event it does not see acked, so without a
 *    claim the same question gets answered two or three times -- each answer
 *    spending a request from a 250/day budget. `slack_event_id` is UNIQUE, so the
 *    insert itself is the lock: first writer wins, a duplicate gets 409 and stops.
 *
 * 2. THE DAILY QUOTA LEDGER. The free tier allows 250 requests a day across the
 *    whole team, and running past it means the bot starts erroring instead of
 *    answering. This is deliberately counted in Postgres rather than with
 *    `checkRateLimit`: that helper falls back to an in-memory counter when Upstash
 *    is unconfigured, and an in-memory counter on serverless is per-instance --
 *    which silently does not enforce a global cap at all. A row count is exact,
 *    shared, and survives deploys.
 */

/** Leaves headroom under a 250/day provider limit for retries and manual testing. */
export const DAILY_QUESTION_LIMIT = 220;

export interface ClaimResult {
  /** Row id to finish later, or null when this event was already claimed. */
  id: number | null;
  duplicate: boolean;
}

export async function claimQuestion(input: {
  question: string;
  slackEventId?: string | null;
  slackUserId?: string | null;
  slackChannelId?: string | null;
}): Promise<ClaimResult> {
  try {
    const res = await supabaseFetch("/rest/v1/brain_query", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        question: input.question.slice(0, 4000),
        slack_event_id: input.slackEventId ?? null,
        slack_user_id: input.slackUserId ?? null,
        slack_channel_id: input.slackChannelId ?? null,
      }),
    });

    // 409 is the unique violation on slack_event_id: a Slack retry of a question
    // already in flight or already answered.
    if (res.status === 409) return { id: null, duplicate: true };

    if (!res.ok) {
      logger.error({ status: res.status }, "brain query claim failed");
      // Failing open here is what let TWO deliveries answer: A inserts fine, B's
      // insert 500s or times out, B is told `duplicate: false` and spends a
      // second model request. Only 409 was treated as a duplicate, so any other
      // error looked like a fresh question. One extra read on the error path
      // settles it — if the row exists, this delivery is a retry.
      return { id: null, duplicate: await eventAlreadyClaimed(input.slackEventId) };
    }
    const rows = (await res.json().catch(() => [])) as Array<{ id?: number }>;
    return { id: rows?.[0]?.id ?? null, duplicate: false };
  } catch (err) {
    logger.error({ err }, "brain query claim threw");
    return { id: null, duplicate: await eventAlreadyClaimed(input.slackEventId) };
  }
}

/**
 * Was this Slack event already recorded? Only consulted when the claim INSERT
 * failed for a reason other than the unique violation, so the cost is paid on the
 * error path alone.
 *
 * Fails open (returns false) on its own error: at that point the database is
 * plainly unreachable, and answering twice is a smaller harm than answering never.
 */
async function eventAlreadyClaimed(slackEventId?: string | null): Promise<boolean> {
  if (!slackEventId) return false;
  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_query?select=id&slack_event_id=eq.${encodeURIComponent(slackEventId)}&limit=1`
    );
    if (!res.ok) return false;
    const rows = (await res.json().catch(() => [])) as unknown[];
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

export async function finishQuestion(
  id: number | null,
  outcome: {
    sourceCount?: number;
    latencyMs?: number;
    error?: string | null;
    /**
     * What the reader was actually told. Stored so a wrong answer can be found
     * again — without it, "the brain gave August's question May's revenue" is
     * unprovable after the fact and unfixable in aggregate.
     */
    answer?: string | null;
  }
): Promise<void> {
  if (id == null) return;
  try {
    await supabaseFetch(`/rest/v1/brain_query?id=eq.${id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        answered_at: new Date().toISOString(),
        source_count: outcome.sourceCount ?? null,
        latency_ms: outcome.latencyMs ?? null,
        error: outcome.error ? outcome.error.slice(0, 500) : null,
        // Capped: the point is to be able to read back what was said, not to
        // store a second copy of the corpus.
        answer: outcome.answer ? outcome.answer.slice(0, 4000) : null,
      }),
    });
  } catch (err) {
    // Best-effort: losing the outcome must never lose the answer.
    logger.error({ err }, "brain query finish failed");
  }
}

/**
 * Questions asked since midnight UTC. Returns null when the count cannot be
 * read, so callers can decide -- this one fails OPEN, because refusing to answer
 * because a bookkeeping query failed is worse than briefly overrunning a quota.
 */
export async function questionsToday(): Promise<number | null> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_query?select=id&created_at=gte.${since.toISOString()}`,
      { method: "HEAD", headers: { Prefer: "count=exact", Range: "0-0" } }
    );
    if (!res.ok) return null;
    // PostgREST reports the total as the denominator of Content-Range: "0-0/123".
    const total = res.headers.get("content-range")?.split("/")[1];
    const n = Number(total);
    return Number.isFinite(n) ? n : null;
  } catch (err) {
    logger.error({ err }, "brain quota count failed");
    return null;
  }
}

/**
 * Emails, in any string. `brain_chunk`'s own migration promises "NO PII BEYOND
 * WHAT SLACK ALREADY HAS ... not a name or email" of this table, and that promise
 * was written when the only writer was the Slack route, whose arguments are a
 * question and a Slack user id.
 *
 * The MCP door can carry more: `query_product_data` takes `filters` and `params`,
 * so a perfectly ordinary call is `filters: ["email=eq.someone@example.com"]` --
 * a customer's address, logged verbatim, into a table that promised it holds
 * none. Redacting the VALUE keeps the promise while keeping the diagnostic:
 * `["email=eq.[email]"]` still says which column was filtered and how, which is
 * everything needed to reproduce a call that returned nothing.
 */
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Enough to reproduce a call; far short of storing a second copy of its payload. */
const MAX_ARGS_CHARS = 2000;

/**
 * Tool arguments, redacted and capped, as something `jsonb` will accept.
 *
 * Returns a `{ truncated }` wrapper rather than repairing cut JSON. A half-object
 * patched back to validity is a lie about what was sent, and this column exists
 * to reproduce calls.
 */
function safeArgs(args: Record<string, unknown> | null | undefined): unknown {
  if (!args || Object.keys(args).length === 0) return null;
  let json: string;
  try {
    json = JSON.stringify(args) ?? "null";
  } catch {
    // Circular or otherwise unserialisable. Say so rather than dropping the row.
    return { unserialisable: true };
  }
  const redacted = json.replace(EMAIL_IN_TEXT, "[email]");
  if (redacted.length > MAX_ARGS_CHARS) {
    return { truncated: redacted.slice(0, MAX_ARGS_CHARS) };
  }
  try {
    return JSON.parse(redacted) as unknown;
  } catch {
    // Redaction cannot produce invalid JSON (it only rewrites inside strings), so
    // this is unreachable in practice -- but a logging helper must not be the
    // thing that throws.
    return { truncated: redacted };
  }
}

/**
 * One row per MCP tool call, written AFTER the response has been flushed.
 *
 * A single INSERT rather than `claimQuestion` + `finishQuestion`: that pair's two
 * round trips exist to survive Slack redelivering an un-acked event, and a
 * JSON-RPC `tools/call` is never redelivered. There is nothing to claim, so the
 * second round trip would buy nothing and cost latency on the door that is now
 * the primary interface.
 *
 * `surface` is what makes the two doors separable in one table; it defaults to
 * 'slack' in the schema, so nothing on the Slack path changed.
 *
 * NEVER THROWS. The caller wraps this in `scheduleAfterResponse`, which already
 * catches -- this catches too, because losing a log line must never be able to
 * cost an answer, and a second guard here is cheaper than reasoning about which
 * one fires first.
 */
export async function recordToolCall(input: {
  tool: string;
  /** The human-meaningful argument: the search query, the document id, the table. */
  question: string;
  args?: Record<string, unknown> | null;
  sourceCount?: number | null;
  topScore?: number | null;
  latencyMs: number;
  error?: string | null;
}): Promise<void> {
  try {
    await supabaseFetch("/rest/v1/brain_query", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        surface: "mcp",
        tool: input.tool.slice(0, 100),
        // Redacted like `args`, and for the same reason: `question` is a copy of
        // the search query or the table name, so redacting one and not the other
        // would store the address anyway and the promise would be theatre.
        question: input.question.replace(EMAIL_IN_TEXT, "[email]").slice(0, 4000),
        args: safeArgs(input.args),
        source_count: input.sourceCount ?? null,
        // A finite check, not `?? null`: NaN and Infinity are not valid JSON and
        // PostgREST rejects the whole row, which would lose the record entirely.
        top_score:
          typeof input.topScore === "number" && Number.isFinite(input.topScore)
            ? input.topScore
            : null,
        latency_ms: input.latencyMs,
        error: input.error ? input.error.slice(0, 500) : null,
        // Set on insert: unlike the Slack path there is no later PATCH to fill it.
        answered_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    logger.warn({ err, tool: input.tool }, "mcp: could not record the tool call");
  }
}
