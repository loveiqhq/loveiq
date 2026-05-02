// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach } from "vitest";
import GuidancePanel from "@/components/survey/GuidancePanel";
import type { SurveyQuestion } from "@/data/survey-data";

afterEach(cleanup);

const baseQuestion: SurveyQuestion = {
  qId: "q1",
  question: "Test question?",
  answerType: "open",
  chapter: "ch1",
  required: false,
  guide: "",
  supportAndGuidance: "",
  options: [],
} as SurveyQuestion;

describe("GuidancePanel", () => {
  it("returns null when no supportAndGuidance, comment, or answerOptionsExplained", () => {
    const { container } = render(<GuidancePanel question={baseQuestion} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders always-visible support section when question has supportAndGuidance", () => {
    const q = { ...baseQuestion, supportAndGuidance: "This is guidance text" };
    render(<GuidancePanel question={q} />);
    expect(screen.getByText("Support and guidance")).toBeInTheDocument();
    expect(screen.getByText("This is guidance text")).toBeInTheDocument();
  });

  it("renders Learn more button when question has comment", () => {
    const q = { ...baseQuestion, comment: "How this is used" };
    render(<GuidancePanel question={q} />);
    expect(
      screen.getByRole("button", { name: /learn more about this question/i })
    ).toBeInTheDocument();
  });

  it("shows helper text below Learn more button", () => {
    const q = { ...baseQuestion, comment: "How this is used" };
    render(<GuidancePanel question={q} />);
    expect(screen.getByText(/tap to explore context/i)).toBeInTheDocument();
  });

  it("shows insight content when Learn more is clicked", async () => {
    const user = userEvent.setup();
    const q = {
      ...baseQuestion,
      supportAndGuidance: "Important guidance",
      comment: "Used for scoring",
    };
    render(<GuidancePanel question={q} />);

    // Support section is always visible
    expect(screen.getByText("Important guidance")).toBeInTheDocument();

    // Click Learn more to expand insight panel
    await user.click(screen.getByRole("button", { name: /learn more about this question/i }));

    expect(screen.getByText("Used for scoring")).toBeInTheDocument();
    expect(screen.getByText("How this answer will be used")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide details/i })).toBeInTheDocument();
  });

  it("hides insight content when toggled closed", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, comment: "Scoring info" };
    render(<GuidancePanel question={q} />);

    // Open
    await user.click(screen.getByRole("button", { name: /learn more about this question/i }));
    // Close
    await user.click(screen.getByRole("button", { name: /hide details/i }));

    expect(
      screen.getByRole("button", { name: /learn more about this question/i })
    ).toBeInTheDocument();
  });

  it("shows answer options explained cards", async () => {
    const user = userEvent.setup();
    const q = {
      ...baseQuestion,
      answerOptionsExplained: [
        { option: "Option A", explanation: "Explanation for A" },
        { option: "Option B", explanation: "Explanation for B" },
      ],
    };
    render(<GuidancePanel question={q} />);

    await user.click(screen.getByRole("button", { name: /learn more about this question/i }));

    expect(screen.getByText("Answer option(s) explained")).toBeInTheDocument();
    expect(screen.getByText("Option A")).toBeInTheDocument();
    expect(screen.getByText("Explanation for A")).toBeInTheDocument();
    expect(screen.getByText("Option B")).toBeInTheDocument();
    expect(screen.getByText("Explanation for B")).toBeInTheDocument();
  });
});
