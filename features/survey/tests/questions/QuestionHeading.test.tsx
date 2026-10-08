// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import QuestionHeading, { questionGuide } from "@features/survey/ui/questions/QuestionHeading";
import { makeOpenQuestion } from "@/__tests__/__fixtures__/survey";

afterEach(cleanup);

const TITLE = "Right now, I feel satisfied with my sex life.";
const base = makeOpenQuestion({ qId: "q1", question: TITLE });

const PURPLE = "text-[#a78bfa]";

describe("QuestionHeading", () => {
  // Figma 11303:174, ready for dev 2026-10-06: the "Answer format guidance" line
  // (node 11592:6080) sits 8px under the guide, Manrope Medium 13.008/18.583, #A78BFA.
  it("draws the answer instruction in purple under the guide", () => {
    const q = {
      ...base,
      supportAndGuidance: "Think about the last one to two months.",
      formatGuidance: "Select how true this statement is for you.",
    };
    render(<QuestionHeading question={q} />);

    const guide = screen.getByText("Think about the last one to two months.");
    const line = screen.getByText("Select how true this statement is for you.");
    expect(line.tagName).toBe("P");
    expect(line).toHaveClass(PURPLE, "text-[13.008px]", "font-medium", "leading-[18.583px]");
    expect(guide).not.toHaveClass(PURPLE);
    expect(guide.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.parentElement).toBe(guide.parentElement);
    expect(line.parentElement).toHaveClass("gap-2");
  });

  it("shows a question with no guide its instruction once, as the instruction", () => {
    // 15001, 15002 and 15003 have no guide; the instruction used to stand in for it.
    const q = { ...base, formatGuidance: "Use your main place of residence." };
    render(<QuestionHeading question={q} />);

    const all = screen.getAllByText("Use your main place of residence.");
    expect(all).toHaveLength(1);
    expect(all[0]).toHaveClass(PURPLE);
    expect(questionGuide(q)).toBe("");
  });

  it("draws no instruction when the question has none", () => {
    const q = { ...base, supportAndGuidance: "Guide only." };
    const { container } = render(<QuestionHeading question={q} />);
    const purple = [...container.querySelectorAll("p")].filter((p) => p.className.includes(PURPLE));
    expect(purple).toHaveLength(0);
    expect(screen.getByText("Guide only.")).toBeInTheDocument();
  });

  it("never repeats the instruction when it is the guide", () => {
    const q = { ...base, guide: "Select one option.", formatGuidance: "Select one option." };
    render(<QuestionHeading question={q} />);
    expect(screen.getAllByText("Select one option.")).toHaveLength(1);
  });

  it("keeps the title a level-2 heading with nothing else inside it", () => {
    // The persona walkers and the e2e walks match the heading's whole text.
    const q = { ...base, supportAndGuidance: "Guide.", formatGuidance: "Instruction." };
    render(<QuestionHeading question={q} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(TITLE);
  });
});
