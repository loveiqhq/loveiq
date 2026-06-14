// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stub the Trustpilot widget so we test the gating, not the widget internals.
vi.mock("@shared/ui/trustpilot/TrustpilotReviews", () => ({
  default: () => <div data-testid="trustpilot" />,
}));

import S15Testimonials from "@features/landing/ui/S15Testimonials";

const KEY = "NEXT_PUBLIC_TRUSTPILOT_ENABLED";

afterEach(() => {
  cleanup();
  delete process.env[KEY];
});

describe("S15Testimonials (dark / control variant)", () => {
  it("shows the original curated testimonials (NOT Trustpilot) when disabled — the default", () => {
    delete process.env[KEY];
    render(<S15Testimonials />);
    // "How it used to be": curated grid with the 30,000+ stat + named reviewers.
    expect(screen.getByText("30,000+")).toBeInTheDocument();
    expect(screen.getByText("Philipp Leonhard, 42")).toBeInTheDocument();
    expect(screen.getByText("4.9/5 Rating")).toBeInTheDocument();
    expect(screen.queryByTestId("trustpilot")).toBeNull();
  });

  it("swaps to the Trustpilot widget when the master switch is on", () => {
    process.env[KEY] = "true";
    render(<S15Testimonials />);
    expect(screen.getAllByTestId("trustpilot").length).toBeGreaterThan(0);
    expect(screen.queryByText("30,000+")).toBeNull();
  });
});
