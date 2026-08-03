// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PremiumOverlay from "@features/report/ui/sections/PremiumOverlay";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

/**
 * Build a full-report price quote. Only `currentPriceCents`, `msrpCents` and
 * `currency` drive the card; the rest are filled with realistic defaults so the
 * object satisfies the type without the test caring about them.
 */
function makeQuote(overrides: Partial<ReportPriceQuoteSnapshot> = {}): ReportPriceQuoteSnapshot {
  return {
    id: 1,
    plan: "full_report",
    currency: "EUR",
    experimentGroup: "A",
    basePriceBucket: "A",
    basePriceCents: 1499,
    msrpCents: 4999,
    startingPriceCents: 1499,
    currentPriceCents: 1499,
    initialPriceCents: 1499,
    discountMultiplier: 1,
    discountStep: 0,
    pricingClusterId: "test",
    countryTier: "1",
    countryMultiplier: 1,
    deviceType: "desktop",
    deviceMultiplier: 1,
    trafficSource: "direct",
    trafficMultiplier: 1,
    behavioralBucket: "neutral",
    behavioralMultiplier: 1,
    engagementScore: 0,
    engagementMultiplier: 1,
    reportPreviewViews: 0,
    fantasySignalCount: 0,
    surveyDurationMs: null,
    initialPriceTimestamp: new Date(0).toISOString(),
    expiresAt: new Date(0).toISOString(),
    checkoutStartedAt: null,
    purchasedAt: null,
    viewCount: 0,
    ...overrides,
  } as ReportPriceQuoteSnapshot;
}

describe("PremiumOverlay", () => {
  afterEach(() => cleanup());

  it("shows the user's archetype name in the copy", () => {
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote()}
      />
    );

    expect(screen.getByText("Spark Seeker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock your report/i })).toBeInTheDocument();
  });

  it("renders the inline price and merges the save into the green discount pill", () => {
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote({ currentPriceCents: 1499, msrpCents: 4999 })}
        offerDeadline={Date.now() + 180_000}
      />
    );

    // Inline "MM:SS → €price" row shows the live price; strike sits under "Otherwise".
    expect(screen.getByText("€14.99")).toBeInTheDocument();
    expect(screen.getByText("€49.99")).toBeInTheDocument();
    expect(screen.getByText("Otherwise")).toBeInTheDocument();
    // 70% off ((4999-1499)/4999 ≈ 70%); the "You save" row is merged into the pill.
    expect(screen.getByText(/70% OFF · SAVE €35\.00/i)).toBeInTheDocument();
    expect(screen.queryByText(/You save/i)).not.toBeInTheDocument();
  });

  it("hides the price block when no quote is available but still shows the countdown + CTA", () => {
    render(
      <PremiumOverlay
        archetype="Quiet Withdrawer"
        sectionTitle="About Fantasies"
        tier="full_report"
        quote={null}
        offerDeadline={Date.now() + 180_000}
      />
    );

    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/% OFF/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Otherwise")).not.toBeInTheDocument();
    // Countdown still runs (pure urgency), and the CTA is always present.
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText("Time left to secure this price")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock your report/i })).toBeInTheDocument();
  });

  it("renders a live MM:SS countdown for a future deadline", () => {
    const { container } = render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote()}
        offerDeadline={Date.now() + 180_000}
      />
    );

    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/Offer expires in \d{2}:\d{2}/)
    );

    const digits = Array.from(container.querySelectorAll(".rpm-cd-digits__num")).map(
      (el) => el.textContent
    );
    expect(digits).toHaveLength(2);
    // ~3 minutes remaining — not the expired 00:00 readout.
    expect(digits.join(":")).not.toBe("00:00");
  });

  it("keeps the discount pill and shows 00:00 once the countdown has elapsed", () => {
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote({ currentPriceCents: 1499, msrpCents: 4999 })}
        offerDeadline={Date.now() - 10_000}
      />
    );

    // Pill stays (the discount is still valid); only the timer reads 00:00.
    expect(screen.getByText(/70% OFF · SAVE €35\.00/i)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Offer expires in 00:00");
  });

  it("calls onUnlock when the CTA is clicked", async () => {
    const onUnlock = vi.fn();
    const user = userEvent.setup();
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote()}
        onUnlock={onUnlock}
      />
    );

    await user.click(screen.getByRole("button", { name: /unlock your report/i }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("always shows the Full Report badge (Essentials tier retired)", () => {
    // Pricing 2.0 retired the Essentials tier — every premium section is now
    // labelled "Full Report", regardless of the (legacy) tier prop.
    const { rerender } = render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Snapshot"
        tier="essentials"
        quote={makeQuote()}
      />
    );
    const group = screen.getByText("Included in").parentElement as HTMLElement;
    expect(within(group).queryByText("Essentials")).not.toBeInTheDocument();
    expect(within(group).getByText("Full Report")).toBeInTheDocument();

    rerender(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote()}
      />
    );
    const group2 = screen.getByText("Included in").parentElement as HTMLElement;
    expect(within(group2).queryByText("Essentials")).not.toBeInTheDocument();
    expect(within(group2).getByText("Full Report")).toBeInTheDocument();
  });
});
