// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach, vi } from "vitest";

const guidanceSpy = vi.hoisted(() => vi.fn());
vi.mock("@features/analytics/client", () => ({ trackSurveyGuidanceExpanded: guidanceSpy }));

import GuidancePanel from "@features/survey/ui/GuidancePanel";
import { makeOpenQuestion } from "@/__tests__/__fixtures__/survey";

afterEach(() => {
  cleanup();
  guidanceSpy.mockClear();
});

const baseQuestion = makeOpenQuestion({ qId: "q1", question: "Test question?" });

describe("GuidancePanel", () => {
  it("returns null when the question has no guidance and no reason", () => {
    const { container } = render(<GuidancePanel question={baseQuestion} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows both rows closed until tapped (Figma 11303:174)", () => {
    const q = { ...baseQuestion, supportAndGuidance: "Guide text", howAnswerIsUsed: "Reason text" };
    render(<GuidancePanel question={q} />);

    const info = screen.getByRole("button", { name: "Info & guidance" });
    const why = screen.getByRole("button", { name: "Why we ask this" });
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(why).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Guide text")).not.toBeVisible();
    expect(screen.getByText("Reason text")).not.toBeVisible();
  });

  it("opens and closes a row, and only that row", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, supportAndGuidance: "Guide text", howAnswerIsUsed: "Reason text" };
    render(<GuidancePanel question={q} />);

    const why = screen.getByRole("button", { name: "Why we ask this" });
    await user.click(why);
    expect(why).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Reason text")).toBeVisible();
    expect(screen.getByText("Guide text")).not.toBeVisible();

    await user.click(why);
    expect(why).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Reason text")).not.toBeVisible();
  });

  it("puts the guide in Info & guidance, plus a separate answer instruction", async () => {
    const user = userEvent.setup();
    const q = {
      ...baseQuestion,
      supportAndGuidance: "Think about the last month.",
      formatGuidance: "Select one option.",
    };
    render(<GuidancePanel question={q} />);
    await user.click(screen.getByRole("button", { name: "Info & guidance" }));
    expect(screen.getByText(/Think about the last month\.\s+Select one option\./)).toBeVisible();
  });

  it("falls back to the instruction alone when there is no guide", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, formatGuidance: "Use your main place of residence." };
    render(<GuidancePanel question={q} />);
    await user.click(screen.getByRole("button", { name: "Info & guidance" }));
    expect(screen.getByText("Use your main place of residence.")).toBeVisible();
  });

  it("falls back to the legacy comment field for Why we ask this", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, comment: "Legacy comment text" };
    render(<GuidancePanel question={q} />);
    expect(screen.queryByRole("button", { name: "Info & guidance" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Why we ask this" }));
    expect(screen.getByText("Legacy comment text")).toBeVisible();
  });

  it("reports each open and close with the question and the row", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, supportAndGuidance: "Guide", howAnswerIsUsed: "Reason" };
    render(<GuidancePanel question={q} />);
    const info = screen.getByRole("button", { name: "Info & guidance" });
    await user.click(info);
    await user.click(info);
    expect(guidanceSpy.mock.calls).toEqual([
      [{ question_id: "q1", section: "info", expanded: true }],
      [{ question_id: "q1", section: "info", expanded: false }],
    ]);
  });

  it("keeps Enter on a row from reaching the survey's Enter-for-next shortcut", () => {
    const q = { ...baseQuestion, supportAndGuidance: "Guide" };
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      render(<GuidancePanel question={q} />);
      fireEvent.keyDown(screen.getByRole("button", { name: "Info & guidance" }), { key: "Enter" });
      expect(onWindowKey).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });

  it("never renders the legacy 'Answer option(s) explained' block", () => {
    const q = {
      ...baseQuestion,
      supportAndGuidance: "Guidance",
      answerOptionsExplained: [{ option: "Option A", explanation: "Explanation for A" }],
    };
    render(<GuidancePanel question={q} />);
    expect(screen.queryByText("Answer option(s) explained")).not.toBeInTheDocument();
    expect(screen.queryByText("Explanation for A")).not.toBeInTheDocument();
  });
});
