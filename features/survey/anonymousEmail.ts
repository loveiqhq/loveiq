import type { SurveyQuestion } from "@/data/survey-data";
import type { EmailQuestionArm } from "@shared/experiments/emailQuestionArm";
import { EMAIL_QID } from "@features/survey/ui/questionOrder";

/**
 * The email question test's "anonymous" arm: Marcus's redesign, Figma
 * IdxyUUVvJSYRTpI9CYRtJI 11600:15119 (07.10). Only the words change here; the field
 * (one underline input, no confirm box) is drawn by OpenResponseQuestion.
 *
 * Kept beside the test rather than in survey-data.ts, so ending the test is one
 * deletion. The frame's placeholder reads "e.g.nickname@example.com"; the missing space
 * after "e.g." is added (Fatih, 07.10).
 */
const ANONYMOUS_EMAIL_COPY = {
  question: "What’s your email? Feel free to use an anonymous one.",
  guide:
    "Use an inbox you actually check. If you prefer more privacy, choose an anonymous " +
    "email address that isn’t linked to your personal information. You may also " +
    "want to use a private address rather than a work or shared inbox.",
  placeholder: "e.g. nickname@example.com",
} as const;

/**
 * The question as this respondent's arm shows it: the email question with the anonymous
 * copy in that arm, anything else (and the control arm) exactly as it was. The purple
 * instruction and the Why row are the same in both arms.
 */
export function applyEmailQuestionArm(
  question: SurveyQuestion,
  arm: EmailQuestionArm
): SurveyQuestion {
  if (arm !== "anonymous" || question.qId !== EMAIL_QID) return question;
  return {
    ...question,
    question: ANONYMOUS_EMAIL_COPY.question,
    guide: ANONYMOUS_EMAIL_COPY.guide,
    supportAndGuidance: ANONYMOUS_EMAIL_COPY.guide,
    placeholder: ANONYMOUS_EMAIL_COPY.placeholder,
  };
}
