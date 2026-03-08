// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach } from "vitest";
import GuidancePanel from "@/components/survey/GuidancePanel";
import type { SurveyQuestion, ChapterIntro } from "@/data/survey-data";

afterEach(cleanup);

const baseQuestion: SurveyQuestion = {
  qId: "q1",
  question: "Test question?",
  answerType: "open",
  chapter: "ch1",
  required: false,
} as SurveyQuestion;

describe("GuidancePanel", () => {
  it("returns null when no guide, comment, or chapterIntro", () => {
    const { container } = render(<GuidancePanel question={baseQuestion} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders toggle button when question has guide", () => {
    const q = { ...baseQuestion, guide: "This is guidance text" };
    render(<GuidancePanel question={q} />);
    expect(
      screen.getByRole("button", { name: /learn more about this question/i })
    ).toBeInTheDocument();
  });

  it("renders toggle button when question has comment", () => {
    const q = { ...baseQuestion, comment: "How this is used" };
    render(<GuidancePanel question={q} />);
    expect(
      screen.getByRole("button", { name: /learn more about this question/i })
    ).toBeInTheDocument();
  });

  it("shows guidance content when toggled open", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, guide: "Important guidance" };
    render(<GuidancePanel question={q} />);

    await user.click(screen.getByRole("button", { name: /learn more about this question/i }));

    expect(screen.getByText("Important guidance")).toBeInTheDocument();
    expect(screen.getByText("User Guidance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide context & guidance/i })).toBeInTheDocument();
  });

  it("hides content when toggled closed", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, guide: "Guidance text" };
    render(<GuidancePanel question={q} />);

    // Open
    await user.click(screen.getByRole("button", { name: /learn more about this question/i }));
    // Close
    await user.click(screen.getByRole("button", { name: /hide context & guidance/i }));

    expect(
      screen.getByRole("button", { name: /learn more about this question/i })
    ).toBeInTheDocument();
  });

  it("shows comment section when question has comment", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, comment: "Used for scoring" };
    render(<GuidancePanel question={q} />);

    await user.click(screen.getByRole("button", { name: /learn more about this question/i }));

    expect(screen.getByText("Used for scoring")).toBeInTheDocument();
    expect(screen.getByText("How this answer will be used")).toBeInTheDocument();
  });

  it("shows background section when chapterIntro provided", async () => {
    const user = userEvent.setup();
    const intro: ChapterIntro = {
      chapter: "Chapter 1",
      text: "Background info",
    } as ChapterIntro;
    render(<GuidancePanel question={baseQuestion} chapterIntro={intro} />);

    await user.click(screen.getByRole("button", { name: /learn more about this question/i }));

    expect(screen.getByText("Background info")).toBeInTheDocument();
    expect(screen.getByText("Background")).toBeInTheDocument();
  });
});
