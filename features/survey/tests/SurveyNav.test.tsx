// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("keeps Enter on a nav button from also reaching the window shortcut", () => {
    // The button acts on Enter through its own click; SurveyEngine's window-level
    // "Enter = next" handler hearing the same press moved the survey twice.
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    try {
      render(
        <SurveyNav
          canGoBack={true}
          canGoNext={true}
          hasAnswer={true}
          onPrevious={vi.fn()}
          onNext={vi.fn()}
        />
      );
      fireEvent.keyDown(screen.getByRole("button", { name: /next/i }), { key: "Enter" });
      fireEvent.keyDown(screen.getByRole("button", { name: /previous/i }), { key: "Enter" });
      expect(onWindowKey).not.toHaveBeenCalled();
      // Other keys still travel: ArrowRight on a focused button is the shortcut's job.
      fireEvent.keyDown(screen.getByRole("button", { name: /next/i }), { key: "ArrowRight" });
      expect(onWindowKey).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", onWindowKey);
    }
  });
});
