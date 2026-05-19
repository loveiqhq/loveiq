// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import GuidancePanel from "@/components/survey/GuidancePanel";
import { makeOpenQuestion } from "@/__tests__/__fixtures__/survey";

afterEach(cleanup);

const baseQuestion = makeOpenQuestion({ qId: "q1", question: "Test question?" });

describe("GuidancePanel", () => {
  it("returns null when neither supportAndGuidance nor howAnswerIsUsed is present", () => {
    const { container } = render(<GuidancePanel question={baseQuestion} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders the Info and guidance section when supportAndGuidance is set", () => {
    const q = { ...baseQuestion, supportAndGuidance: "This is guidance text" };
    render(<GuidancePanel question={q} />);
    expect(screen.getByText("Info and guidance")).toBeInTheDocument();
    expect(screen.getByText("This is guidance text")).toBeInTheDocument();
  });

  it("renders the How this answer will be used section when howAnswerIsUsed is set", () => {
    const q = { ...baseQuestion, howAnswerIsUsed: "Drives scoring for X" };
    render(<GuidancePanel question={q} />);
    expect(screen.getByText("How this answer will be used")).toBeInTheDocument();
    expect(screen.getByText("Drives scoring for X")).toBeInTheDocument();
  });

  it("renders both sections side-by-side when both fields are set", () => {
    const q = {
      ...baseQuestion,
      supportAndGuidance: "Important guidance",
      howAnswerIsUsed: "Used for scoring",
    };
    render(<GuidancePanel question={q} />);
    expect(screen.getByText("Info and guidance")).toBeInTheDocument();
    expect(screen.getByText("Important guidance")).toBeInTheDocument();
    expect(screen.getByText("How this answer will be used")).toBeInTheDocument();
    expect(screen.getByText("Used for scoring")).toBeInTheDocument();
  });

  it("falls back to the legacy comment field when howAnswerIsUsed is missing", () => {
    const q = { ...baseQuestion, comment: "Legacy comment text" };
    render(<GuidancePanel question={q} />);
    expect(screen.getByText("How this answer will be used")).toBeInTheDocument();
    expect(screen.getByText("Legacy comment text")).toBeInTheDocument();
  });

  it("never renders the legacy 'Answer option(s) explained' block, even when answerOptionsExplained is populated", () => {
    const q = {
      ...baseQuestion,
      supportAndGuidance: "Guidance",
      answerOptionsExplained: [
        { option: "Option A", explanation: "Explanation for A" },
        { option: "Option B", explanation: "Explanation for B" },
      ],
    };
    render(<GuidancePanel question={q} />);
    expect(screen.queryByText("Answer option(s) explained")).not.toBeInTheDocument();
    expect(screen.queryByText("Option A")).not.toBeInTheDocument();
    expect(screen.queryByText("Explanation for A")).not.toBeInTheDocument();
  });

  it("never renders an accordion 'Learn more' control", () => {
    const q = {
      ...baseQuestion,
      supportAndGuidance: "Guidance",
      howAnswerIsUsed: "Scoring info",
    };
    render(<GuidancePanel question={q} />);
    expect(screen.queryByRole("button", { name: /learn more about this question/i })).toBeNull();
    expect(screen.queryByText(/tap to explore context/i)).toBeNull();
  });
});
