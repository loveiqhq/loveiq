/**
 * Numbers the report and its paywall state about the assessment. Each one is checked
 * against the thing it counts by features/report/tests/reportFacts.test.ts, so a survey or
 * scoring change that makes one untrue fails the build instead of shipping.
 *
 * Constants rather than imports so the survey's question list and the scoring config stay
 * out of the report's bundle.
 */

/** Questions every respondent is asked (survey-data minus the hidden ones). */
export const QUESTIONS_ASKED = 57;

/** Archetypes every answer sheet is scored against. */
export const ARCHETYPES_COMPARED = 14;
