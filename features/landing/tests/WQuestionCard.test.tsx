// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackStartSurvey = vi.fn();
vi.mock("@features/analytics/client", () => ({
  trackStartSurvey: (...args: unknown[]) => trackStartSurvey(...args),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import WQuestionCard from "@features/landing/ui/white/WQuestionCard";
import { SURVEY_STATE_KEY, LANDING_PREFILL_QID } from "@features/survey/ui/hooks/surveyStorage";

function answer(value: number) {
  const dot = screen
    .getAllByRole("button", { name: /of 7/ })
    .find((el) => (el.getAttribute("aria-label") ?? "").startsWith(`${value} of 7`));
  expect(dot).toBeDefined();
  fireEvent.click(dot as HTMLElement);
}

const cta = () => screen.getByRole("link", { name: /continue to the survey/i });
const draft = () => JSON.parse(localStorage.getItem(SURVEY_STATE_KEY) ?? "{}");

describe("WQuestionCard — landing question hand-off", () => {
  beforeEach(() => {
    localStorage.clear();
    trackStartSurvey.mockClear();
  });
  afterEach(cleanup);

  it("asks exactly one question", () => {
    render(<WQuestionCard location="hero" />);
    expect(screen.getByText("QUESTION 1 OF 59")).toBeInTheDocument();
    expect(screen.getByText("Right now, I feel satisfied with my sex life.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /of 7/ })).toHaveLength(7);
  });

  it("never navigates on its own — the Continue CTA appears instead", () => {
    const { container } = render(<WQuestionCard location="hero" />);

    // Before answering the CTA is inert: aria-hidden (so it has no role at all,
    // hence the raw query) and out of the tab order. Nothing to continue to yet.
    const before = container.querySelector('a[href="/survey"]');
    expect(before).toHaveAttribute("aria-hidden", "true");
    expect(before).toHaveAttribute("tabindex", "-1");

    answer(5);

    expect(cta()).toHaveAttribute("href", "/survey");
    expect(cta()).not.toHaveAttribute("aria-hidden", "true");
    expect(cta()).not.toHaveAttribute("tabindex", "-1");
    // The answer is banked immediately, but nothing has navigated.
    expect(draft().answers[LANDING_PREFILL_QID]).toBe(5);
    expect(trackStartSurvey).not.toHaveBeenCalled();
  });

  it("counts the funnel entry only when Continue is pressed", () => {
    render(<WQuestionCard location="hero" />);
    answer(3);
    fireEvent.click(cta());
    expect(trackStartSurvey).toHaveBeenCalledWith("hero");
  });

  it("lets the visitor change their mind before continuing", () => {
    render(<WQuestionCard location="hero" />);
    answer(2);
    expect(draft().answers[LANDING_PREFILL_QID]).toBe(2);

    answer(6);
    const d = draft();
    expect(d.answers[LANDING_PREFILL_QID]).toBe(6);
    // Still exactly one entry — the survey must skip it once, not twice.
    expect(d.prefilled).toEqual([LANDING_PREFILL_QID]);
  });

  it("marks the question prefilled so the survey skips it", () => {
    render(<WQuestionCard location="hero" />);
    answer(4);
    const d = draft();
    expect(d.prefilled).toEqual([LANDING_PREFILL_QID]);
    expect(typeof d.startedAt).toBe("string");
  });

  it("keeps the question in the flow when a survey is already in progress", () => {
    // Dropping a question from under someone mid-survey would shift every index
    // after it, so the answer is saved but NOT marked prefilled.
    localStorage.setItem(
      SURVEY_STATE_KEY,
      JSON.stringify({ answers: { "00000": "a@b.test" }, currentIndex: 4, startedAt: "2026-01-01" })
    );
    render(<WQuestionCard location="hero" />);
    answer(3);

    const d = draft();
    expect(d.answers[LANDING_PREFILL_QID]).toBe(3);
    expect(d.answers["00000"]).toBe("a@b.test");
    expect(d.prefilled).toEqual([]);
    expect(d.currentIndex).toBe(4);
  });

  it("still reveals the CTA when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    render(<WQuestionCard location="hero" />);
    answer(4);
    expect(cta()).toHaveAttribute("href", "/survey");
    spy.mockRestore();
  });
});
