/**
 * Survey 2.0's order (Mark's Survey Review, 19 Nov 2026: the "Working copy · new question order"
 * board on canvas LcXv9Kc2vTQR1jGhacobak, unchanged on 23 Nov).
 *
 * Its own list, never derived from the classic one: a 2.0 draft resumes by its saved position in
 * THIS list, so it must not change while 2.0 is live. Two of its entries are screens, not
 * questions: the areas of 16016 (`16016a`, Mark's to-do 5 splits 16016 into two steps) and the
 * one-page details (`00010`), which writes the five answers the classic survey asks one by one.
 */

/** The details page: name, email, opt-in, country and postal code on one screen. */
export const SURVEY_2_DETAILS_QID = "00010";

/** The first of 16016's two screens: up to two of its 13 areas. Never submitted. */
export const SURVEY_2_AREAS_QID = "16016a";

/** The answers the details page writes, under the ids every reader of them already uses. */
export const DETAILS_ANSWER_QIDS = ["00001", "00000", "15001", "15002", "16015"] as const;

// prettier-ignore
export const SURVEY_2_ORDER: readonly string[] = [
  "10003", "11003", "11002", "11001", "03013", "10004", "02003", "10005", "10002", "11004",
  "01002", "02002", "02004", "03003", "03004", "03005", "03006", "03008", "03009", "03010",
  "03011", "03012", "08002", "08003", "08004", "08005", "08006", "08012", "09013", "14020",
  "14021", "01005", "02001", "01006", "15003", "15004", "15005", "15006", "15007", "15008",
  "15009", "15010", "16001", "16002", "16005", "16006", "16007", SURVEY_2_AREAS_QID, "16016",
  "16017", "16018", "16011", "16012", "16013", "16014", "16019", "16020", "17001", "17002",
  "17003", SURVEY_2_DETAILS_QID,
];
