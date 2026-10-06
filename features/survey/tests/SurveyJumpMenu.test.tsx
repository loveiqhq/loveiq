// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SurveyJumpMenu from "@features/survey/ui/SurveyJumpMenu";
import { makeSurveyQuestion } from "@/__tests__/__fixtures__/survey";

/**
 * Staging only — Mark, 30.09: "Is there a way that I can jump to specific questions
 * rather than having to go through the entire survey?" A dropdown of every question the
 * engine asks, in its order and grouped by chapter, that moves the engine to the one
 * picked. SurveyEngine mounts it only off production (SurveyEngine.test.tsx).
 */

const QUESTIONS = [
  makeSurveyQuestion({
    qId: "00001",
    chapter: "Background & Lifestyle",
    question: "How old are you?",
  }),
  makeSurveyQuestion({ qId: "00002", chapter: "Background & Lifestyle", question: "Gender?" }),
  makeSurveyQuestion({
    qId: "01001",
    chapter: "Desire",
    question:
      "When you think about the moments you have felt most desired, which of these was most present for you at the time?",
  }),
  makeSurveyQuestion({
    qId: "00000",
    chapter: "Background & Lifestyle",
    question: "What is your email?",
  }),
];

afterEach(cleanup);

const select = () => screen.getByRole("combobox", { name: "Jump to question" });

describe("SurveyJumpMenu", () => {
  it("lists every question in the engine's order, numbered, with its id", () => {
    render(<SurveyJumpMenu questions={QUESTIONS} currentIndex={0} onJump={vi.fn()} />);
    const labels = within(select())
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual([
      "1. 00001 · How old are you?",
      "2. 00002 · Gender?",
      // Whole words to 64 characters, the trailing comma dropped.
      "3. 01001 · When you think about the moments you have felt most desired…",
      "4. 00000 · What is your email?",
    ]);
  });

  it("groups runs of one chapter as the survey asks them, so a chapter can come back", () => {
    const { container } = render(
      <SurveyJumpMenu questions={QUESTIONS} currentIndex={0} onJump={vi.fn()} />
    );
    const groups = Array.from(container.querySelectorAll("optgroup"), (g) => [
      g.label,
      g.querySelectorAll("option").length,
    ]);
    expect(groups).toEqual([
      ["Background & Lifestyle", 2],
      ["Desire", 1],
      ["Background & Lifestyle", 1],
    ]);
  });

  it("shows the question on screen, and where it sits in the survey", () => {
    render(<SurveyJumpMenu questions={QUESTIONS} currentIndex={2} onJump={vi.fn()} />);
    expect((select() as HTMLSelectElement).value).toBe("2");
    expect(screen.getByText("Staging · Jump to question (3 of 4)")).toBeTruthy();
  });

  it("moves the engine to the question picked", () => {
    const onJump = vi.fn();
    render(<SurveyJumpMenu questions={QUESTIONS} currentIndex={0} onJump={onJump} />);
    fireEvent.change(select(), { target: { value: "3" } });
    expect(onJump).toHaveBeenCalledWith(3);
  });

  it("stays folded until opened, so the page reads as it does for respondents", () => {
    const { container } = render(
      <SurveyJumpMenu questions={QUESTIONS} currentIndex={0} onJump={vi.fn()} />
    );
    const details = container.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.contains(select())).toBe(true);
    expect(details.getAttribute("data-staging-tool")).toBe("survey-jump");
  });
});
