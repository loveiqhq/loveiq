// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/components/survey/questions/ChoiceCard", () => ({
  default: (props: { label: string; selected: boolean; onClick: () => void }) => (
    <button
      data-testid={`choice-${props.label}`}
      onClick={props.onClick}
      aria-checked={props.selected}
      role="radio"
    >
      {props.label}
    </button>
  ),
}));

import SingleChoiceQuestion from "@/components/survey/questions/SingleChoiceQuestion";
import type { SurveyQuestion } from "@/data/survey-data";

afterEach(cleanup);

const question = {
  qId: "q1",
  question: "Pick one",
  answerType: "single",
  options: ["Option A", "Option B", "Other"],
  chapter: "ch1",
  required: true,
} as unknown as SurveyQuestion;

describe("SingleChoiceQuestion", () => {
  it("renders all options", () => {
    render(<SingleChoiceQuestion question={question} value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("choice-Option A")).toBeInTheDocument();
    expect(screen.getByTestId("choice-Option B")).toBeInTheDocument();
    expect(screen.getByTestId("choice-Other")).toBeInTheDocument();
  });

  it("renders question text", () => {
    render(<SingleChoiceQuestion question={question} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("clicking option calls onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SingleChoiceQuestion question={question} value={null} onChange={onChange} />);

    await user.click(screen.getByTestId("choice-Option A"));
    expect(onChange).toHaveBeenCalledWith("Option A");
  });

  it("selected option has aria-checked true", () => {
    render(<SingleChoiceQuestion question={question} value="Option A" onChange={vi.fn()} />);
    expect(screen.getByTestId("choice-Option A")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("choice-Option B")).toHaveAttribute("aria-checked", "false");
  });

  it("shows text input when 'Other' selected", () => {
    render(
      <SingleChoiceQuestion
        question={question}
        value="Other"
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Please specify…")).toBeInTheDocument();
  });

  it("does not show text input when non-Other option selected", () => {
    render(<SingleChoiceQuestion question={question} value="Option A" onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText("Please specify…")).not.toBeInTheDocument();
  });

  it("text input calls onOtherTextChange", async () => {
    const user = userEvent.setup();
    const onOtherTextChange = vi.fn();
    render(
      <SingleChoiceQuestion
        question={question}
        value="Other"
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={onOtherTextChange}
      />
    );

    await user.type(screen.getByPlaceholderText("Please specify…"), "x");
    expect(onOtherTextChange).toHaveBeenCalledWith("x");
  });
});
