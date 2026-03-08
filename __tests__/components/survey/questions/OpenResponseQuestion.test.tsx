// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import OpenResponseQuestion from "@/components/survey/questions/OpenResponseQuestion";
import type { SurveyQuestion } from "@/data/survey-data";

afterEach(cleanup);

const baseQuestion: SurveyQuestion = {
  qId: "q1",
  question: "What is your name?",
  answerType: "open",
  chapter: "ch1",
  required: true,
} as SurveyQuestion;

describe("OpenResponseQuestion", () => {
  it("renders question text", () => {
    render(<OpenResponseQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("What is your name?")).toBeInTheDocument();
  });

  it("renders text input with placeholder", () => {
    render(<OpenResponseQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Type your answer...")).toBeInTheDocument();
  });

  it("uses custom placeholder when provided", () => {
    const q = { ...baseQuestion, placeholder: "Enter your email" };
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Enter your email")).toBeInTheDocument();
  });

  it("calls onChange when typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OpenResponseQuestion question={baseQuestion} value="" onChange={onChange} />);

    await user.type(screen.getByPlaceholderText("Type your answer..."), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders email input when inputType is email", () => {
    const q = { ...baseQuestion, inputType: "email" } as SurveyQuestion;
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Type your answer...");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("does not show skip button when question is required", () => {
    render(<OpenResponseQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.queryByText(/skip/i)).not.toBeInTheDocument();
  });

  it("shows skip button when question is not required", () => {
    const q = { ...baseQuestion, required: false };
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.getByText(/skip for now/i)).toBeInTheDocument();
  });

  it("skip button calls onChange with empty string", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q = { ...baseQuestion, required: false };
    render(<OpenResponseQuestion question={q} value="existing" onChange={onChange} />);

    await user.click(screen.getByText(/skip for now/i));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("displays current value in input", () => {
    render(
      <OpenResponseQuestion question={baseQuestion} value="Current answer" onChange={vi.fn()} />
    );
    expect(screen.getByDisplayValue("Current answer")).toBeInTheDocument();
  });
});
