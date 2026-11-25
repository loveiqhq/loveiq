import { fmt } from "@features/admin/server/ap/format";
import type { QuestionRow, SurveyQuestions } from "@features/admin/server/ap/survey";
import { QUESTION_ORDER_TEST_END } from "@shared/experiments/questionOrderArm";

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

/** How a test's pill names an order. */
const HALF_NAMES: Record<SurveyOrder, string> = {
  survey: "Old order",
  test: "New order",
  survey2: "Survey 2.0",
};

/** The day the question order test ended, as its row says it ("21 Nov"). */
const ORDER_TEST_ENDED = new Date(QUESTION_ORDER_TEST_END).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Berlin",
});

/** One test of the survey's order: its name, when it ran, and a pill per half it has runs in. */
export interface OrderTest {
  name: string;
  when: string;
  options: Array<{ value: SurveyOrder; label: string }>;
}

/**
 * The order tests, stacked as Mark set them out (sync, 25 Nov 2026): the question order test
 * (C13: Control the old order, Variant the new one; ended 21 Nov 2026), and once the range has
 * Survey 2.0 runs, the Survey 2.0 test on top of it, whose Control is the first test's Variant
 * (the new order) and whose Variant is Survey 2.0. Each pill carries how many runs were asked
 * that order; the new order's pill is the same funnel in both tests. The old order's is always
 * there, as the page's pill for it always was.
 */
export function orderTests(q: SurveyQuestions): OrderTest[] {
  const half = (h: "Control" | "Variant", value: SurveyOrder, people: number) => ({
    value,
    label: `${h} · ${HALF_NAMES[value]} · ${fmt("count", people)} runs`,
  });
  const tests: OrderTest[] = [
    {
      name: "Question order test",
      when: `ended ${ORDER_TEST_ENDED}`,
      options: [
        half("Control", "survey", q.people),
        ...(q.test ? [half("Variant", "test", q.test.people)] : []),
      ],
    },
  ];
  if (q.survey2)
    tests.push({
      name: "Survey 2.0 test",
      when: "while its switch is on",
      options: [
        ...(q.test ? [half("Control", "test", q.test.people)] : []),
        half("Variant", "survey2", q.survey2.people),
      ],
    });
  return tests;
}
