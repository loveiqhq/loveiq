import { fmt } from "@features/admin/server/ap/format";
import type { QuestionRow, SurveyQuestions } from "@features/admin/server/ap/survey";

/**
 * Which question order the Survey page's funnel and charts count in: the survey's old order, the
 * opening-order test's new one (C13, everyone's since its end), or Survey 2.0's screens (Mark's
 * survey review, behind the `survey_2` switch).
 */
export type SurveyOrder = "survey" | "test" | "survey2";

/** How the page names an order. */
export const ORDER_NAMES: Record<SurveyOrder, string> = {
  survey: "Old order",
  test: "New order (C13)",
  survey2: "Survey 2.0",
};

/** The orders the range has runs in, beyond the old one: a choice to offer only then. */
export const hasOrderChoice = (q: SurveyQuestions | null): boolean =>
  Boolean(q?.test || q?.survey2);

/** The order's funnel, the old order's when the range has no runs in the one asked for. */
export function orderFunnel(
  q: SurveyQuestions | null,
  order: SurveyOrder
): { rows: QuestionRow[]; people: number } | null {
  if (!q) return null;
  const picked = order === "test" ? q.test : order === "survey2" ? q.survey2 : null;
  return picked ?? q;
}

/** The pills: every order the range has runs in, with how many. */
export function orderOptions(q: SurveyQuestions): Array<{ value: SurveyOrder; label: string }> {
  const option = (value: SurveyOrder, people: number) => ({
    value,
    label: `${ORDER_NAMES[value]} · ${fmt("count", people)} runs`,
  });
  return [
    option("survey", q.people),
    ...(q.test ? [option("test", q.test.people)] : []),
    ...(q.survey2 ? [option("survey2", q.survey2.people)] : []),
  ];
}
