/**
 * Reconstruct decisions from the meeting notes nobody wrote down as decisions.
 *
 * The decision record is the best evidence this corpus holds and the thinnest thing in
 * it: FOUR records, against 22,951 chunks. Everything else about what LoveIQ chose is a
 * by-product of somebody happening to hold a call that was transcribed. So asking the
 * brain "did we already decide this" gets a confident answer built on nothing.
 *
 * MEASURED 2026-09-12: 599 summary chunks belong to 121 meeting documents, spanning
 * 2025-12-17 to today, averaging 1,890 characters; 356 of them contain explicit decision
 * language ("decided", "agreed", "we will", "going with"). That is the material.
 *
 * PRECISION IS THE WHOLE PROBLEM, because the pressure-tester is exactly where a false
 * positive is most expensive. Telling someone "we decided the opposite in June" when June
 * was a passing remark in a call is how proactivity stops being trusted, permanently.
 * Five mechanisms, and the first is the one that does the work:
 *
 *   1. EXTRACT, NEVER INFER, ENFORCED BY STRING MATCH AND NOT BY PROMPT. The model must
 *      return a verbatim `quote` from the summary. It is checked with `includes()` after
 *      the call and dropped if it is not there. A fabricated decision cannot produce a
 *      real span, so this catches invention completely, and it costs six lines.
 *   2. `settled` as a hard gate. A discussed-but-open item is NOT written as a weaker
 *      decision -- a weak decision record is the failure mode, not a lesser success.
 *   3. At most three per meeting. A call that "decided" nine things decided nothing; the
 *      model is over-firing and the overflow is logged rather than kept.
 *   4. A closed topic enum. An open string yields "pricing" / "price" / "pricing-test"
 *      and every grouping downstream silently fails.
 *   5. Hand-grading before this is trusted -- see the runbook.
 *
 * PROVENANCE IS NOT OPTIONAL. The server's own instructions promise that a decision
 * record is "deliberate rather than reconstructed from a transcript", so mining silently
 * would break that promise for every consumer. Mined rows carry `meta.origin = "mined"`
 * and render a RECONSTRUCTED line.
 */
import { decisionTitle } from "@features/brain/server/decisions";
import { createHash } from "node:crypto";
import { buildDecisionRow } from "@features/brain/server/decisions";
import { complete, isLlmConfigured } from "@features/brain/server/llm";
import { upsertChunks, type BrainRow } from "@features/brain/server/ingest/upsert";
import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";

/** Bump to re-mine everything: the prompt or the rules changed. */
export const MINER_VERSION = 1;

/**
 * A CLOSED SET. An open `topic` string produces "pricing", "price" and "pricing-test"
 * for the same subject, after which ordering decisions within a topic -- the thing the
 * pressure-tester actually needs -- silently returns one of three partial histories.
 */
export const TOPICS = [
  "pricing",
  "paywall",
  "report",
  "landing",
  "survey",
  "brand",
  "hiring",
  "tooling",
  "data",
  "legal",
  "growth",
  "other",
] as const;
export type Topic = (typeof TOPICS)[number];

/** At most this many decisions per meeting; see mechanism 3 above. */
export const MAX_PER_MEETING = 3;

export interface MinedDecision {
  decision: string;
  why?: string;
  rejected?: string;
  topic: Topic;
  quote: string;
  settled: boolean;
}

interface MeetingDoc {
  sourceId: string;
  title: string;
  text: string;
  decidedOn: string;
  editedAt: string | null;
  people: string[];
}

/** Exported so a test and a dry run drive the REAL prompt, not a paraphrase of it. */
export const SYSTEM = [
  "You read the notes from one meeting and extract only the decisions that were SETTLED in it.",
  "",
  "A decision is a choice the company made: to do a thing, to stop a thing, to pick one option over another.",
  "It is NOT: a task somebody took on, a question raised, an idea floated, a fact reported, or a plan to decide later.",
  "",
  "For every decision you return a `quote`: a VERBATIM span copied character-for-character out of the notes,",
  "the sentence that shows the decision was made. It is checked against the notes automatically and anything",
  "that does not appear in them exactly is discarded, so copy, never paraphrase.",
  "",
  "Set `settled` to false for anything still open. Only settled ones are kept. It is entirely normal for a",
  "meeting to settle nothing — return an empty list rather than promoting a discussion to a decision.",
  "Return at most three; if a meeting appears to settle more than three things, it is a discussion.",
  "",
  "Write `decision` as one plain sentence someone could search for, naming the subject rather than referring",
  'to it — "switch report pricing to a flat 29" beats "we will go with the flat option".',
  "",
  `Answer as JSON only: {"decisions":[{"decision":"...","why":"...","rejected":"...","topic":"...","quote":"...","settled":true}]}`,
  `\`topic\` is exactly one of: ${TOPICS.join(", ")}.`,
].join("\n");

