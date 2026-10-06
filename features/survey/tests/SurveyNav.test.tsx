// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SurveyNav from "@features/survey/ui/SurveyNav";

afterEach(cleanup);

describe("SurveyNav", () => {
  it("disables navigation buttons when movement is not allowed", () => {
    render(
      <SurveyNav
        canGoBack={false}
        canGoNext={false}
        hasAnswer={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("fires previous and next callbacks when enabled", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();

    render(
      <SurveyNav
        canGoBack={true}
        canGoNext={true}
        hasAnswer={true}
        onPrevious={onPrevious}
        onNext={onNext}
      />
    );

    await user.click(screen.getByRole("button", { name: /previous/i }));
    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // Figma 11303:174, ready for dev 2026-10-06: Previous, the progress and Next share one
  // slim row with a hairline on top (node 11303:219).
  it("draws the progress between Previous and Next, in one row", () => {
    render(
      <SurveyNav
        canGoBack={true}
        canGoNext={true}
        hasAnswer={true}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        progress={<div data-testid="progress" />}
      />
    );

    const prev = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    const progress = screen.getByTestId("progress");
    expect(prev.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(progress.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(progress.parentElement).toHaveClass("min-w-0", "flex-1");

    const nav = screen.getByRole("navigation");
    expect(progress.parentElement?.parentElement).toBe(nav);
    expect(nav).toHaveClass("flex", "items-center", "border-t");
  });

  it("keeps the name Previous where only its arrow shows (phones under 360px)", () => {
    render(
      <SurveyNav
        canGoBack={true}
        canGoNext={false}
        hasAnswer={false}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />
    );
    const prev = screen.getByRole("button", { name: "Previous" });
    expect(prev.textContent).toBe("Previous");
    expect(prev.querySelector("span")).toHaveClass("max-[360px]:sr-only");
  });
});
