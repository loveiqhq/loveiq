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
      return { id: null, duplicate: false };
    }
    const rows = (await res.json().catch(() => [])) as Array<{ id?: number }>;
    return { id: rows?.[0]?.id ?? null, duplicate: false };
  } catch (err) {
    logger.error({ err }, "brain query claim threw");
    return { id: null, duplicate: false };
  }
}

export async function finishQuestion(
  id: number | null,
  outcome: { sourceCount?: number; latencyMs?: number; error?: string | null }
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
