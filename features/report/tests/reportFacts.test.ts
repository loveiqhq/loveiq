import { describe, expect, it } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { ARCHETYPES_COMPARED, QUESTIONS_ASKED } from "@features/report/logic/reportFacts";
import { getScoringConfig } from "@features/scoring/logic/config";
import { isHidden } from "@features/survey/questionFlags";

describe("the numbers the report states", () => {
  it("counts the questions a respondent is actually asked", () => {
    expect(QUESTIONS_ASKED).toBe(surveyQuestions.filter((q) => !isHidden(q.qId)).length);
  });

  it("counts the archetypes the engine scores against", () => {
    expect(ARCHETYPES_COMPARED).toBe(getScoringConfig().archetypes.length);
  });
});
