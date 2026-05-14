// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@features/survey/ui/questions/ChoiceCard", () => ({
  default: (props: {
    label: string;
    description?: string;
    selected: boolean;
    onClick: () => void;
    multi?: boolean;
  }) => (
    <button
      data-testid={`choice-${props.label}`}
      onClick={props.onClick}
      aria-checked={props.selected}
      role={props.multi ? "checkbox" : "radio"}
    >
      <span>{props.label}</span>
      {props.description && (
        <span data-testid={`description-${props.label}`}>{props.description}</span>
      )}
    </button>
  ),
}));

import MultipleChoiceQuestion from "@features/survey/ui/questions/MultipleChoiceQuestion";
import { makeAnswerOptionsExplained, makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";

afterEach(cleanup);

const baseQuestion = makeSurveyQuestion({
  qId: "q1",
  question: "Pick your favorites",
  answerType: "multiple",
  options: ["A", "B", "C", "D", "Other"],
  answerOptionsExplained: makeAnswerOptionsExplained([
    ["A", "Explanation for A"],
    ["B", "Explanation for B"],
    ["C", "Explanation for C"],
  ]),
  required: false,
});

function ControlledQuestion({
  question = baseQuestion,
  initialValue = [],
}: {
  question?: SurveyQuestion;
  initialValue?: string[];
}) {
  const [value, setValue] = useState<string[]>(initialValue);
  return <MultipleChoiceQuestion question={question} value={value} onChange={setValue} />;
}

describe("MultipleChoiceQuestion", () => {
  it("renders all options", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("choice-A")).toBeInTheDocument();
    expect(screen.getByTestId("choice-B")).toBeInTheDocument();
    expect(screen.getByTestId("choice-C")).toBeInTheDocument();
    expect(screen.getByTestId("choice-Other")).toBeInTheDocument();
  });

  it("renders question text and subtitle", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Pick your favorites")).toBeInTheDocument();
    expect(screen.getByText(/select all that apply/i)).toBeInTheDocument();
  });

  it("does not render descriptions for unselected explained options", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId("description-A")).not.toBeInTheDocument();
    expect(screen.queryByTestId("description-B")).not.toBeInTheDocument();
    expect(screen.queryByTestId("description-C")).not.toBeInTheDocument();
  });

  it("renders descriptions for selected explained options", () => {
    render(
      <MultipleChoiceQuestion question={baseQuestion} value={["A", "C"]} onChange={vi.fn()} />
    );

    expect(screen.getByTestId("description-A")).toHaveTextContent("Explanation for A");
    expect(screen.queryByTestId("description-B")).not.toBeInTheDocument();
    expect(screen.getByTestId("description-C")).toHaveTextContent("Explanation for C");
  });

  it("does not render description UI for options without explanations", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={["Other"]} onChange={vi.fn()} />);
    expect(screen.queryByTestId("description-Other")).not.toBeInTheDocument();
  });

  it("shows an option description after selecting it", async () => {
    const user = userEvent.setup();
    render(<ControlledQuestion />);

    await user.click(screen.getByTestId("choice-A"));

    expect(screen.getByTestId("description-A")).toHaveTextContent("Explanation for A");
    expect(screen.queryByTestId("description-B")).not.toBeInTheDocument();
  });

  it("hides an option description after deselecting it", async () => {
    const user = userEvent.setup();
    render(<ControlledQuestion initialValue={["A"]} />);

    expect(screen.getByTestId("description-A")).toHaveTextContent("Explanation for A");

    await user.click(screen.getByTestId("choice-A"));

    expect(screen.queryByTestId("description-A")).not.toBeInTheDocument();
  });

  it("clicking adds to selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultipleChoiceQuestion question={baseQuestion} value={[]} onChange={onChange} />);

    await user.click(screen.getByTestId("choice-A"));
    expect(onChange).toHaveBeenCalledWith(["A"]);
  });

  it("clicking selected item removes it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultipleChoiceQuestion question={baseQuestion} value={["A", "B"]} onChange={onChange} />
    );

    await user.click(screen.getByTestId("choice-A"));
    expect(onChange).toHaveBeenCalledWith(["B"]);
  });

  it("shows Multiple choice badge", () => {
    render(
      <MultipleChoiceQuestion question={baseQuestion} value={["A", "C"]} onChange={vi.fn()} />
    );
    expect(screen.getByText("Multiple choice")).toBeInTheDocument();
  });

  it("handles null value gracefully", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("coerces stale string values into a selectable array", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultipleChoiceQuestion
        question={baseQuestion}
        value={"A" as unknown as string[] | null}
        onChange={onChange}
      />
    );

    await user.click(screen.getByTestId("choice-B"));
    expect(onChange).toHaveBeenCalledWith(["A", "B"]);
  });

  it("shows text input when Other is selected", () => {
    render(
      <MultipleChoiceQuestion
        question={baseQuestion}
        value={["Other"]}
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Please specify…")).toBeInTheDocument();
  });

  it("does not show text input when Other is not selected", () => {
    render(<MultipleChoiceQuestion question={baseQuestion} value={["A"]} onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText("Please specify…")).not.toBeInTheDocument();
  });

  it("text input calls onOtherTextChange", async () => {
    const user = userEvent.setup();
    const onOtherTextChange = vi.fn();
    render(
      <MultipleChoiceQuestion
        question={baseQuestion}
        value={["Other"]}
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={onOtherTextChange}
      />
    );

    await user.type(screen.getByPlaceholderText("Please specify…"), "x");
    expect(onOtherTextChange).toHaveBeenCalledWith("x");
  });

  it("shows capped count for questions with maxSelections", () => {
    const cappedQuestion = { ...baseQuestion, maxSelections: 3 };
    render(
      <MultipleChoiceQuestion question={cappedQuestion} value={["A", "C"]} onChange={vi.fn()} />
    );

    expect(screen.getByText("Multiple choice")).toBeInTheDocument();
  });

  it("blocks selecting more than the configured max", async () => {
    const user = userEvent.setup();
    const cappedQuestion = { ...baseQuestion, maxSelections: 3 };
    render(<ControlledQuestion question={cappedQuestion} initialValue={["A", "B", "C"]} />);

    await user.click(screen.getByTestId("choice-D"));

    expect(screen.getByRole("alert")).toHaveTextContent(/up to 3 options/i);
    expect(screen.getByTestId("choice-D")).toHaveAttribute("aria-checked", "false");
  });

  it("allows deselecting after the limit is reached", async () => {
    const user = userEvent.setup();
    const cappedQuestion = { ...baseQuestion, maxSelections: 3 };
    render(<ControlledQuestion question={cappedQuestion} initialValue={["A", "B", "C"]} />);

    await user.click(screen.getByTestId("choice-A"));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("choice-A")).toHaveAttribute("aria-checked", "false");
  });

  it("shows limit guidance when forced validation finds an over-limit persisted state", () => {
    const cappedQuestion = { ...baseQuestion, maxSelections: 3 };
    render(
      <MultipleChoiceQuestion
        question={cappedQuestion}
        value={["A", "B", "C", "D"]}
        onChange={vi.fn()}
        forceValidation
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/up to 3 options/i);
  });
});
