// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SurveyProgress, {
  HEAD_START_PERCENT,
  minutesLeft,
  progressPercent,
} from "@features/survey/ui/SurveyProgress";

afterEach(cleanup);

describe("progressPercent", () => {
  it("starts at 15%, never at 0 (Mark, Figma 2026-09-23)", () => {
    expect(HEAD_START_PERCENT).toBe(15);
    expect(progressPercent(0, 57)).toBe(15);
  });

  it("spreads the other 85% evenly over the questions", () => {
    expect(progressPercent(19, 57)).toBeCloseTo(15 + 85 / 3, 10);
    expect(progressPercent(56, 57)).toBeCloseTo(15 + (85 * 56) / 57, 10);
  });

  it("only ever moves forward as the index rises, and stays inside 15..100", () => {
    let last = -1;
    for (let i = 0; i <= 57; i++) {
      const p = progressPercent(i, 57);
      expect(p).toBeGreaterThan(last);
      expect(p).toBeGreaterThanOrEqual(15);
      expect(p).toBeLessThanOrEqual(100);
      last = p;
    }
    expect(progressPercent(-3, 57)).toBe(15);
    expect(progressPercent(99, 57)).toBe(100);
    expect(progressPercent(0, 0)).toBe(15);
  });
});

describe("minutesLeft", () => {
  it("counts down from 15 minutes over the remaining questions", () => {
    expect(minutesLeft(0, 57)).toBe(15);
    expect(minutesLeft(56, 57)).toBe(1);
    expect(minutesLeft(57, 57)).toBe(0);
  });
});

describe("SurveyProgress", () => {
  it("shows the honest count and the time left", () => {
    render(<SurveyProgress index={0} total={57} />);
    expect(screen.getByText("1/57")).toBeInTheDocument();
    expect(screen.getByText(/~15 min/)).toBeInTheDocument();
  });

  it("fills the bar to the head start on the first question", () => {
    render(<SurveyProgress index={0} total={57} />);
    const bar = screen.getByRole("progressbar", { name: "Survey progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "15");
    expect(bar).toHaveAttribute("aria-valuetext", "Question 1 of 57");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("15%");
  });

  it("moves the bar with the question", () => {
    render(<SurveyProgress index={28} total={57} />);
    const bar = screen.getByRole("progressbar", { name: "Survey progress" });
    expect(screen.getByText("29/57")).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuenow", String(Math.round(15 + (85 * 28) / 57)));
  });
});
