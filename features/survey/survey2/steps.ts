import type { SurveyQuestion } from "@/data/survey-data";
import { OPTION_GROUPS } from "@features/survey/optionGroups";

import { withSurvey2Copy } from "./copy";
import { SURVEY_2_AREAS_QID, SURVEY_2_DETAILS_QID, SURVEY_2_ORDER } from "./order";

/**
 * The details page as a screen (Mark's boards "Details · 1 · Name", "2a · Email", "3 · Country",
 * "alt · Yes/No opt-in"). It is answered through the five answers it writes
 * (DETAILS_ANSWER_QIDS), never under its own id.
 */
export const DETAILS_STEP: SurveyQuestion = {
  qId: SURVEY_2_DETAILS_QID,
  cId: 15,
  chapter: "Your details",
  question: "Last step to your report to become a more intelligent lover",
  answerType: "details",
  options: [],
  required: true,
  guide: "We use these to personalise your report and send it to you.",
  supportAndGuidance: "We use these to personalise your report and send it to you.",
};

/** The guide line both 16016 screens keep from today's question. */
const DEMAND_GUIDE = "This helps us decide what to build next, so there are no wrong answers.";

/**
 * 16016's first screen (Mark's board "16016 step 1"): up to two of its 13 areas. The topics
 * screen that follows shows only the topics inside them. Never submitted: the topics say which
 * areas were picked.
 */
export function areasStep(topics: SurveyQuestion): SurveyQuestion {
  return {
    qId: SURVEY_2_AREAS_QID,
    cId: topics.cId,
    chapter: topics.chapter,
    question: "Beyond sex, which areas would you most like to understand about yourself?",
    answerType: "multiple",
    options: (OPTION_GROUPS.get(topics.qId) ?? []).map((group) => group.label),
    required: topics.required,
    guide: DEMAND_GUIDE,
    supportAndGuidance: DEMAND_GUIDE,
    formatGuidance: "Pick up to 2.",
    maxSelections: 2,
    howAnswerIsUsed: topics.howAnswerIsUsed,
    comment: topics.comment,
  };
}

/**
 * Survey 2.0's screens, in SURVEY_2_ORDER, each in its 2.0 wording (copy.ts). A question the data
 * doesn't hold is left out rather than drawn empty (survey2Order.test.ts holds the list to all 61).
 */
export function survey2Screens(questions: readonly SurveyQuestion[]): SurveyQuestion[] {
  const byId = new Map(questions.map((q) => [q.qId, q]));
  return SURVEY_2_ORDER.flatMap((qId): SurveyQuestion[] => {
    if (qId === SURVEY_2_DETAILS_QID) return [DETAILS_STEP];
    if (qId === SURVEY_2_AREAS_QID) {
      const topics = byId.get("16016");
      return topics ? [areasStep(topics)] : [];
    }
    const q = byId.get(qId);
    return q ? [withSurvey2Copy(q)] : [];
  });
}
