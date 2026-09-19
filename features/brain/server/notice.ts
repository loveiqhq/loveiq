/**
 * Things worth knowing that nobody asked about.
 *
 * The proactive jobs here all post to Slack: `anomaly-watcher` when a guardrail moves,
 * `conversion-digest` with the funnel, `brain-brief` with what was written yesterday.
 * None of it reaches somebody working in claude.ai, which is the door the team actually
 * uses — so the brain noticed things and then told a channel about them.
 *
 * A CHUNK, NOT A TABLE. `record_decision` settled this argument already: a chunk
 * inherits search, `fetch_document`, `browse_context`, `count_context`, `since`/`until`,
 * `learned_since`, dedup and embeddings, all of it already built and measured. A table
 * needs its own everything. The consequence is the good part:
 * `browse_context({sources:["notice"], order:"recently_learned"})` is a "what changed"
 * tool and it already exists, so nothing new has to be written to read these.
 *
 * A SECOND SINK, NOT A SECOND PIPELINE. `recordNotice` is called beside the existing
 * Slack post, never instead of it and never from a separate computation — two jobs
 * deciding independently what moved is two sources of truth about the same week.
 */
import { createHash } from "node:crypto";
import { supabaseFetch } from "@features/admin/server/supabase";
import { upsertChunks, type BrainRow } from "@features/brain/server/ingest/upsert";
import logger from "@shared/observability/logger";

export const NOTICE_SOURCE = "notice";

/** How recent a notice must be to be pushed at somebody unprompted. */
export const INJECT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Never more than this many, however busy the day. */
export const MAX_INJECTED = 3;

export interface NoticeInput {
  /** One sentence, and it becomes the TITLE — titles are weighted double in ranking. */
  headline: string;
  /** What was actually observed. */
  detail: string;
  /** Which job saw it, e.g. `anomaly-watcher`. */
  kind: string;
  /** Anything a reader would want to check it against. */
  evidence?: string;
}

/** Same notice, same day, same id — a cron that re-runs does not post it twice. */
function noticeId(headline: string, day: string): string {
  const digest = createHash("sha1").update(headline.trim().toLowerCase()).digest("hex");
  return `notice:${day}-${digest.slice(0, 10)}`;
}

export function buildNoticeRow(input: NoticeInput, now: Date): BrainRow {
  const day = now.toISOString().slice(0, 10);
  return {
    source: NOTICE_SOURCE,
    source_id: noticeId(input.headline, day),
    // The headline IS the title, for the same reason a decision's text is: a title of
    // "Notice" would share no word with the question anybody asks.
    title: input.headline.trim().slice(0, 300),
    url: null,
    body: [
      `Noticed on ${day} by ${input.kind}, without being asked.`,
      "",
      input.detail.trim(),
      input.evidence ? `\nEvidence: ${input.evidence.trim()}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join("\n"),
    meta: { kind: "notice", noticed_by: input.kind, noticed_on: day },
    updated_at: now.toISOString(),
    period_end: day,
  };
}

/**
 * Never allowed to cost the caller its real work. These are written beside a Slack post
 * that has already happened or is about to; a failure here must not fail the cron.
 */
export async function recordNotice(input: NoticeInput): Promise<boolean> {
  try {
    const written = await upsertChunks([buildNoticeRow(input, new Date())]);
    return written > 0;
  } catch (err) {
    logger.warn({ err, kind: input.kind }, "brain: could not record a notice");
    return false;
  }
}

/**
 * The notices from the last 24 hours, newest first.
 *
 * Read with a plain PostgREST query rather than through `retrieve()`: this is not a
 * search, it is "what is recent", and routing it through ranking would make which notice
 * appears depend on what the caller happened to ask about.
 */
export async function openNotices(now: number = Date.now()): Promise<OpenNotice[]> {
  try {
    const since = new Date(now - INJECT_WINDOW_MS).toISOString();
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,title,meta,updated_at&source=eq.${NOTICE_SOURCE}` +
        `&updated_at=gte.${encodeURIComponent(since)}&order=updated_at.desc&limit=${MAX_INJECTED}`
    );
    if (!res.ok) return [];
    return (
      (await res.json()) as Array<{
        source_id: string;
        title: string | null;
        meta: Record<string, unknown> | null;
      }>
    ).map((r) => ({
      title: String(r.title ?? "(untitled)"),
      sourceId: r.source_id,
      noticedOn: String(r.meta?.noticed_on ?? ""),
    }));
  } catch (err) {
    // An addition to a result that is already complete without it. Never allowed to cost
    // the answer — the same rule `priorDecisions` follows.
    logger.warn({ err }, "brain: could not read open notices");
    return [];
  }
}

export interface OpenNotice {
  title: string;
  sourceId: string;
  noticedOn: string;
}

/**
 * The block prepended to a read tool's result.
 *
 * Modelled byte-for-byte on `renderPriorDecisions`, and the part that makes that
 * precedent safe to copy is the last sentence: the block describes its own provenance,
 * so a reader can dismiss it without having to guess why it is there. An interjection
 * that does not say why it appeared is indistinguishable from a relevant answer.
 *
 * NO ACKNOWLEDGEMENT STATE. A notice repeats for 24 hours and the block says it is
 * ambient. Per-caller acknowledgement needs a session identity this server does not have
 * — one shared token means "seen by you" would silently mean "seen by anyone on the
 * team", which is worse than repeating.
 */
export function renderOpenNotices(found: OpenNotice[]): string {
  if (found.length === 0) return "";
  const lines = found
    .map((n) => `  • ${n.title} (noticed ${n.noticedOn})\n    id: ${NOTICE_SOURCE}/${n.sourceId}`)
    .join("\n");
  return (
    `NOTICED WITHOUT BEING ASKED — posted on a schedule in the last 24 hours, and not in ` +
    `response to your question:\n\n${lines}\n\n` +
    `Read ${found.length > 1 ? "one" : "it"} with \`fetch_document\`. If none of ${
      found.length > 1 ? "these bears" : "this bears"
    } on what you are doing, ignore this block — it was posted on a timer, not matched to ` +
    `you, and it will appear again for the rest of the day.\n\n${"─".repeat(70)}\n\n`
  );
}
