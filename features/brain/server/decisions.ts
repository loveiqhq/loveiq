import { createHash } from "node:crypto";

import { upsertChunks, type BrainRow } from "@features/brain/server/ingest/upsert";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import logger from "@shared/observability/logger";

/**
 * Writing a decision down, as a first-class searchable record.
 *
 * WHY THIS EXISTS. Measured 2026-09-09, decision records are 593 chunks of 23,935 — 2.5%
 * of the corpus — and every one of them is a by-product of somebody happening to hold a
 * call that Gemini transcribed. A decision taken in chat, or in a conversation with
 * Claude, or in someone's head on the way to work, leaves no record at all. The brain is
 * asked "what did we decide" against a corpus in which decisions are a rounding error
 * competing with 18,675 chunks of email and reference documents.
 *
 * THE STORE IS `brain_chunk`, NOT A NEW TABLE, and that is the whole design. A separate
 * store would need its own retrieval, its own ranking, its own dedup, its own embedding
 * pass and its own place in every tool description. Written as a chunk, a decision is
 * searchable by machinery that already exists and already works — it inherits the person
 * spine, the `since`/`until` filters, `fetch_document`, and the ranking that a week of
 * measurement went into.
 *
 * WHAT IT CANNOT DO. There is one shared bearer token, so `actor` is SELF-DECLARED and
 * unverifiable. It is recorded because an unattributed decision is nearly useless, not
 * because it is proof. Every call's arguments are already stored in `brain_query`, and
 * each write is mirrored to Slack ops, so a wrong or mischievous entry is visible rather
 * than prevented.
 */

export interface DecisionInput {
  decision: string;
  why?: string;
  rejected?: string;
  topic?: string;
  actor: string;
  decidedOn?: string;
  supersedes?: string;
}

export interface DecisionResult {
  id: string;
  sourceId: string;
  decidedOn: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Same decision, same day, same id — so a caller that retries, or two people recording
 * the same call, produce one record rather than two. The hash is over the decision text
 * only: an edited `why` should update the existing record, not fork it.
 */
function idFor(decision: string, decidedOn: string): string {
  const digest = createHash("sha1").update(decision.trim().toLowerCase()).digest("hex");
  return `decision:${decidedOn}-${digest.slice(0, 10)}`;
}

export function buildDecisionRow(input: DecisionInput, now: Date): BrainRow {
  const decidedOn =
    input.decidedOn && ISO_DAY.test(input.decidedOn)
      ? input.decidedOn
      : now.toISOString().slice(0, 10);
  const sourceId = idFor(input.decision, decidedOn);

  /**
   * The title carries the decision itself, not a label.
   *
   * Titles are weighted double in ranking, and the lesson is already paid for elsewhere
   * in this corpus: "Meeting notes: 60 min with Mark - 2026/08/22" shares no word with
   * the question it answers, and the 22 Aug consumer-pivot decision ranked 135th because
   * of it. A record whose title is "Decision: switch to flat pricing, drop the uplift"
   * matches the question someone actually asks.
   */
  const title = `Decision: ${input.decision.trim()}`.slice(0, 300);

  const lines = [
    `Decided on ${decidedOn} by ${input.actor.trim()}.`,
    input.topic ? `Topic: ${input.topic.trim()}` : null,
    "",
    input.decision.trim(),
    input.why ? `\nWhy: ${input.why.trim()}` : null,
    // The house convention, from the onboarding doc: write down what you rejected, not
    // just what you chose. Without it a later reader re-opens the same argument.
    input.rejected ? `\nRejected: ${input.rejected.trim()}` : null,
    input.supersedes ? `\nSupersedes: ${input.supersedes.trim()}` : null,
  ].filter((l): l is string => l !== null);

  return {
    source: "decision",
    source_id: sourceId,
    title,
    url: null,
    body: lines.join("\n"),
    meta: {
      kind: "decision",
      decided_on: decidedOn,
      // Read by `peopleIn` at the shared write path, so a decision joins the person
      // spine without this module knowing anything about identity resolution.
      actor: input.actor.trim(),
      ...(input.topic ? { topic: input.topic.trim().toLowerCase() } : {}),
      ...(input.supersedes ? { supersedes: input.supersedes.trim() } : {}),
    },
    updated_at: now.toISOString(),
    period_end: decidedOn,
  };
}

export async function recordDecision(
  input: DecisionInput,
  now: Date = new Date()
): Promise<DecisionResult> {
  const row = buildDecisionRow(input, now);
  /**
   * ZERO WRITTEN IS A REFUSAL, NOT A NO-OP. `upsertChunks` drops a row whose text
   * matches a credential pattern and logs it, which is right for a 200-row ingest batch
   * and wrong here: this batch is one row, and reporting "Recorded" for a decision that
   * was refused is the exact failure the caller cannot detect and will not retry.
   */
  const written = await upsertChunks([row]);
  if (written === 0) {
    throw new Error(`decision refused at the write path: ${row.source_id}`);
  }

  /**
   * Mirrored to ops immediately, because the owner chose act-freely-and-log over
   * confirm-first. With one shared token a write cannot be attributed to a person, so
   * the compensating control is that it is impossible to do quietly.
   *
   * Never allowed to fail the write: the decision is recorded either way, and losing it
   * because a webhook was down would be the worse outcome.
   */
  try {
    await notifySlack({
      channel: "ops",
      kind: "brain_decision_recorded",
      username: "ops_alerts",
      text:
        `:memo: *Decision recorded* by ${escapeSlack(input.actor)} — ` +
        `${escapeSlack(input.decision.slice(0, 300))}` +
        (input.supersedes ? `\n_supersedes ${escapeSlack(input.supersedes)}_` : ""),
      context: { sourceId: row.source_id, decidedOn: row.period_end ?? null },
    });
  } catch (err) {
    logger.warn({ err, sourceId: row.source_id }, "brain: decision recorded but not mirrored");
  }

  return { id: row.source_id, sourceId: row.source_id, decidedOn: row.period_end as string };
}