/** Whitespace-insensitive containment. The model reflows line breaks even when copying. */
function contains(haystack: string, needle: string): boolean {
  const flat = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
  return flat(haystack).includes(flat(needle));
}

export function parseMined(
  raw: string,
  summary: string
): {
  kept: MinedDecision[];
  dropped: Array<{ decision: string; why: string }>;
} {
  const kept: MinedDecision[] = [];
  const dropped: Array<{ decision: string; why: string }> = [];
  let parsed: unknown;
  try {
    // Models fence JSON even when told not to.
    const body = raw.replace(/^```(?:json)?/i, "").replace(/```\s*$/, "");
    parsed = JSON.parse(body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1));
  } catch {
    return { kept, dropped: [{ decision: "(unparseable)", why: "the model did not return JSON" }] };
  }
  const list = (parsed as { decisions?: unknown }).decisions;
  if (!Array.isArray(list)) return { kept, dropped };

  for (const item of list) {
    const d = item as Partial<MinedDecision>;
    const decision = typeof d.decision === "string" ? d.decision.trim() : "";
    const quote = typeof d.quote === "string" ? d.quote.trim() : "";
    if (!decision) continue;
    if (d.settled !== true) {
      dropped.push({ decision, why: "not settled" });
      continue;
    }
    if (!quote) {
      dropped.push({ decision, why: "no quote" });
      continue;
    }
    /**
     * THE CHECK THAT MAKES THIS TRUSTWORTHY. A fabricated decision cannot produce a span
     * that is actually in the notes, so this catches invention completely — and it is a
     * string comparison, not a prompt instruction the model may or may not honour.
     */
    if (!contains(summary, quote)) {
      dropped.push({ decision, why: "the quote is not in the notes" });
      continue;
    }
    const topic = (TOPICS as readonly string[]).includes(String(d.topic))
      ? (d.topic as Topic)
      : "other";
    kept.push({
      decision,
      why: typeof d.why === "string" && d.why.trim() ? d.why.trim() : undefined,
      rejected: typeof d.rejected === "string" && d.rejected.trim() ? d.rejected.trim() : undefined,
      topic,
      quote,
      settled: true,
    });
  }

  if (kept.length > MAX_PER_MEETING) {
    for (const over of kept.slice(MAX_PER_MEETING)) {
      dropped.push({ decision: over.decision, why: `over the ${MAX_PER_MEETING}-per-meeting cap` });
    }
    return { kept: kept.slice(0, MAX_PER_MEETING), dropped };
  }
  return { kept, dropped };
}

/**
 * Which meetings have been read, so a quiet meeting is not re-read every night forever.
 *
 * A TABLE, NOT A CHUNK. The first design put a tombstone in `brain_chunk` under a source
 * of its own, reasoning that a new source is invisible to everything already written.
 * MEASURED, it is not: `list_sources` could be taught to ignore it, but `brain_search`
 * searches every source by default and returned it — 121 rows titled "Scanned for
 * DECISIONS" surfacing on the exact word the decision record exists to answer.
 */
async function markMined(sourceId: string, found: number): Promise<void> {
  const res = await supabaseFetch("/rest/v1/brain_mine_log", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([
      { source_id: sourceId, miner_v: MINER_VERSION, mined_at: new Date().toISOString(), found },
    ]),
  });
  if (!res.ok) {
    // Worth shouting about: silently failing to record the read means this meeting is
    // mined again tomorrow, and every night after, spending the whole quota on one call.
    logger.error({ sourceId, status: res.status }, "brain: could not record a mined meeting");
  }
}

