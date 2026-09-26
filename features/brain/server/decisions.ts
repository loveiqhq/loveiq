import { createHash } from "node:crypto";

import { supabaseFetch } from "@features/admin/server/supabase";
import { upsertChunks, type BrainRow } from "@features/brain/server/ingest/upsert";
import { notifySlack, escapeSlack } from "@shared/observability/slack";
import logger from "@shared/observability/logger";
import type { DisputeMark } from "@features/brain/server/radar";

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
  /**
   * Who recorded it, from their own Jarvis sign-in: verified, unlike `actor`, which is
   * whatever the caller typed. Absent when the call came in on the shared token.
   */
  recordedBy?: string;
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

/**
 * A DECISION'S TITLE SAYS WHAT WAS DECIDED, NEVER "DECIDED".
 *
 * "decided" shares its stem with "decide", so a title carrying it matched every "what did
 * we decide about X" question, and titles weigh double. Measured 2026-09-26: a record about
 * the subscription model, titled "...that was decided on 18 May", ranked second for "what
 * did we decide about micro assessments and the consumer pivot" and was lifted into the
 * prior-decision block for it. The body keeps the words as written; only the title changes.
 */
const TITLE_WORDING: Array<[RegExp, string]> = [
  [/\bdecided against\b/gi, "ruled out"],
  [/\bdecided to\b/gi, "chose to"],
  [/\bdecided that\b/gi, "agreed that"],
  [/\bdecided on\b/gi, "settled on"],
  [/\bdecided\b/gi, "agreed"],
  [/\bdecides\b/gi, "chooses"],
  [/\bdeciding\b/gi, "choosing"],
  [/\bdecide\b/gi, "choose"],
];

export function decisionTitle(decision: string): string {
  let worded = decision.trim();
  for (const [pattern, word] of TITLE_WORDING) {
    // Keep a sentence-initial capital: "Decided to" becomes "Chose to".
    worded = worded.replace(pattern, (hit) =>
      hit[0] === hit[0]!.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word
    );
  }
  return `Decision: ${worded}`.slice(0, 300);
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
  const title = decisionTitle(input.decision);

  const recorder = input.recordedBy?.trim() || null;
  const lines = [
    `Decided on ${decidedOn} by ${input.actor.trim()}.`,
    // Said only when it adds something: "decided by Mark, recorded by Mark" is noise.
    recorder && recorder !== input.actor.trim() ? `Recorded by ${recorder}.` : null,
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
      ...(recorder ? { recorded_by: recorder } : {}),
      ...(input.topic ? { topic: input.topic.trim().toLowerCase() } : {}),
      ...(input.supersedes ? { supersedes: input.supersedes.trim() } : {}),
    },
    updated_at: now.toISOString(),
    period_end: decidedOn,
  };
}

/**
 * Mark a decision as replaced by another, on the older record itself: `superseded_by` and
 * `superseded_on` in its meta, which search, fetch_document and the decision blocks all
 * print. Shared by record_decision and the decision radar's settle, so a replaced
 * decision reads the same whichever way it was replaced. Returns how many records it
 * marked (0: no such decision), and throws when a read or a write fails, so a caller
 * that must not half-finish can tell.
 */
