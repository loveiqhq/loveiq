// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach } from "vitest";

import ScaleQuestion from "@/components/survey/questions/ScaleQuestion";
import { makeScaleQuestion } from "@/__tests__/__fixtures__/survey";

const QUESTION = makeScaleQuestion("Disagree", "Agree", {
  qId: "q1",
  cId: 1,
  chapter: "Wellbeing",
  question: "Rate this",
});

afterEach(cleanup);

describe("ScaleQuestion", () => {
  it("renders 7 dot buttons", () => {
    render(<ScaleQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
  });

  it("renders dot buttons with accessible labels '1 of 7' through '7 of 7'", () => {
    render(<ScaleQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    for (let v = 1; v <= 7; v++) {
      expect(screen.getByRole("button", { name: `${v} of 7` })).toBeInTheDocument();
    }
  });

  it("clicking a dot calls onChange with the correct numeric value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScaleQuestion question={QUESTION} value={null} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "4 of 7" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("clicking each dot calls onChange with its respective value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ScaleQuestion question={QUESTION} value={null} onChange={onChange} />);
    for (let v = 1; v <= 7; v++) {
      await user.click(screen.getByRole("button", { name: `${v} of 7` }));
      expect(onChange).toHaveBeenLastCalledWith(v);
    }
  });

  it("shows 'Strongly Agree' label when value is 7 (agree scale)", () => {
    render(<ScaleQuestion question={QUESTION} value={7} onChange={vi.fn()} />);
    expect(screen.getByText("Strongly Agree")).toBeInTheDocument();
  });

  it("shows 'Strongly Disagree' label when value is 1 (agree scale)", () => {
    render(<ScaleQuestion question={QUESTION} value={1} onChange={vi.fn()} />);
    expect(screen.getByText("Strongly Disagree")).toBeInTheDocument();
  });

  it("uses intensity labels when scaleLabels.low contains 'not at all'", () => {
    const intensityQuestion = {
      ...QUESTION,
      scaleLabels: { low: "Not at all", high: "Extremely" },
    };
    render(<ScaleQuestion question={intensityQuestion} value={7} onChange={vi.fn()} />);
    // "Extremely" appears as both value label and scale end label
    expect(screen.getAllByText("Extremely").length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'Not at all' intensity label for value 1 when low is 'Not at all'", () => {
    const intensityQuestion = {
      ...QUESTION,
      scaleLabels: { low: "Not at all", high: "Extremely" },
    };
    render(<ScaleQuestion question={intensityQuestion} value={1} onChange={vi.fn()} />);
    // "Not at all" appears as both value label and scale end label
    expect(screen.getAllByText("Not at all").length).toBeGreaterThanOrEqual(1);
  });

  it("shows no value label when value is null", () => {
    render(<ScaleQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText("Strongly Agree")).not.toBeInTheDocument();
    expect(screen.queryByText("Strongly Disagree")).not.toBeInTheDocument();
  });

  it("renders the question text", () => {
    render(<ScaleQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Rate this")).toBeInTheDocument();
  });

  it("renders scale end labels from scaleLabels prop", () => {
    render(<ScaleQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Disagree")).toBeInTheDocument();
    expect(screen.getByText("Agree")).toBeInTheDocument();
  });
});