/**
 * Keep the decision; keep the figure out of the TITLE.
 *
 * Mining changed how findable a buried fact is, and that is a different thing from who
 * may read it. Corpus access is open by a decision recorded twice, and nothing here
 * restricts it — the full text stays in the body. But a person writing a decision by hand
 * CHOOSES what goes in the title, and the miner does not: it lifted "Eman accepted a
 * starting compensation rate of 650" straight into one, and titles are weighted double,
 * so the single word "compensation" returned a named colleague's pay as the top hit in
 * the whole corpus. That salience is an accident of automation, not a decision anybody
 * made.
 *
 * WHAT THIS DOES AND DOES NOT DO, measured 2026-09-23 because an earlier reading of this
 * comment promised more. It keeps the figure out of TITLE-ONLY surfaces — the recent- and
 * prior-decision blocks, `browse_context` — where a list of titles would otherwise read as
 * a pay table. It does not stop a search for "compensation" ranking the record first, and
 * search prints the body, figure included: the word stays in the title, which is right,
 * because "what did we decide about Eman's rate" must still find it. Under the open-access
 * decision that is intended — the body is the record. If the goal ever becomes keeping an
 * individual's pay out of search, the record has to go, not its title.
 *
 * Deterministic, like the verbatim-quote gate beside it: a prompt instruction is a
 * request, and this needs to hold on every row. Only fires when all three are true — a
 * roster name, pay or equity language, and an actual figure — so a decision that merely
 * mentions money ("cap the report at 29") is untouched.
 */
const PAY_CONTEXT =
  /\b(compensat\w*|salar\w*|\bpay\b|\bpaid\b|\brate\b|equity|vesting|stake|shares?)\b/i;
const FIGURE = /\b\d[\d.,]{1,}\b|\b\d+\s*%/;

export function titleFor(decision: string, roster: string[]): string {
  /**
   * FIRST NAMES TOO. The roster holds canonical full names — "Eman Cickusic" — and a
   * meeting transcript says "Eman". The first version matched only the full name, so it
   * ran over 22 mined decisions and changed NONE of them, including the one it was
   * written for. A guard that cannot match the case that motivated it is the quiet kind
   * of broken: green, silent, and useless.
   *
   * Case-sensitive and word-bounded, so the verb "mark" is not the colleague Mark. A
   * false positive here costs one masked figure in one title, which is the cheap
   * direction to be wrong in.
   */
  const candidates = roster.flatMap((n) => {
    const first = n.trim().split(/\s+/)[0] ?? "";
    return first.length >= 3 ? [n, first] : [n];
  });
  const names = candidates.filter(
    (n) => n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(decision)
  );
  if (names.length === 0 || !PAY_CONTEXT.test(decision) || !FIGURE.test(decision)) {
    return decisionTitle(decision);
  }
  // The figure is replaced, not the name and not the subject: "what did we decide about
  // Eman's rate" must still find this, and the body still holds the number.
  const masked = decision.replace(FIGURE, "(the figure is in the record)");
  return decisionTitle(masked);
}

export function buildMinedRows(
  doc: MeetingDoc,
  mined: MinedDecision[],
  now: Date,
  roster: string[] = []
): BrainRow[] {
  return mined.map((m) => {
    const row = buildDecisionRow(
      {
        decision: m.decision,
        why: m.why,
        rejected: m.rejected,
        topic: m.topic,
        /**
         * NEVER a named person on the strength of a transcript. Attendance is not
         * authorship: the person who said a sentence in a call is not necessarily the
         * one who decided, and attributing it wrongly is worse than not attributing it.
         */
        actor: `meeting notes, ${doc.decidedOn}`,
        decidedOn: doc.decidedOn,
      },
      now
    );
    return {
      ...row,
      title: titleFor(m.decision, roster),
      // The body says it too, so a reader who sees only the text still knows.
      body: `${row.body}\n\nReconstructed from meeting notes, not written down by a person.\nQuoted from the notes: "${m.quote}"`,
      meta: {
        ...row.meta,
        origin: "mined",
        mined_from: doc.sourceId,
        mined_at: now.toISOString(),
        miner_v: MINER_VERSION,
        quote: m.quote,
        ...(doc.people.length ? { people: doc.people } : {}),
      },
    };
  });
}

