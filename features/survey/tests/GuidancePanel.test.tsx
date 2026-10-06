// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
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
  it("returns null when the question has no reason to give", () => {
    const { container } = render(<GuidancePanel question={baseQuestion} />);
    expect(container.innerHTML).toBe("");
  });

  // Marcus and Mark, LoveIQ Sync 2026-10-06 (Figma 11303:174, marked ready for dev that
  // day): the guidance is shown under the title all the time, so its expander went.
  it("has no Info & guidance row: the guidance alone draws nothing here", () => {
    const q = {
      ...baseQuestion,
      supportAndGuidance: "Guide text",
      formatGuidance: "Select one option.",
    };
    const { container } = render(<GuidancePanel question={q} />);
    expect(screen.queryByRole("button", { name: "Info & guidance" })).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("shows Why we ask this closed until tapped", () => {
    const q = { ...baseQuestion, supportAndGuidance: "Guide text", howAnswerIsUsed: "Reason text" };
    render(<GuidancePanel question={q} />);

    const why = screen.getByRole("button", { name: "Why we ask this" });
    expect(why).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Reason text")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: "Info & guidance" })).toBeNull();
    expect(screen.queryByText("Guide text")).toBeNull();
  });

  it("opens and closes Why we ask this", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, howAnswerIsUsed: "Reason text" };
    render(<GuidancePanel question={q} />);

    const why = screen.getByRole("button", { name: "Why we ask this" });
    await user.click(why);
    expect(why).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Reason text")).toBeVisible();

    await user.click(why);
    expect(why).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Reason text")).not.toBeVisible();
  });

  it("falls back to the legacy comment field for Why we ask this", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, comment: "Legacy comment text" };
    render(<GuidancePanel question={q} />);
    await user.click(screen.getByRole("button", { name: "Why we ask this" }));
    expect(screen.getByText("Legacy comment text")).toBeVisible();
  });

  it("reports each open and close with the question and the row", async () => {
    const user = userEvent.setup();
    const q = { ...baseQuestion, supportAndGuidance: "Guide", howAnswerIsUsed: "Reason" };
    render(<GuidancePanel question={q} />);
    const why = screen.getByRole("button", { name: "Why we ask this" });
    await user.click(why);
    await user.click(why);
    expect(guidanceSpy.mock.calls).toEqual([
      [{ question_id: "q1", section: "why", expanded: true }],
      [{ question_id: "q1", section: "why", expanded: false }],
    ]);
  });

  it("never renders the legacy 'Answer option(s) explained' block", () => {
    const q = {
      ...baseQuestion,
      howAnswerIsUsed: "Reason",
      answerOptionsExplained: [{ option: "Option A", explanation: "Explanation for A" }],
    };
    render(<GuidancePanel question={q} />);
    expect(screen.queryByText("Answer option(s) explained")).not.toBeInTheDocument();
    expect(screen.queryByText("Explanation for A")).not.toBeInTheDocument();
  });
});
