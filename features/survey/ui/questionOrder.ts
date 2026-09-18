import { isRandomised } from "@features/survey/questionFlags";
import type { QuestionOrderArm } from "@shared/experiments/questionOrderArm";

import type { SurveyQuestion } from "@/data/survey-data";

/** The email-capture question. Asked at the END of the flow — see below. */
export const EMAIL_QID = "00000";
/** The marketing opt-in. Stays the final question; email sits right before it. */
export const OPT_IN_QID = "16015";

/**
 * Move the email question to the end of the survey.
 *
 * `data/survey-data.ts` is generated in qId order (`scripts/update-survey.js`
 * sorts by qId), which puts email at index 0. We ask it last instead: the
 * question lands immediately BEFORE the marketing opt-in, which stays the final
 * question.
 *
 * This was a 50/50 A/B ("first" vs "last", `survey-email-position-ab`) until
 * 2026-08-16, when "last" shipped to everyone and the arm/cookie/stamping was
 * removed. Kept as a render-time reorder rather than a data change because the
 * generator's qId sort would undo any row move in `data/survey-source.csv`.
 *
 * Pure: length and the relative order of every other question are preserved,
 * and the email question appears exactly once.
 */
export function orderEmailLast(questions: SurveyQuestion[]): SurveyQuestion[] {
  const email = questions.find((q) => q.qId === EMAIL_QID);
  if (!email) return questions; // defensive: nothing to move

  const rest = questions.filter((q) => q.qId !== EMAIL_QID);
  const optInIdx = rest.findIndex((q) => q.qId === OPT_IN_QID);
  if (optInIdx === -1) return [...rest, email]; // fallback: truly last

  return [...rest.slice(0, optInIdx), email, ...rest.slice(optInIdx)];
}

/**
 * The demand block: C9, C10 and C12 from the "Archetype Machine" work order.
 * Authored order is the order they must be asked in — C10 refers back to C9's picks.
 */
export const DEMAND_BLOCK_QIDS: readonly string[] = ["16016", "16017", "16018"];

/**
 * Move the demand block to sit immediately before the email question.
 *
 * WHY THESE IDS. Every id below `16015` was unavailable: 16005, 16006, 16007, 16009 and
 * 16011-16014 belong to live questions, and 16003/16004/16008 are retired but still hold
 * real answers (322, 322 and 1,963). Reusing a retired id would merge new responses into
 * historical ones under the same `survey_question` row, which is unrecoverable after the
 * fact. So the block was allocated above the marketing opt-in instead.
 *
 * WHY A RENDER-TIME MOVE. `data/survey-data.ts` is generated in qId order, so without
 * this the block renders AFTER `16015` — and the opt-in has to stay last. This is the
 * same reason `orderEmailLast` exists rather than a row move in `data/survey-source.csv`:
 * `scripts/update-survey.js` sorts by qId and would undo any authored reordering on the
 * next regeneration.
 *
 * Pure and total: returns a permutation — same length, same members, no duplicates — and
 * preserves both the relative order of every other question and the block's own order.
 */
export function orderDemandBlockBeforeEmail(questions: SurveyQuestion[]): SurveyQuestion[] {
  const block = DEMAND_BLOCK_QIDS.map((qId) => questions.find((q) => q.qId === qId)).filter(
    (q): q is SurveyQuestion => q !== undefined
  );
  if (block.length === 0) return questions; // nothing to move

  const rest = questions.filter((q) => !DEMAND_BLOCK_QIDS.includes(q.qId));
  // Prefer the email question as the anchor; fall back to the opt-in when email has been
  // prefilled away, so the block never lands after the final question either way.
  const emailIdx = rest.findIndex((q) => q.qId === EMAIL_QID);
  const anchorIdx = emailIdx !== -1 ? emailIdx : rest.findIndex((q) => q.qId === OPT_IN_QID);
  if (anchorIdx === -1) return questions; // defensive: no anchor, leave untouched

  return [...rest.slice(0, anchorIdx), ...block, ...rest.slice(anchorIdx)];
}

/**
 * C13 variant — the opening order the teardown proposes, exactly as specified.
 *
 * Slots 1-8. `00001` (name) and `01002` (satisfaction baseline) are unchanged;
 * the five promoted questions are high-signal trait items, and `02002` sits at
 * slot 7 as a deliberate spacer so no two Communication Style questions
 * (`10003`, `10004`, `10005`) end up adjacent.
 */
export const C13_OPENING: readonly string[] = [
  "00001",
  "01002",
  "03011",
  "10005",
  "11004",
  "10004",
  "02002",
  "10003",
];

/**
 * The four questions the variant removes from the opening. `02002` is NOT here:
 * it stays, moved to slot 7.
 *
 * `01006` ("Sex often hurts or feels physically bad for me") is the reason the
 * experiment exists — it ends 5.1% of the sessions that reach it at slot 4 — and
 * the spec requires it land after position 20.
 */
export const C13_DEMOTED: readonly string[] = ["01005", "01006", "02001", "02003"];

/**
 * Where the demoted four are re-inserted: immediately after this question, in
 * their original relative order.
 *
 * OPEN DECISION. The specification leaves the exact landing slots to be confirmed
 * with Mark, saying only "vacated slot around 16-34" and, for `01006`, "after
 * question 20". `10002` puts all four in the region the promoted questions came
 * from and satisfies the one hard constraint. It is a single constant precisely
 * so the answer costs one line — and `c13OpeningOrder.test.ts` asserts the
 * constraint holds whatever it is changed to.
 */