/** Meeting documents that have never been scanned, or were scanned by an older miner. */
export async function unminedMeetings(limit: number): Promise<MeetingDoc[]> {
  const scanned = new Map<string, number>();
  const seen = await supabaseFetch("/rest/v1/brain_mine_log?select=source_id,miner_v&limit=2000");
  if (seen.ok) {
    for (const row of (await seen.json()) as Array<{ source_id: string; miner_v: number }>) {
      scanned.set(row.source_id, Number(row.miner_v ?? 0));
    }
  }

  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source_id,title,body,period_end,meta&source=eq.drive` +
      // `source_id` sorts a document's own parts into sequence -- `doc:X#2` after
      // `doc:X#1`. Ordering by date alone splices one meeting's notes together in
      // whatever order the rows happened to come back in.
      `&meta->>section=eq.summary&order=source_id.asc&limit=1200`
  );
  if (!res.ok) throw new Error(`could not read meeting summaries (${res.status})`);
  const rows = (await res.json()) as Array<{
    source_id: string;
    title: string | null;
    body: string;
    period_end: string | null;
    meta: Record<string, unknown> | null;
  }>;

  // 599 summary CHUNKS are 121 meeting DOCUMENTS. One call per meeting, not per chunk.
  const byDoc = new Map<string, MeetingDoc>();
  for (const r of rows) {
    const docId = `drive/${r.source_id.split("#")[0]}`;
    const prev = byDoc.get(docId);
    const people = Array.isArray(r.meta?.people) ? (r.meta.people as string[]) : [];
    if (prev) {
      prev.text += `\n${r.body}`;
      continue;
    }
    byDoc.set(docId, {
      sourceId: docId,
      title: (r.title ?? "a meeting").replace(/^Meeting notes:\s*/i, "").slice(0, 200),
      text: r.body,
      decidedOn: r.period_end ?? new Date().toISOString().slice(0, 10),
      editedAt: typeof r.meta?.edited === "string" ? r.meta.edited : null,
      people,
    });
  }

  return (
    [...byDoc.values()]
      .filter((d) => (scanned.get(d.sourceId) ?? -1) < MINER_VERSION)
      // Newest meetings first: if the backlog never fully drains, the decisions that are
      // still live are the ones worth having. Sorted after grouping, because the query
      // now orders by source_id to keep each document's parts in sequence.
      .sort((a, b) => b.decidedOn.localeCompare(a.decidedOn))
      .slice(0, limit)
  );
}

export interface MineResult {
  scanned: number;
  written: number;
  dropped: number;
  skipped: string | null;
}

/**
 * Wall-clock one run may spend. The route's `maxDuration` is 300s; this leaves ~60s for
 * the last meeting's writes and the cron_run record. A parameter rather than a constant
 * so a test can shrink it to milliseconds and a manual backfill can raise it.
 */
export const DEFAULT_MINE_BUDGET_MS = 240_000;

