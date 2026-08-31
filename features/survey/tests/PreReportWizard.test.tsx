// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    unoptimized: _unoptimized,
    ...props
  }: Record<string, unknown> & { alt?: string; unoptimized?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test-only mock for next/image
    <img {...props} alt={alt} />
  ),
}));

import PreReportWizard from "@features/survey/ui/PreReportWizard";

/** Click a button and flush the 200ms leave-animation timer. */
function clickAndFlush(button: HTMLElement) {
  fireEvent.click(button);
  act(() => {
    vi.advanceTimersByTime(250);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("PreReportWizard", () => {
  it("renders first slide heading on mount", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    expect(screen.getByText("A note before you explore your report.")).toBeInTheDocument();
  });

  it("back button is hidden on first slide", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    const backButton = screen.getByRole("button", { name: /previous slide/i });
    expect(backButton.parentElement).toHaveClass("pointer-events-none");
    expect(backButton.parentElement).toHaveClass("opacity-0");
  });

  it("continue button advances to next slide", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);

    clickAndFlush(screen.getByRole("button", { name: /continue to next slide/i }));

    expect(screen.getByText("Take only what resonates.")).toBeInTheDocument();
  });

  it("shows correct heading for each of the 6 slides", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);

    const headings = [
      "A note before you explore your report.",
      "Take only what resonates.",
      "Rate each report section.",
      "Share your report with someone you care about.",
      "Invite your friends to grow.",
      "Your personalised report is waiting for you.",
    ];

    expect(screen.getByText(headings[0])).toBeInTheDocument();

    for (let i = 1; i < headings.length; i++) {
      clickAndFlush(screen.getByRole("button", { name: /continue/i }));
      expect(screen.getByText(headings[i])).toBeInTheDocument();
    }
  });

  it("skip button calls onComplete", () => {
    const onComplete = vi.fn();
    render(<PreReportWizard onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: /skip intro/i }));
    // Exit animation delay (600ms) before onComplete fires
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("continue on last slide calls onComplete", () => {
    const onComplete = vi.fn();
    render(<PreReportWizard onComplete={onComplete} />);

    // Navigate to last slide (index 5)
    for (let i = 0; i < 5; i++) {
      clickAndFlush(screen.getByRole("button", { name: /continue/i }));
    }

    expect(screen.getByText("Your personalised report is waiting for you.")).toBeInTheDocument();

    // Click continue on last slide — 250ms leave animation + 600ms exit fade
    clickAndFlush(screen.getByRole("button", { name: /view your report/i }));
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("progress bar shows correct step count", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);

    expect(screen.getByText("1 / 6")).toBeInTheDocument();

    clickAndFlush(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByText("2 / 6")).toBeInTheDocument();
  });

  it("back button becomes visible after advancing past first slide", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);

    clickAndFlush(screen.getByRole("button", { name: /continue/i }));

    const backButton = screen.getByRole("button", { name: /previous slide/i });
    expect(backButton.parentElement).not.toHaveClass("pointer-events-none");
    expect(backButton.parentElement).toHaveClass("opacity-100");
  });
});

/**
 * The wizard used to have two endings: a neutral "Let's open your report." for
 * the control arm and this must-pay one for the forced-paywall treatment arm,
 * swapped in by report token. The A/B was removed on 2026-08-31 and the must-pay
 * copy kept as the single ending, so the wizard no longer branches at all.
 */
describe("PreReportWizard — single ending", () => {
  it("always ends on the must-pay slide, with or without a report token", () => {
    for (const props of [{}, { reportToken: "rpt_wizard_test_001" }]) {
      render(<PreReportWizard onComplete={vi.fn()} {...props} />);
      expect(screen.getByText("1 / 6")).toBeInTheDocument();
      for (let i = 0; i < 5; i++) {
        clickAndFlush(screen.getAllByRole("button", { name: /continue/i })[0]!);
      }
      expect(screen.getByText("Your personalised report is waiting for you.")).toBeInTheDocument();
      // The neutral ending is gone entirely — it is not reachable by any path.
      expect(screen.queryByText("Let's open your report.")).not.toBeInTheDocument();
      cleanup();
    }
  });
});
