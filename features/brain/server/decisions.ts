import { createHash } from "node:crypto";

import { supabaseFetch } from "@features/admin/server/supabase";
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

/** The date the row describes, which is the decision's own date and not today's. */
const decidedOnOf = (row: { period_end?: string | null }): string =>
  row.period_end ?? new Date().toISOString().slice(0, 10);

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
   * MARK THE DECISION THIS ONE REPLACES, on the older record itself.
   *
   * `supersedes` was written into the new decision's metadata, its body and the Slack
   * mirror — and read back by nothing. So the REPLACED decision carried no trace of
   * having been replaced, and a reader who searched their way onto it was told, at
   * most, to "prefer the later date" by generic guidance. They would have to already
   * know a later one existed. That is the failure a supersession record exists to
   * prevent, and it was the half that was missing.
   *
   * Superseding is history, not deletion: the old row keeps its text and stays
   * findable, it just now says what replaced it.
   *
   * Never fails the write. The new decision is the thing being recorded; losing it
   * because the back-reference could not be stamped would be the worse trade.
   */
  if (input.supersedes) {
    const older = input.supersedes.trim().replace(/^decision\//, "");
    try {
      const res = await supabaseFetch(
        `/rest/v1/brain_chunk?select=id,meta&source=eq.decision&source_id=eq.${encodeURIComponent(older)}`
      );
      const rows = res.ok
        ? ((await res.json()) as Array<{ id: number; meta: Record<string, unknown> | null }>)
        : [];
      if (rows.length === 0) {
        // Said out loud rather than swallowed: a typo'd id means the new decision
        // claims to replace something that does not exist, and nobody would know.
        logger.warn(
          { supersedes: older, by: row.source_id },
          "brain: a decision claims to supersede an id that is not in the corpus"
        );
      }
      for (const old of rows) {
        await supabaseFetch(`/rest/v1/brain_chunk?id=eq.${old.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            meta: {
              ...(old.meta ?? {}),
              superseded_by: row.source_id,
              superseded_on: decidedOnOf(row),
            },
          }),
        });
      }
    } catch (err) {
      logger.warn({ err, supersedes: older }, "brain: could not mark the superseded decision");
    }
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

/**
 * THE INTERJECTION: a decision the asker may be about to contradict.
 *
 * This is the thing the owner asked for when they said the brain should "notice and speak
 * up". The rule already exists in prose — `search_company_context`'s description and the
 * server instructions both say to check whether something was already decided before
 * proposing a change of direction — but prose is advice a model may or may not act on.
 * This puts the decision in front of it without being asked.
 *
 * LEXICAL ONLY, NO EMBEDDING. This runs on the path of every question, and embedding the
 * query a second time would add 229-411ms to each one. Decisions are titled with the
 * decision text itself, so the title-trigram and ts_rank arms are exactly the right
 * instrument — verified: six phrasings that should match scored 1.69-2.91 with no vector
 * involved.
 *
 * A FLOOR, WHICH THE RANKED SEARCH DELIBERATELY DOES NOT HAVE. An unsolicited claim needs
 * more confidence than a list someone asked for: telling a reader "this was already
 * decided" about something unrelated is a confident wrong answer they did not request,
 * and it is how proactivity stops being trusted. Measured over sixteen questions, the six
 * that should match scored 1.69 and up while the ten that should not topped out at 1.18 —
 * so 1.5 sits between them with margin on both sides.
 *
 * AND THE WORDING SURVIVES BEING WRONG ANYWAY, which matters more than the floor. It says
 * a decision MAY bear on the question and to check, never that the question is settled.
 * A false positive then costs a sentence of reading rather than a wrong answer.
 */
const PRIOR_DECISION_FLOOR = 1.5;

export interface PriorDecision {
  sourceId: string;
  title: string | null;
  decidedOn: string | null;
}

/**
 * Does this question PROPOSE something, as opposed to asking what is true?
 *
 * The rule this whole feature implements is "before proposing a change of direction,
 * check whether it was already decided" — so the lookup only has to run for questions
 * that propose. "How many people signed up last month" cannot contradict a decision.
 *
 * MEASURED, AND THE REASON THE GATE EXISTS AT ALL: the lookup costs 164-200ms against a
 * search that averages about a second, and in testing it produced no true positive that
 * the free path had not already caught — all four proposals put the decision at rank 1-2
 * of the ordinary search, where lifting it out costs nothing. So the lookup is insurance
 * for a corpus with hundreds of decisions competing against 24,000 other chunks, and
 * insurance should not be billed to every question that will never claim on it.
 */
const PROPOSES =
  /\b(should we|should i|shall we|let'?s|can we|could we|we should|why don'?t we|instead of|switch to|move to|propose|proposal|suggest|rethink|reconsider)\b|^should\b/i;

export function proposesSomething(question: string): boolean {
  return PROPOSES.test(question);
}

export async function priorDecisions(question: string): Promise<PriorDecision[]> {
  if (!proposesSomething(question)) return [];
  try {
    const res = await supabaseFetch("/rest/v1/rpc/brain_search", {
      method: "POST",
      body: JSON.stringify({
        query_text: question.slice(0, 1000),
        k: 3,
        sources: ["decision"],
        // Explicitly null: the whole point is to skip the embedding round trip.
        query_embedding: null,
      }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      source_id: string;
      title: string | null;
      period_end: string | null;
      score: number;
    }>;
    return rows
      .filter((r) => Number(r.score) >= PRIOR_DECISION_FLOOR)
      .map((r) => ({ sourceId: r.source_id, title: r.title, decidedOn: r.period_end }));
  } catch (err) {
    // Never allowed to cost the answer. This is an addition to a result that is already
    // complete without it.
    logger.warn({ err }, "brain: could not check for a prior decision");
    return [];
  }
}

/** The block prepended to a search result. Empty string when there is nothing to say. */
export function renderPriorDecisions(found: PriorDecision[]): string {
  if (found.length === 0) return "";
  const lines = found
    .map(
      (d) =>
        // The stored title is "Decision: <the decision>", and the heading above already
        // says as much. Stripped here rather than in the lookup, so a decision that
        // ranked into the results and one that had to be looked up render identically.
        `  • ${String(d.title ?? "(untitled)").replace(/^Decision:\s*/, "")}` +
        `${d.decidedOn ? ` (decided ${d.decidedOn})` : ""}\n    id: decision/${d.sourceId}`
    )
    .join("\n");
  return (
    `PRIOR DECISION${found.length > 1 ? "S" : ""} ON RECORD — this may already be settled:\n\n` +
    `${lines}\n\n` +
    `Read ${found.length > 1 ? "them" : "it"} with \`fetch_document\` before proposing anything ` +
    `that would change direction here. If it does settle the question, say so and say when ` +
    `it was decided rather than re-opening it. If it turns out not to bear on the question, ` +
    `ignore this block — it was matched by wording, not judgement.\n\n` +
    `${"─".repeat(70)}\n\n`
  );
}
