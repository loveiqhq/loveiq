import { describe, expect, it } from "vitest";

import { makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";
import { surveyQuestions } from "@/data/survey-data";
import { OPTION_GROUPS, optionGroupsFor } from "@features/survey/optionGroups";

const c9 = surveyQuestions.find((q) => q.qId === "16016")!;

describe("C9 (16016) option groups", () => {
  it("groups C9 into the thirteen categories the teardown specified, in authored order", () => {
    expect(optionGroupsFor(c9)?.map((g) => g.label)).toEqual([
      "Mood & Energy",
      "Anxiety & Worry",
      "Emotions & Impulses",
      "Trauma & Stress",
      "Sleep & Body",
      "Focus & Routines",
      "Relationships & Closeness",
      "Intimacy & Desire",
      "Dating & Finding Love",
      "Family & Parenting",
      "Work, Purpose & Money",
      "Habits & Dependencies",
      "Change, Identity & Meaning",
    ]);
  });

  it("gives each category the teardown's topic count", () => {
    expect(optionGroupsFor(c9)?.map((g) => g.options.length)).toEqual([
      4, 3, 4, 4, 4, 3, 6, 3, 5, 5, 5, 2, 5,
    ]);
  });

  it("covers every one of C9's 53 topics exactly once, with the exact option text", () => {
    // The contract that keeps answers landing: submit_survey matches a pick to its
    // answer_option by EXACT text, so a category holding a retyped label would render a
    // topic nobody can store. And a topic missing from every category would vanish.
    const grouped = OPTION_GROUPS.get("16016")!.flatMap((g) => [...g.options]);
    expect(grouped).toHaveLength(53);
    expect(new Set(grouped).size).toBe(53);
    expect([...grouped].sort()).toEqual([...c9.options].sort());
  });

  it("lists the topics in the same order the survey data authors them", () => {
    // Authored order is what a respondent without a session id sees, and it is the
    // order the CSV and the migration's display_order already use.
    expect(optionGroupsFor(c9)!.flatMap((g) => [...g.options])).toEqual(c9.options);
  });
});

describe("optionGroupsFor", () => {
  it("returns nothing for a question that has no grouping", () => {
    expect(optionGroupsFor(makeSurveyQuestion({ qId: "16011", options: ["A", "B"] }))).toBe(
      undefined
    );
  });

  it("falls back to the flat list when the question's options no longer match the grouping", () => {
    // A reworded topic in the CSV must never disappear from the page. Without the exact
    // match the grouping is refused and the question renders flat, every option intact.
    const renamed = { ...c9, options: [...c9.options.slice(0, 52), "A reworded topic"] };
    expect(optionGroupsFor(renamed)).toBe(undefined);
  });

  it("falls back when a topic has been added that no category holds", () => {
    const extra = { ...c9, options: [...c9.options, "A brand-new topic"] };
    expect(optionGroupsFor(extra)).toBe(undefined);
  });
});
