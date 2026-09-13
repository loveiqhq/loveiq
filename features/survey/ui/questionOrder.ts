import { isRandomised } from "@features/survey/questionFlags";

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