export const C13_DEMOTED_AFTER = "10002";

/**
 * Reorder the survey into the C13 variant opening.
 *
 * Keyed entirely on qIds, never indices: the specification's own position numbers
 * were already one out by the time it was built, because `03014` was retired on
 * 11 September and every question after it shifted up. Anything index-based would
 * have silently reordered the wrong questions.
 *
 * Pure and total. Returns a permutation — same length, same members, no
 * duplicates — and returns the input untouched if any question it needs is
 * absent, so a prefilled or hidden question can never produce a partial reorder.
 */
export function orderC13Opening(questions: SurveyQuestion[]): SurveyQuestion[] {
  const byId = new Map(questions.map((entry) => [entry.qId, entry]));
  const needed = [...C13_OPENING, ...C13_DEMOTED, C13_DEMOTED_AFTER];
  if (!needed.every((qId) => byId.has(qId))) return questions;

  const opening = C13_OPENING.map((qId) => byId.get(qId)!);
  const demoted = C13_DEMOTED.map((qId) => byId.get(qId)!);

  const placed = new Set<string>([...C13_OPENING, ...C13_DEMOTED]);
  const remainder = questions.filter((entry) => !placed.has(entry.qId));

  const anchorIdx = remainder.findIndex((entry) => entry.qId === C13_DEMOTED_AFTER);
  if (anchorIdx === -1) return questions; // defensive: anchor was itself promoted

  return [
    ...opening,
    ...remainder.slice(0, anchorIdx + 1),
    ...demoted,
    ...remainder.slice(anchorIdx + 1),
  ];
}

/**
 * The order the survey is actually ASKED in — the whole render-time pipeline, in one
 * place, for one respondent's arm.
 *
 * Every reorder here is render-time rather than a row move in `data/survey-source.csv`,
 * because `scripts/update-survey.js` sorts by qId and would undo any authored ordering on
 * the next regeneration. That means the asked order exists ONLY as this composition, and
 * anything that needs to know it — the engine, an end-to-end walk — has to reproduce it.
 *
 * WHY THIS IS A FUNCTION AND NOT THREE CALLS AT EACH SITE. Reproducing it by hand has
 * already failed silently twice. `e2e/survey.spec.ts` kept expecting email first for the
 * three weeks after `orderEmailLast` shipped (see the note at its Q1 assertion), and the
 * demand block broke the two specs that rebuild the order from `orderEmailLast` alone.
 * Neither was reported, because E2E is not a CI gate. One exported composer is the only
 * version of this that cannot drift: a new stage is added here and every caller gets it.
 *
 * `arm` is REQUIRED, not defaulted. A default would let a caller forget the experiment
 * exists and silently describe every respondent as control — which is the same class of
 * bug as rebuilding the pipeline by hand, just quieter.
 *
 * The C13 reorder runs LAST but still before any filtering, so it always sees the full
 * set it was specified against; applying it after a filter would let one prefilled or
 * hidden question turn the whole reorder into a no-op via its completeness guard.
 */
export function orderAskedQuestions(
  questions: SurveyQuestion[],
  arm: QuestionOrderArm
): SurveyQuestion[] {
  const base = orderDemandBlockBeforeEmail(orderEmailLast(questions));
  return arm === "variant" ? orderC13Opening(base) : base;
}

/**
 * FNV-1a, 32-bit. Turns a seed string into an integer for `mulberry32`.
 *
 * Not a security primitive and not used as one — it only needs to spread similar
 * inputs (one session id, thirteen different qIds) to visibly different streams.
 */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG. Returns values in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The options of `question`, in the order this session should see them.
 *
 * Randomised only for questions in `RANDOMISE_QIDS`; everything else is returned
 * untouched, in authored order.
 *
 * Seeded from the session id AND the qId, never from `Math.random()`. Two reasons this
 * matters rather than being a style preference:
 *
 *  1. STABILITY. The order has to survive re-render, going back to a question, and a
 *     page reload — a respondent who sees the options jump has been handed a different
 *     question, and the order we record against their answer would be a lie. React
 *     re-renders this component freely; an unseeded shuffle would reshuffle on each one.
 *  2. INDEPENDENCE. Mixing the qId into the seed stops every equal-length question in a
 *     session sharing one permutation, which would reintroduce a correlated position
 *     effect across questions — a subtler version of the bias being removed.
 *
 * Pure and total: returns a permutation of the input — same length, same members, no
 * duplicates — so callers can treat it as a reordering and nothing else.
 */
export function orderedOptions(question: SurveyQuestion, sessionId: string): string[] {
  // No session id means storage is blocked (see `getSessionId`), and the submit path
  // records no order for that respondent. Shuffling anyway would show an order nothing
  // recorded — worse than not shuffling, because the resulting answer looks comparable
  // to authored-order answers and is not. Shuffled if and only if recorded.
  if (!sessionId) return question.options;
  if (!isRandomised(question.qId) || question.options.length < 2) return question.options;

  const rand = mulberry32(hashSeed(`${sessionId}:${question.qId}`));
  const out = [...question.options];
  // Fisher-Yates, descending — each index lands on a uniformly chosen remaining element.
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