export async function markSuperseded(
  olderId: string,
  byId: string,
  onDay: string
): Promise<number> {
  const older = olderId.trim().replace(/^decision\//, "");
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=id,meta&source=eq.decision&source_id=eq.${encodeURIComponent(older)}`
  );
  if (!res.ok) throw new Error(`could not read decision ${older} (${res.status})`);
  const rows = (await res.json()) as Array<{ id: number; meta: Record<string, unknown> | null }>;
  for (const old of rows) {
    const patched = await supabaseFetch(`/rest/v1/brain_chunk?id=eq.${old.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        meta: { ...(old.meta ?? {}), superseded_by: byId, superseded_on: onDay },
      }),
    });
    if (!patched.ok) throw new Error(`could not mark decision ${older} (${patched.status})`);
  }
  return rows.length;
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
      if ((await markSuperseded(older, row.source_id, decidedOnOf(row))) === 0) {
        // Said out loud rather than swallowed: a typo'd id means the new decision
        // claims to replace something that does not exist, and nobody would know.
        logger.warn(
          { supersedes: older, by: row.source_id },
          "brain: a decision claims to supersede an id that is not in the corpus"
        );
      }
    } catch (err) {
      logger.warn({ err, supersedes: older }, "brain: could not mark the superseded decision");
    }
  }

  /**
   * Mirrored to ops immediately, because the owner chose act-freely-and-log over
   * confirm-first, so a write is impossible to do quietly. A signed-in caller is named as
   * the recorder; one on the shared token is not, and the mirror then shows the actor only.
   *
   * Never allowed to fail the write: the decision is recorded either way, and losing it
   * because a webhook was down would be the worse outcome.
   */
  const recorder = input.recordedBy?.trim() || null;
  const decidedBy =
    recorder && recorder !== input.actor.trim() ? ` (decided by ${escapeSlack(input.actor)})` : "";
  try {
    await notifySlack({
      channel: "brain",
      kind: "brain_decision_recorded",
      username: "ops_alerts",
      text:
        `:memo: *Decision recorded* by ${escapeSlack(recorder ?? input.actor)}${decidedBy} — ` +
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
  /** Read out of meeting notes rather than written down by a person. Rendered, because
   *  the interjection is where a false positive is most expensive. */
  mined?: boolean;
  /** `meta.superseded_by`, when a later decision explicitly replaced this one. */
  supersededBy?: string | null;
  /** How many decisions on the same `meta.topic` are dated later, and the newest date. */
  laterOnTopic?: { count: number; newest: string } | null;
  /** `meta.disputed_by`: open conflicts the decision radar found and nobody has settled. */
  disputedBy?: DisputeMark[];
}

/** The radar's marks off a record's meta; anything malformed is left out. */
export function disputesOf(meta: Record<string, unknown> | null): DisputeMark[] {
  const raw = meta?.disputed_by;
  return Array.isArray(raw)
    ? raw.filter(
        (m): m is DisputeMark =>
          typeof m?.id === "string" && typeof m?.why === "string" && typeof m?.on === "string"
      )
    : [];
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

/**
 * "THIS MAY ALREADY BE SETTLED" HAS TO KNOW WHAT IT DOES NOT KNOW.
 *
 * The block above asserts settledness, and on 2026-09-22 it asserted it about a decision
 * that had been reversed: asked whether the survey is free or paid, it produced "split the
 * survey into a short free section and a detailed section after the paywall" (2026-08-04)
 * as the settled answer. The experiment was removed — the survey is 65 free questions with
 * the paywall on the REPORT, and the live counts say so plainly (2,121 submissions against
 * 395 payments). A reader following that block would have restated a dead decision as
 * current policy, which is the most expensive thing this feature can do.
 *
 * `superseded_by` already exists and `renderSources` already prints a SUPERSEDED banner for
 * it — but of 117 decisions exactly one pair carries it, and both of those were written by
 * hand. The 91 MINED ones never get it, because nothing compares a newly mined decision
 * against what it might replace.
 *
 * So this does not claim supersession it cannot prove. It states a fact and lets the
 * reader judge: how many decisions on the same topic are dated LATER than this one. For
 * the survey case that is four, newest 2026-08-28, which is exactly the prompt to go and
 * look. Deliberately NOT a filter and NOT a demotion — a later decision on a topic very
 * often refines rather than reverses, and guessing which would be the same overreach in
 * the other direction.
 *
 * Costs one extra query per interjection, already inside the caller's try/catch, and
 * returns the decisions unchanged if it fails: this is an addition to a result that is
 * complete without it.
 */
async function withLaterOnTopic(
  found: Array<PriorDecision & { topic: string | null }>
): Promise<PriorDecision[]> {
  const topics = [...new Set(found.map((d) => d.topic).filter((t): t is string => Boolean(t)))];
  if (topics.length === 0) return found;
  try {
    const list = topics.map((t) => `"${t.replace(/"/g, "")}"`).join(",");
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=period_end,meta&source=eq.decision` +
        `&meta->>topic=in.(${encodeURIComponent(list)})&order=period_end.desc&limit=1000`
    );
    if (!res.ok) return found;
    const all = (await res.json()) as Array<{
      period_end: string | null;
      meta: { topic?: string };
    }>;
    return found.map((d) => {
      if (!d.topic || !d.decidedOn) return d;
      const later = all.filter(
        (r) => r.meta?.topic === d.topic && (r.period_end ?? "") > (d.decidedOn ?? "")
      );
      return later.length === 0
        ? d
        : { ...d, laterOnTopic: { count: later.length, newest: later[0]!.period_end ?? "" } };
    });
  } catch {
    return found;
  }
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
      // Returned by brain_search and simply not declared here before; retrieve.ts has
      // always read it off the same rows.
      meta: Record<string, unknown> | null;
    }>;
    const found = rows
      .filter((r) => Number(r.score) >= PRIOR_DECISION_FLOOR)
      .map((r) => ({
        sourceId: r.source_id,
        title: r.title,
        decidedOn: r.period_end,
        mined: (r.meta as { origin?: unknown } | null)?.origin === "mined",
        supersededBy:
          typeof (r.meta as { superseded_by?: unknown } | null)?.superseded_by === "string"
            ? ((r.meta as { superseded_by: string }).superseded_by ?? null)
            : null,
        topic:
          typeof (r.meta as { topic?: unknown } | null)?.topic === "string"
            ? (r.meta as { topic: string }).topic
            : null,
        disputedBy: disputesOf(r.meta),
      }));
    return await withLaterOnTopic(found);
  } catch (err) {
    // Never allowed to cost the answer. This is an addition to a result that is already
    // complete without it.
    logger.warn({ err }, "brain: could not check for a prior decision");
    return [];
  }
}

/**
 * IS THIS QUESTION A BROWSE WEARING A SEARCH'S CLOTHES?
 *
 * "What did we decide recently" names no topic, so there is nothing for ranking to match
 * on and the words themselves do the matching -- any record that happens to contain
 * "decision" competes with the decisions. Measured 2026-09-16, that question returned
 * three real decisions out of twelve hits, and the rest were a runbook, a marketing email,
 * an August article plan and a June Slack day. "Recently" was not honoured at all: nothing
 * in the ranking knows the word means anything.
 *
 * The honest answer to that question is a date-ordered list, which is a browse. Detected
 * here rather than in the tool description, because a person asking in their own words
 * never reads the tool description.
 *
 * TIGHT BY DESIGN. A decision word is necessary but not sufficient: the moment the question
 * carries a TOPIC -- "what did we decide about pricing" -- ranking is the right tool and
 * this must stay out of the way. Everything a bare decision question is made of is
 * enumerated below, and anything left over after removing it is a topic.
 */
const DECISION_WORD = /\b(decide|decided|decision|decisions|agreed|agree|settled)\b/i;
const BROWSE_FILLER =
  /\b(what|whats|which|any|are|is|was|were|there|here|did|do|does|have|has|had|we|us|our|i|you|the|a|an|on|about|so|far|lately|recent|recently|latest|new|newly|newest|this|last|past|few|week|weeks|month|months|day|days|today|yesterday|since|then|already|just|been|be|get|got|anything|something|stuff|things?)\b/gi;

export function looksLikeDecisionBrowse(question: string): boolean {
  if (!DECISION_WORD.test(question)) return false;
  const leftover = question
    .replace(DECISION_WORD, " ")
    .replace(BROWSE_FILLER, " ")
    // Punctuation is not a topic. Without this a trailing "?" would read as one.
    .replace(/[^a-z0-9]+/gi, " ")
    .trim();
  return leftover.length === 0;
}

/**
 * The most recent decisions, by the date they were decided.
 *
 * Deliberately NOT a search: no query text, no embedding, no ranking. The question had no
 * topic, so applying one would be inventing it.
 */
export async function recentDecisions(limit = 8): Promise<PriorDecision[]> {
  try {
    const res = await supabaseFetch(
      `/rest/v1/brain_chunk?select=source_id,title,period_end,meta&source=eq.decision` +
        // `source_id` breaks the tie so a day with three decisions lists them in a stable
        // order; without it the same question can return the same three shuffled.
        `&order=period_end.desc,source_id.desc&limit=${limit}`
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      source_id: string;
      title: string | null;
      period_end: string | null;
      meta: Record<string, unknown> | null;
    }>;
    return rows.map((r) => ({
      sourceId: r.source_id,
      title: r.title,
      decidedOn: r.period_end,
      mined: (r.meta as { origin?: unknown } | null)?.origin === "mined",
      disputedBy: disputesOf(r.meta),
    }));
  } catch (err) {
    // Same rule as the prior-decision lookup: an addition to a result that is already
    // complete without it, so it is never allowed to cost the answer.
    logger.warn({ err }, "brain: could not list recent decisions");
    return [];
  }
}

/**
 * WHAT THIS DECISION DOES NOT KNOW ABOUT ITSELF, on both blocks that print decisions.
 *
 * Measured 2026-09-22: asked whether the survey is free or paid, the "may already be
 * settled" interjection produced "Split the survey into a short free section and a
 * detailed section after the paywall" (2026-08-04) as the settled answer. That experiment
 * was removed — the survey is free and the paywall is on the REPORT, and the live counts
 * say so plainly, 2,121 submissions against 395 payments. A reader following the banner
 * would have restated a dead decision as current policy.
 *
 * `superseded_by` already existed and `renderSources` already printed a banner for it, but
 * of 117 decisions exactly one pair carried it and both were written by hand. The 91 mined
 * ones never get it, because nothing compares a newly mined decision against what it might
 * replace.
 *
 * So the second line claims no supersession it cannot prove. It states a countable fact —
 * how many decisions on the same topic are dated later — and lets the reader judge. A
 * later decision on a topic very often refines rather than reverses, and asserting
 * reversal would be the same overreach in the other direction.
 *
 * Shared by both renderers on purpose: the first draft patched only one of them, because
 * the two lines it replaced were identical and `String.replace` takes the first.
 */
function staleness(d: PriorDecision): string {
  return (
    (d.supersededBy
      ? `\n    SUPERSEDED by decision/${d.supersededBy} — read that one instead.`
      : "") +
    (d.laterOnTopic
      ? `\n    ${d.laterOnTopic.count} later decision${d.laterOnTopic.count > 1 ? "s" : ""}` +
        ` on this topic, newest ${d.laterOnTopic.newest} — check before treating this as current.`
      : "") +
    // The decision radar's open findings: a question for a person, said as one.
    (d.disputedBy ?? [])
      .map(
        (m) =>
          `\n    MAY CONFLICT with decision/${m.id}${m.on ? ` (${m.on})` : ""}: ${m.why}` +
          " Nobody has settled which stands; decision_conflicts lists it."
      )
      .join("")
  );
}

/** The browse block, prepended when the question asked for a list rather than a match. */
export function renderRecentDecisions(found: PriorDecision[]): string {
  if (found.length === 0) return "";
  const lines = found
    .map(
      (d) =>
        `  • ${d.decidedOn ?? "undated"}  ${String(d.title ?? "(untitled)").replace(/^Decision:\s*/, "")}` +
        `${d.mined ? " — reconstructed from call notes, not written down by a person" : ""}` +
        `\n    id: decision/${d.sourceId}` +
        staleness(d)
    )
    .join("\n");
  return (
    `THE ${found.length} MOST RECENT DECISIONS, newest first — this question names no topic, ` +
    `so it is a browse and not a search, and these are listed by date rather than matched ` +
    `to wording:\n\n${lines}\n\nThese are the decisions WRITTEN DOWN as decisions; things ` +
    `settled in a thread and never recorded will not be here. To go further back or narrow ` +
    `by topic, use \`browse_context\` with sources=["decision"], or ask about the topic ` +
    `itself. Ranked results for the wording follow.\n\n${"─".repeat(70)}\n\n`
  );
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
        `${d.decidedOn ? ` (decided ${d.decidedOn})` : ""}` +
        // A mined decision is the notes' account of what was settled, not a person
        // writing it down. Unmarked, this block would assert the stronger of the two.
        `${d.mined ? " — reconstructed from call notes, not written down by a person" : ""}` +
        `\n    id: decision/${d.sourceId}` +
        staleness(d)
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