/** Consecutive quota waits before we conclude the window is not going to clear. */
const MAX_QUOTA_WAITS = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mineDecisions(
  limit: number,
  budgetMs: number = DEFAULT_MINE_BUDGET_MS
): Promise<MineResult> {
  const deadline = Date.now() + budgetMs;
  if (!isLlmConfigured()) {
    return { scanned: 0, written: 0, dropped: 0, skipped: "BRAIN_LLM_KEY is not set" };
  }
  const docs = await unminedMeetings(limit);
  if (docs.length === 0) return { scanned: 0, written: 0, dropped: 0, skipped: null };

  /**
   * The person registry, read once per run. `titleFor` needs it to tell "Eman accepted a
   * rate of 650" from "cap the report at 29" — without it the guard has no name to match
   * and silently never fires, which is the quiet kind of broken.
   */
  const roster = await supabaseFetch("/rest/v1/brain_person?select=canonical&kind=eq.person")
    .then(async (r) =>
      r.ok ? ((await r.json()) as Array<{ canonical: string }>).map((p) => p.canonical) : []
    )
    .catch(() => [] as string[]);
  if (roster.length === 0) {
    logger.warn(
      {},
      "brain: mining with an empty roster — pay figures will not be kept out of titles"
    );
  }

  const now = new Date();
  let read = 0;
  let written = 0;
  let dropped = 0;

  // An INDEX loop, not `for...of`, because a quota wait has to re-read the SAME meeting.
  // With `for...of` the natural `continue` advances the iterator, silently skipping the
  // one document we paused for -- it would never be read and never be tombstoned either.
  let index = 0;
  let waits = 0;
  while (index < docs.length) {
    if (Date.now() >= deadline) {
      // Out of clock, not out of quota. The remaining meetings keep no tombstone and
      // are simply first in line tomorrow.
      logger.info({ read, remaining: docs.length - index }, "brain: mining out of time");
      return { scanned: read, written, dropped, skipped: "out_of_time" };
    }
    const doc = docs[index];
    if (!doc) break; // unreachable: `index < docs.length`. Satisfies noUncheckedIndexedAccess.
    const summary = doc.text.slice(0, 8000);
    const res = await complete(
      [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Meeting: ${doc.title}\nDate: ${doc.decidedOn}\n\nNotes:\n${summary}`,
        },
      ],
      60_000
    );
    if (!res.ok) {
      // A PER-MINUTE limit is not a per-day one. The free tier allows five requests a
      // minute per model and says exactly that on the 429, with how long to wait:
      //   quotaId  GenerateRequestsPerMinutePerProjectPerModel-FreeTier   value 5
      //   retryDelay "32s"
      // Treating it as terminal is why this cron mined five meetings a night and closed
      // every single run with "stopped early: rate_limited" -- draining a 121-meeting
      // backlog in ~35 days rather than ~6. Half a minute of a 300s budget nobody else
      // is waiting on buys the next five meetings, so wait and re-read this one.
      /**
       * `overloaded` waits on the same terms as a quota.
       *
       * A 503 from the model is "come back in a moment" and used to be treated as
       * terminal, which is how two nights running ended with
       * `stopped early: error:HTTP 503` after reading nothing. The wait budget,
       * the deadline and the same-`index` retry below are all already correct for
       * this; it only ever needed to be let through the door.
       */
      if (
        (res.reason === "rate_limited" || res.reason === "overloaded") &&
        res.retryAfterMs &&
        waits < MAX_QUOTA_WAITS &&
        Date.now() + res.retryAfterMs < deadline
      ) {
        logger.info(
          { waitMs: res.retryAfterMs, read, waits: waits + 1, reason: res.reason },
          res.reason === "overloaded"
            ? "brain: mining paused while the model is overloaded"
            : "brain: mining paused for the per-minute quota"
        );
        await sleep(res.retryAfterMs);
        waits += 1;
        continue; // same `index` — this meeting has not been read yet
      }
      // A rate limit is not an empty meeting. Stop the run rather than tombstone
      // documents as "nothing found" when nothing was actually read.
      //
      // `scanned` counts MEETINGS READ. It reported `written + dropped` here, which
      // counts decisions: a run that stopped after three meetings having found two
      // decisions reported "scanned 2", and a run that stopped on the first call
      // reported 0 whether it had read nothing or found nothing. Two different states
      // rendering as one number is the failure this file spends its comments on.
      /**
       * Name WHICH limit stopped the run.
       *
       * `res.reason` is `rate_limited` for both the per-minute cap and the daily one, so
       * `cron_run.error_message` read "stopped early: rate_limited" either way -- and the
       * two want opposite fixes. A per-minute stop means the wait budget ran out and
       * should be raised; a daily stop means this cron is scheduled in the wrong part of
       * the Pacific day and no budget will help. Four runs' worth of that message could
       * not distinguish them, which is why the drain sat at 19 of 123 documents with no
       * way to tell why from the outside.
       *
       * An ABSENT `dailyQuota` stays the bare `rate_limited`. Calling an unknown limit
       * "per-minute" would be a claim the provider never made -- the same collapse of two
       * states into one name that this whole change exists to undo.
       */
      const stopped =
        res.reason !== "rate_limited" || res.dailyQuota === undefined
          ? /**
             * ...and the same argument for the `error` bucket, which collapses an HTTP
             * 500, a network failure and an unparseable response into one word. On
             * 2026-09-17 this run reported the bare "error" and there was no way to tell
             * which from the outside — the exact complaint above, one bucket over.
             * `detail` already carries "HTTP 500"; nothing read it.
             */
            res.reason === "error" && res.detail
            ? `error:${res.detail.slice(0, 60)}`
            : res.reason
          : res.dailyQuota
            ? "rate_limited_daily"
            : "rate_limited_minute";
      logger.warn({ reason: stopped, read, doc: doc.sourceId }, "brain: mining stopped");
      return { scanned: read, written, dropped, skipped: stopped };
    }
    // The window cleared, so the budget of waits starts over. Without this reset a run
    // long enough to hit the quota eight separate times would stop on the eighth even
    // though every one of them had cleared.
    waits = 0;
    read += 1;
    const { kept, dropped: rejected } = parseMined(res.text, summary);
    dropped += rejected.length;
    for (const r of rejected) {
      logger.info(
        { doc: doc.sourceId, decision: r.decision.slice(0, 80), why: r.why },
        "brain: mined decision dropped"
      );
    }
    const rows = buildMinedRows(doc, kept, now, roster);
    if (rows.length) await upsertChunks(rows);
    await markMined(doc.sourceId, rows.length);
    written += rows.length;
    index += 1;
  }

  return { scanned: read, written, dropped, skipped: null };
}
