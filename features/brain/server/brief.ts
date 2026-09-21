/**
 * The ambient layer: what the brain noticed, without anyone asking.
 *
 * Everything else in this system waits to be queried. That only helps people who
 * already suspect there is something to find — which is exactly the knowledge a
 * new joiner, or anyone outside a given thread, does not have.
 *
 * This is deliberately NOT another numbers digest. `conversion-digest` already
 * posts the funnel every morning and `anomaly-watcher` already watches for moves.
 * The gap those leave is everything that is written rather than counted: what was
 * decided in Notion, argued in email, shipped in a commit, said on a call.
 */

import { buildPrompt } from "./answer";
import { complete, isLlmConfigured } from "./llm";
import type { BrainChunk } from "./retrieve";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/**
 * The question the corpus is asked on the company's behalf.
 *
 * Phrased to invite silence. A brief that finds something every single day is a
 * brief nobody reads by the second week, so the prompt has to make "nothing worth
 * your time" an acceptable — and easy — answer.
 */
export const BRIEF_QUESTION = [
  "Below is everything added to the company's records yesterday: commits, email,",
  "Notion, Slack, call notes and documents.",
  "",
  "Tell the team the few things here that someone would actually want to know —",
  "a decision made, a problem found, something shipped, something a customer said.",
  "At most three, fewer if that is the honest answer. One short line each, in plain",
  "English, each citing its source.",
  "",
  "Most days this is routine. If nothing here is worth a colleague's attention,",
  `reply with exactly ${"NOTHING_NOTABLE"} and nothing else. That is a good answer, not a failure.`,
].join("\n");

/** Sentinel the model returns when the day was routine. Checked, not parsed. */
export const NOTHING = "NOTHING_NOTABLE";

/** Per source, so one busy day of email cannot crowd out the single commit that matters. */
const PER_SOURCE = 4;
const MAX_CHUNKS = 24;
/** Enough to see what a chunk is about; the full body would blow the token budget. */
const SNIPPET = 700;

export interface DailyBrief {
  text: string;
  chunks: BrainChunk[];
  day: string;
}

/**
 * Everything dated `day`, balanced across sources.
 *
 * Selected on `period_end` — the date a chunk DESCRIBES — not `updated_at`, which
 * is the ingest stamp and moves on every chunk every run. Using `updated_at` here
 * would return the entire corpus every night.
 */
export async function chunksForDay(day: string): Promise<BrainChunk[]> {
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source,source_id,title,url,body,meta&period_end=eq.${day}` +
      `&order=source.asc&limit=400`
  );
  if (!res.ok) {
    logger.warn({ status: res.status, day }, "brain-brief: could not read the day");
    return [];
  }
  const rows = (await res.json().catch(() => [])) as Array<Record<string, unknown>>;

  const perSource = new Map<string, number>();
  const out: BrainChunk[] = [];
  for (const r of rows) {
    const source = String(r.source ?? "");
    const seen = perSource.get(source) ?? 0;
    if (seen >= PER_SOURCE) continue;
    perSource.set(source, seen + 1);
    out.push({
      source,
      sourceId: String(r.source_id ?? ""),
      title: (r.title as string | null) ?? null,
      url: (r.url as string | null) ?? null,
      body: String(r.body ?? "").slice(0, SNIPPET),
      meta: (r.meta as Record<string, unknown>) ?? {},
      score: 0,
      contentScore: 0,
      // Every row here is `period_end=eq.<day>` by construction, so the date is
      // the day being briefed rather than something that needs selecting.
      periodEnd: day,
    });
    if (out.length >= MAX_CHUNKS) break;
  }
  return out;
}

/**
 * Returns null when there is nothing to say — no material, no model, or a routine
 * day. Null means POST NOTHING. Silence is the design, not a failure path.
 */
export async function buildDailyBrief(day: string): Promise<DailyBrief | null> {
  if (!isLlmConfigured()) return null;

  const chunks = await chunksForDay(day);
  if (chunks.length === 0) return null;

  // Reuses the Q&A prompt on purpose: it already fences every quoted field against
  // prompt injection, and this corpus is exactly as untrusted here as it is there
  // — anyone who can write a commit message or send us an email can put text in it.
  // 100s, not the shared 45s default: see `complete`. brain-brief's maxDuration is
  // raised to match, so the route outlives the call it is waiting on.
  /**
   * RETRY A TRANSIENT REFUSAL, because losing the day is permanent.
   *
   * The caller claims the day's alert slot BEFORE calling this, and only marks it
   * delivered on success or on a deliberate quiet day. So a throw here leaves the
   * claim unmarked and the schedule — which only ever asks for yesterday — never
   * comes back for it. Measured 2026-09-21 by correlating `slack_alert_sent` with
   * `cron_run`: exactly two briefs were never delivered, 2026-09-09 and 2026-09-14,
   * and they are exactly the two days the model refused. Both briefs are gone.
   *
   * One wait, not the miner's loop: this is a single call, and the failures seen
   * were a 503 that cleared in seconds and a daily quota that a retry cannot help.
   * `retryAfterMs` comes from `complete` itself, which already distinguishes the
   * per-minute limit from the daily one.
   */
  let result = await complete(buildPrompt(BRIEF_QUESTION, chunks), 100_000);
  if (
    !result.ok &&
    (result.reason === "overloaded" || result.reason === "rate_limited") &&
    result.retryAfterMs &&
    !result.dailyQuota
  ) {
    // Captured before the closure: `result` is reassigned below, so TypeScript
    // cannot keep the narrowing inside the callback.
    const waitMs = result.retryAfterMs;
    logger.info(
      { reason: result.reason, waitMs },
      "brain-brief: the model refused, waiting once before giving up on the day"
    );
    await new Promise((r) => setTimeout(r, waitMs));
    result = await complete(buildPrompt(BRIEF_QUESTION, chunks), 100_000);
  }
  if (!result.ok) {
    /**
     * THROW, do not return null.
     *
     * Null means "a routine day, post nothing" and the caller marks the day
     * DELIVERED on the strength of it. Returning null here made a broken language
     * model indistinguishable from a quiet one: the brief would go silent, record
     * the day as done, and never retry it. Silence is the design only when the
     * model actually looked and found nothing worth saying.
     */
    /**
     * `detail` is the whole diagnosis and it used to be dropped. The 2026-08-31
     * 06:11 failure logged only "(error)", which spans three very different causes:
     * a timeout, an HTTP status, and the model spending its entire token budget on
     * reasoning. Recovering which one meant matching the run's 46,745 ms against
     * TIMEOUT_MS by hand.
     */
    const detail = result.detail ? `${result.reason}: ${result.detail}` : result.reason;
    throw new Error(`brain-brief: the language model is unavailable (${detail})`);
  }

  const text = result.text.trim();
  if (!text || text.includes(NOTHING)) return null;

  return { text, chunks, day };
}
