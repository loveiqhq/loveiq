// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach } from "vitest";

import ScaleQuestion from "@features/survey/ui/questions/ScaleQuestion";
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

  it("shows hover-state title as the selected-value label when present", () => {
    const q = {
      ...QUESTION,
      hoverStates: {
        1: "Not at all: lowest possible intensity",
        7: "Completely: peak intensity",
      } as Record<number, string>,
    };
    render(<ScaleQuestion question={q} value={7} onChange={vi.fn()} />);
    expect(screen.getByText("Completely")).toBeInTheDocument();
    cleanup();
    render(<ScaleQuestion question={q} value={1} onChange={vi.fn()} />);
    expect(screen.getByText("Not at all")).toBeInTheDocument();
  });

  it("renders no value label when hover state is absent and value is selected", () => {
    // Without hoverStates the component intentionally shows no value label —
    // the previous JS fallbacks ("Strongly Disagree"/"Strongly Agree") were
    // removed because they aren't in the canonical xlsx source.
    render(<ScaleQuestion question={QUESTION} value={1} onChange={vi.fn()} />);
    expect(screen.queryByText("Strongly Agree")).not.toBeInTheDocument();
    expect(screen.queryByText("Strongly Disagree")).not.toBeInTheDocument();
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

  // Figma 11303:174 — the rings grow toward both ends and shrink to the middle.
  it("sizes the rings largest at the ends and smallest in the middle", () => {
    render(<ScaleQuestion question={QUESTION} value={null} onChange={vi.fn()} />);
    const rings = [1, 2, 3, 4, 5, 6, 7].map((v) =>
      screen.getByRole("button", { name: `${v} of 7` }).style.getPropertyValue("--ring")
    );
    expect(rings).toEqual(["46px", "38px", "31px", "27px", "31px", "38px", "46px"]);
  });

  it("marks only the picked point as pressed", () => {
    render(<ScaleQuestion question={QUESTION} value={5} onChange={vi.fn()} />);
    for (let v = 1; v <= 7; v++) {
      expect(screen.getByRole("button", { name: `${v} of 7` })).toHaveAttribute(
        "aria-pressed",
        String(v === 5)
      );
    }
  });

  it("colours the rings up to the picked point and leaves the rest grey", () => {
    render(<ScaleQuestion question={QUESTION} value={5} onChange={vi.fn()} />);
    const ring = (v: number) =>
      screen.getByRole("button", { name: `${v} of 7` }).firstElementChild!.className;
    for (const v of [1, 2, 3, 4, 5]) expect(ring(v)).toContain("border-[#6b5b95]");
    for (const v of [6, 7]) expect(ring(v)).toContain("border-[rgba(22,16,33,0.16)]");
    // Only the picked ring carries the halo.
    expect(ring(5)).toContain("0_0_0_4px");
    for (const v of [1, 2, 3, 4, 6, 7]) expect(ring(v)).not.toContain("0_0_0_4px");
  });

  it("shows the guide line under the title", () => {
    const q = { ...QUESTION, supportAndGuidance: "Think about the last month." };
    render(<ScaleQuestion question={q} value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Think about the last month.")).toBeInTheDocument();
  });

  it("shows the picked point's title and what it means", () => {
    const q = {
      ...QUESTION,
      hoverStates: { 5: "Slightly true: More satisfying than not." } as Record<number, string>,
    };
    render(<ScaleQuestion question={q} value={5} onChange={vi.fn()} />);
    expect(screen.getByText("Slightly true")).toBeInTheDocument();
    expect(screen.getByText("More satisfying than not.")).toBeInTheDocument();
  });
});
