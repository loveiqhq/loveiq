// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SurveyHeader from "@/components/survey/SurveyHeader";

afterEach(cleanup);

describe("SurveyHeader", () => {
  it("shows progress, remaining time, and toggle state", () => {
    render(
      <SurveyHeader
        progress={50}
        onPause={vi.fn()}
        autoAdvance={false}
        onToggleAutoAdvance={vi.fn()}
      />
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("~8 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("hides the remaining time when progress reaches 100 percent", () => {
    render(
      <SurveyHeader
        progress={100}
        onPause={vi.fn()}
        autoAdvance={true}
        onToggleAutoAdvance={vi.fn()}
      />
    );

    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.queryByText(/~\d+ min/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /auto/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("fires the auto-advance and pause callbacks", async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    const onToggleAutoAdvance = vi.fn();

    render(
      <SurveyHeader
        progress={25}
        onPause={onPause}
        autoAdvance={false}
        onToggleAutoAdvance={onToggleAutoAdvance}
      />
    );

    await user.click(screen.getByTitle("Auto-advance is off"));
    await user.click(screen.getByRole("button", { name: /pause/i }));

    expect(onToggleAutoAdvance).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
  });
});
