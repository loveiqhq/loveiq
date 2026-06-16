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

// The 50/50 was concluded → any non-empty token now buckets to the forced
// "treatment" arm. "control" is reached only via a missing token or the dev
// `?arm=` override.
const TREATMENT_TOKEN = "rpt_wizard_test_001";

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
      "Let's open your report.",
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

    expect(screen.getByText("Let's open your report.")).toBeInTheDocument();

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

describe("PreReportWizard — coupled paywall (now forced)", () => {
  it("missing token falls back to control (6 slides)", () => {
    render(<PreReportWizard onComplete={vi.fn()} />);
    expect(screen.getByText("1 / 6")).toBeInTheDocument();
  });

  it("treatment cohort (token present) swaps the final slide for the must-pay one", () => {
    const onComplete = vi.fn();
    render(<PreReportWizard reportToken={TREATMENT_TOKEN} onComplete={onComplete} />);

    // Advance to slide index 4 (5th of 6) — the swapped slide must NOT appear yet
    // (guards against an off-by-one in slides.slice(0, -1)).
    for (let i = 0; i < 4; i++) {
      clickAndFlush(screen.getByRole("button", { name: /continue/i }));
    }
    expect(
      screen.queryByText("Your personalised report is waiting for you.")
    ).not.toBeInTheDocument();

    // One more advance → final slide (index 5) is the swapped report-waiting slide.
    clickAndFlush(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Your personalised report is waiting for you.")).toBeInTheDocument();
    // The neutral "open your report" slide is replaced (gone) in the dark arm.
    expect(screen.queryByText("Let's open your report.")).not.toBeInTheDocument();

    clickAndFlush(screen.getByRole("button", { name: /view your report/i }));
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
