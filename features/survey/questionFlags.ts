/**
 * Per-question display flags, keyed by `frontend_qid`.
 *
 * These live in code rather than in `data/survey-source.csv` on purpose. The CSV is
 * itself exported from an upstream "Assessment Questions" xlsx (see 08b77d11), and the
 * V3 revision deliberately REMOVED columns in favour of deriving values from copy the
 * respondent already reads — `scripts/update-survey.js` parses the selection cap out of
 * the guidance sentence for exactly that reason. A new column here would sit outside the
 * maintained source, so the next export could drop it silently: randomisation would
 * switch off with no error, no failing test, and no signal until someone noticed months
 * of rankings were unusable again.
 *
 * These are also not survey CONTENT. Nothing here changes what is asked, only how it is
 * presented, which is a code concern rather than an authoring one.
 */

/**
 * Questions whose answer options are shown in a randomised order, with that order
 * recorded against the submission (`survey_submission.option_order`).
 *
 * Why these three: each is a multi-select whose ANSWER IS A RANKING — which changes
 * matter most, what is already part of your life, what is getting in the way. A fixed
 * render order makes the share an option receives inseparable from its position, so the
 * ranking cannot be published. Scale and open questions are excluded because they have
 * no option order to bias, and single-choice questions whose options are an ordered
 * scale must keep their sequence.
 *
 * Deliberately NOT randomised: any question whose options carry a fixed reading order —
 * price ladders, for instance, where a "none of these" opt-out has to stay last for the
 * answer to mean anything.
 */
export const RANDOMISE_QIDS: ReadonlySet<string> = new Set(["16001", "16011", "16014"]);

/** Whether this question's options should be shown in a randomised order. */
export function isRandomised(qId: string): boolean {
  return RANDOMISE_QIDS.has(qId);
}
