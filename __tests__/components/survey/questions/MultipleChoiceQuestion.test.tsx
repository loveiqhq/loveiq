// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/components/survey/questions/ChoiceCard", () => ({
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

import MultipleChoiceQuestion from "@/components/survey/questions/MultipleChoiceQuestion";
import type { SurveyQuestion } from "@/data/survey-data";

afterEach(cleanup);

const question = {
  qId: "q1",
  question: "Pick your favorites",
  answerType: "multiple",
  options: ["A", "B", "C", "Other"],
  answerOptionsExplained: [
    { option: "A", explanation: "Explanation for A" },
    { option: "B", explanation: "Explanation for B" },
    { option: "C", explanation: "Explanation for C" },
  ],
  chapter: "ch1",
  required: false,
} as unknown as SurveyQuestion;

describe("MultipleChoiceQuestion", () => {
  it("renders all options", () => {
    render(<MultipleChoiceQuestion question={question} value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("choice-A")).toBeInTheDocument();
    expect(screen.getByTestId("choice-B")).toBeInTheDocument();
    expect(screen.getByTestId("choice-C")).toBeInTheDocument();
    expect(screen.getByTestId("choice-Other")).toBeInTheDocument();
  });

  it("renders question text and subtitle", () => {
    render(<MultipleChoiceQuestion question={question} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Pick your favorites")).toBeInTheDocument();
    expect(screen.getByText(/select all that apply/i)).toBeInTheDocument();
  });

  it("renders descriptions for explained options", () => {
    render(<MultipleChoiceQuestion question={question} value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId("description-A")).toHaveTextContent("Explanation for A");
    expect(screen.getByTestId("description-B")).toHaveTextContent("Explanation for B");
    expect(screen.getByTestId("description-C")).toHaveTextContent("Explanation for C");
  });

  it("does not render description UI for options without explanations", () => {
    render(<MultipleChoiceQuestion question={question} value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId("description-Other")).not.toBeInTheDocument();
  });

  it("clicking adds to selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultipleChoiceQuestion question={question} value={[]} onChange={onChange} />);

    await user.click(screen.getByTestId("choice-A"));
    expect(onChange).toHaveBeenCalledWith(["A"]);
  });

  it("clicking selected item removes it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultipleChoiceQuestion question={question} value={["A", "B"]} onChange={onChange} />);

    await user.click(screen.getByTestId("choice-A"));
    expect(onChange).toHaveBeenCalledWith(["B"]);
  });

  it("shows selection count", () => {
    render(<MultipleChoiceQuestion question={question} value={["A", "C"]} onChange={vi.fn()} />);
    expect(screen.getByText("(2 selected)")).toBeInTheDocument();
  });

  it("handles null value gracefully", () => {
    render(<MultipleChoiceQuestion question={question} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("coerces stale string values into a selectable array", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <MultipleChoiceQuestion
        question={question}
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
        question={question}
        value={["Other"]}
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText("Please specify…")).toBeInTheDocument();
  });

  it("does not show text input when Other is not selected", () => {
    render(<MultipleChoiceQuestion question={question} value={["A"]} onChange={vi.fn()} />);
    expect(screen.queryByPlaceholderText("Please specify…")).not.toBeInTheDocument();
  });

  it("text input calls onOtherTextChange", async () => {
    const user = userEvent.setup();
    const onOtherTextChange = vi.fn();
    render(
      <MultipleChoiceQuestion
        question={question}
        value={["Other"]}
        onChange={vi.fn()}
        otherText=""
        onOtherTextChange={onOtherTextChange}
      />
    );

    await user.type(screen.getByPlaceholderText("Please specify…"), "x");
    expect(onOtherTextChange).toHaveBeenCalledWith("x");
  });
});
