// "How you compare", third column: how many of the reader's own dimensions sit at
// the far end of the scale.
//
// Replaces the runner-up archetype percentage ("57% — Explorer of Edges rides
// shotgun"), which told the reader about a DIFFERENT archetype in a box that
// promises a comparison about them.
//
// WHAT IT MEASURES. Each of the 21 scoring dimensions is a SINGLE 1-7 survey item
// (`data/scoring-config.ts`, one `qid` per dimension). This counts the dimensions
// where the reader answered 1 or 7 — the two ends — and compares that count to the
// average reader.
//
// WHY ENDPOINTS AND NOT PERCENTILES. The first design was "dimensions in the most
// extreme tenth of all readers". That cannot be computed on this data. A 1-7 single
// item has seven possible values and readers pile up on the ends: 33.5% answer 7 on
// DIM_PURSUIT, 32.3% on DIM_NOVELTY, 26.0% answer 1 on DIM_PLANNED. Twelve of the
// twenty measurable dimensions have more than a fifth of all readers on one
// endpoint, so a "top tenth" band cannot be cut — it would either scoop up a third
// of readers or none, entirely depending on how ties break, and two readers who
// answered almost identically could get different numbers. Endpoint counting has no
// tie-break and no arbitrary threshold.
//
// WHERE THE NUMBERS COME FROM
// Counted 2026-08-27 over the 1,747 submissions with dimension answers on file:
//
//   average endpoint count   5.6      median 5      range 0-20
//   0-2 endpoints    511 readers
//   3-5 endpoints    485 readers
//   6-9 endpoints    439 readers
//   10+ endpoints    312 readers
//
// The spread is what makes the stat worth showing: it is genuinely different per
// reader rather than 5 for everyone. This is the LoveIQ sample, NOT a population
// estimate — everyone in it chose to take a sexuality assessment — so the copy says
// "readers here", never "people".
//
// ⚠️ TWENTY, NOT TWENTY-ONE. `DIM_RISK_PREF` (qid 03010) is configured as a
// dimension with `transform: "scale_1_7_to_0_1"`, but its question is a
// single-choice ("Which kind of sexual atmosphere usually feels best for you?") and
// `normalized_value` is NULL on all 1,747 answers. So it cannot contribute an
// endpoint and the denominator is 20. Whether it also contributes nothing to
// SCORING is a separate question for Eman — the engine reads the raw answer, not
// `normalized_value`, so it may or may not resolve. Do not "fix" the denominator
// here without checking that first.

/** The 21 dimension question ids, from `data/scoring-config.ts`. */
export const DIMENSION_QIDS: readonly string[] = [
  "01005", // DIM_NOVELTY
  "02002", // DIM_RESPONSIVE
  "02003", // DIM_PLANNED
  "03004", // DIM_EMO_CONNECTION
  "03008", // DIM_INTENSITY
  "03009", // DIM_PURSUIT
  "03010", // DIM_RISK_PREF — single-choice, never carries a numeric value (see above)
  "03011", // DIM_SACRED
  "03012", // DIM_EDGE_NEED
  "08002", // DIM_SECURE
  "08004", // DIM_CLOSENESS_ORIENTATION
  "08005", // DIM_REPAIR_EROTICISM
  "08006", // DIM_PRESSURE_SHUTDOWN
  "08012", // DIM_AVOIDANT
  "09013", // DIM_STRATEGY
  "10003", // DIM_TURNON_EXPRESS
  "10004", // DIM_BOUNDARY_EXPRESS
  "10005", // DIM_FEEDBACK_DEP
  "11002", // DIM_PROTOCOL
  "11003", // DIM_PARTNER_FOCUS
  "11004", // DIM_SOOTHING
] as const;

/**
 * The average endpoint count across the sample, and the date it was counted.
 *
 * A constant rather than a live query: it moved from 5.6 across 1,747 submissions
 * and will not move meaningfully per report. Recount it when the sample doubles,
 * and update `COUNTED_AT` and the header block above when you do.
 */
export const ENDPOINT_AVERAGE = 5.6;
export const ENDPOINT_SAMPLE = 1747;
export const COUNTED_AT = "2026-08-27";

export interface EndpointStat {
  /** e.g. "8 of 20" — the stat line. */
  stat: string;
  /** The caption under it. */
  caption: string;
}

/**
 * The reader's endpoint stat, or null when too few dimensions are on file to make
 * the comparison honest.
 *
 * `answers` is the reader's dimension answers as `qid -> 1..7`. Values outside 1-7
 * and absent qids are ignored rather than guessed at.
 */
export function endpointStatFor(
  answers: Readonly<Record<string, number | null | undefined>> | null | undefined
): EndpointStat | null {
  if (!answers) return null;

  let measured = 0;
  let endpoints = 0;
  for (const qid of DIMENSION_QIDS) {
    const v = answers[qid];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 1 || v > 7) continue;
    measured += 1;
    if (v === 1 || v === 7) endpoints += 1;
  }

  // Below three quarters of the dimensions the count is not comparable to an
  // average taken over full responses, so the column falls back to matrix copy.
  if (measured < 15) return null;

  const rounded = Math.round(ENDPOINT_AVERAGE);
  /*
   * "Dimensions" is internal vocabulary — a reader has never seen the word, and this
   * column is read in about two seconds. "Traits this report measures" says the same
   * thing in words they already have. The caption also has to work with the number
   * read first, since that is the reading order of the column.
   */
  return {
    stat: `${endpoints} of ${measured}`,
    caption:
      endpoints > rounded
        ? `traits where you answered at the very edge of the scale. Most readers here do on ${rounded}, so you hold stronger positions than most.`
        : endpoints < rounded
          ? `traits where you answered at the very edge of the scale. Most readers here do on ${rounded}, so you sit nearer the middle than most.`
          : `traits where you answered at the very edge of the scale, which is exactly where most readers here land.`,
  };
}
