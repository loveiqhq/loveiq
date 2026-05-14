import type { SurveyQuestion } from "@/data/survey-data";

function normalizeOption(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function getOptionExplanation(question: SurveyQuestion, option: string): string | undefined {
  const normalizedOption = normalizeOption(option);

  return question.answerOptionsExplained?.find(
    (item) => normalizeOption(item.option) === normalizedOption
  )?.explanation;
}
