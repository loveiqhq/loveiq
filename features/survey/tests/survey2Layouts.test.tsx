// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { surveyQuestions } from "@/data/survey-data";
import { OPTION_GROUPS } from "@features/survey/optionGroups";
import { withPickedAreas } from "@features/survey/survey2/areas";
import MultipleChoiceQuestion from "@features/survey/ui/questions/MultipleChoiceQuestion";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";

/**
 * The two 16016 screens as Mark's boards draw them: the areas as compact tiles in two columns
 * ("16016 step 1"), the topics under small headings for the areas picked, all open at once
 * ("16016 step 2").
 */
afterEach(cleanup);

const screens = orderAskedQuestions(surveyQuestions, "survey2");
const areas = screens.find((q) => q.qId === "16016a")!;
const groups = OPTION_GROUPS.get("16016")!;
const DATING = "Dating & Finding Love";
const WORK = "Work, Purpose & Money";

describe("the areas screen", () => {
  it("draws the 13 areas as tiles in a two-column grid", () => {
    render(<MultipleChoiceQuestion question={areas} value={[]} onChange={() => {}} />);
    const grid = screen.getByRole("group", { name: areas.question });
    expect(grid.className).toMatch(/grid-cols-2/);
    expect(within(grid).getAllByRole("checkbox")).toHaveLength(13);
  });

  it("picks up to two, and says so at a third", async () => {
    const onChange = vi.fn();
    render(<MultipleChoiceQuestion question={areas} value={[DATING, WORK]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: groups[0]!.label }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/up to 2/);
  });
});

describe("the topics screen", () => {
  it("shows the picked areas' topics under their headings, all open", () => {
    const topics = withPickedAreas(screens, { "16016a": [DATING, WORK] }).find(
      (q) => q.qId === "16016"
    )!;
    render(<MultipleChoiceQuestion question={topics} value={[]} onChange={() => {}} />);
    expect(screen.getByRole("heading", { name: DATING })).toBeTruthy();
    expect(screen.getByRole("heading", { name: WORK })).toBeTruthy();
    const all = [DATING, WORK].flatMap((l) => groups.find((g) => g.label === l)!.options);
    for (const topic of all) expect(screen.getByRole("checkbox", { name: topic })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /more categories/i })).toBeNull();
  });
});
