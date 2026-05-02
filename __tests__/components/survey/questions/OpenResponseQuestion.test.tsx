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
  guide: "",
  supportAndGuidance: "",
  options: [],
} as SurveyQuestion;

describe("OpenResponseQuestion", () => {
  it("renders question text", () => {
    render(<OpenResponseQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("What is your name?")).toBeInTheDocument();
  });

  it("renders text input with placeholder", () => {
    render(<OpenResponseQuestion question={baseQuestion} value={null} onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Type your answer…")).toBeInTheDocument();
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

    await user.type(screen.getByPlaceholderText("Type your answer…"), "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("renders email input when inputType is email", () => {
    const q = { ...baseQuestion, inputType: "email" } as SurveyQuestion;
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText("Type your answer…");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("autocomplete", "email");
  });

  it("shows character counter", () => {
    render(<OpenResponseQuestion question={baseQuestion} value="hello" onChange={vi.fn()} />);
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
  });

  it("shows purple subtitle for email input type", () => {
    const q = { ...baseQuestion, inputType: "email" } as SurveyQuestion;
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Please enter your email address")).toBeInTheDocument();
  });

  it("shows formatGuidance as subtitle when provided", () => {
    const q = { ...baseQuestion, formatGuidance: "Enter a valid email address." };
    render(<OpenResponseQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("displays current value in input", () => {
    render(
      <OpenResponseQuestion question={baseQuestion} value="Current answer" onChange={vi.fn()} />
    );
    expect(screen.getByDisplayValue("Current answer")).toBeInTheDocument();
  });
});
