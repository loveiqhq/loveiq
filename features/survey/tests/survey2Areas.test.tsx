// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";
import { OPTION_GROUPS, optionGroupsFor } from "@features/survey/optionGroups";
import { pruneTopics, submittableAnswers, withPickedAreas } from "@features/survey/survey2/areas";
import MultipleChoiceQuestion from "@features/survey/ui/questions/MultipleChoiceQuestion";
import { orderAskedQuestions, orderedOptions } from "@features/survey/ui/questionOrder";

/**
 * 16016 in two screens (Mark's to-do 5): up to two of its 13 areas on the first (`16016a`),
 * then up to three topics, from inside those areas only, on the second. The areas screen is
 * never submitted: the topics say which areas were picked.
 */
afterEach(cleanup);

const groups = OPTION_GROUPS.get("16016")!;
const topicsOf = (...labels: string[]) =>
  groups.filter((g) => labels.includes(g.label)).flatMap((g) => g.options);
const screens = () => orderAskedQuestions(surveyQuestions, "survey2");
const topicsScreen = (answers: Record<string, unknown>) =>
  withPickedAreas(screens(), answers).find((q) => q.qId === "16016")!;
const AREAS = [groups[8]!.label, groups[10]!.label];

describe("the topics screen", () => {
  it("shows only the topics inside the areas picked, in their authored order", () => {
    const q = topicsScreen({ "16016a": AREAS });
    const base = surveyQuestions.find((x) => x.qId === "16016")!;
    expect(q.options).toEqual(base.options.filter((o) => topicsOf(...AREAS).includes(o)));
    expect(q.maxSelections).toBe(3);
  });

  it("groups them under those areas", () => {
    const q = topicsScreen({ "16016a": AREAS });
    expect(
      optionGroupsFor(q)!
        .map((g) => g.label)
        .sort()
    ).toEqual([...AREAS].sort());
  });

  it("shows every topic when no area is on record", () => {
    const base = surveyQuestions.find((x) => x.qId === "16016")!;
    expect(topicsScreen({}).options).toEqual(base.options);
  });

  it("leaves every other screen as it is", () => {
    const before = screens();
    const after = withPickedAreas(before, { "16016a": AREAS });
    expect(after.map((q) => q.qId)).toEqual(before.map((q) => q.qId));
    expect(after.filter((q) => q.qId !== "16016")).toEqual(before.filter((q) => q.qId !== "16016"));
  });

  it("renders the picked areas as headings, and nothing from the others", () => {
    const q = topicsScreen({ "16016a": AREAS });
    render(<MultipleChoiceQuestion question={q} value={[]} onChange={() => {}} />);
    for (const label of AREAS) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(groups[0]!.label)).toBeNull();
  });
});

describe("grouping a list of options", () => {
  it("still refuses a list that cuts a category in half", () => {
    const q: SurveyQuestion = {
      ...surveyQuestions.find((x) => x.qId === "16016")!,
      options: [...groups[0]!.options, groups[1]!.options[0]!],
    };
    expect(optionGroupsFor(q)).toBeUndefined();
  });
});

describe("changing the areas", () => {
  it("prunes topics when areas change", () => {
    const keep = topicsOf(AREAS[0]!)[0]!;
    const drop = topicsOf(AREAS[1]!)[0]!;
    expect(pruneTopics([keep, drop], [AREAS[0]!])).toEqual([keep]);
  });
});

describe("what is submitted", () => {
  it("never the areas screen's own answer", () => {
    const answers = { "16016a": AREAS, "16016": [topicsOf(AREAS[0]!)[0]!], "10003": 5 };
    expect(submittableAnswers(answers)).toEqual({
      "16016": answers["16016"],
      "10003": 5,
    });
  });
});

describe("the areas screen", () => {
  it("shuffles the areas per session, the same way every time", () => {
    const areas = screens().find((q) => q.qId === "16016a")!;
    const a = orderedOptions(areas, "session-a");
    expect([...a].sort()).toEqual([...areas.options].sort());
    expect(orderedOptions(areas, "session-a")).toEqual(a);
    const differs = ["session-b", "session-c", "session-d", "session-e"].some(
      (s) => orderedOptions(areas, s).join() !== a.join()
    );
    expect(differs).toBe(true);
  });
});
