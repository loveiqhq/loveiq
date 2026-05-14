// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SurveyHeader from "@features/survey/ui/SurveyHeader";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

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
    expect(screen.getByTitle("Auto-advance is off")).toHaveAttribute("aria-pressed", "false");
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
    expect(screen.getByTitle("Auto-advance is on")).toHaveAttribute("aria-pressed", "true");
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

  it("shows and hides the auto-advance help tooltip on desktop hover", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();

    render(
      <SurveyHeader
        progress={25}
        onPause={vi.fn()}
        autoAdvance={false}
        onToggleAutoAdvance={vi.fn()}
      />
    );

    const helpButton = screen.getByRole("button", { name: /explain auto-advance/i });

    await user.hover(helpButton);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      /automatically move to the next question/i
    );

    await user.unhover(helpButton);
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });

  it("toggles the auto-advance help tooltip on touch without changing the switch state", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    const onToggleAutoAdvance = vi.fn();

    render(
      <SurveyHeader
        progress={25}
        onPause={vi.fn()}
        autoAdvance={false}
        onToggleAutoAdvance={onToggleAutoAdvance}
      />
    );

    const helpButton = screen.getByRole("button", { name: /explain auto-advance/i });

    await user.click(helpButton);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/auto-advance/i);
    expect(onToggleAutoAdvance).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });
  });
});
