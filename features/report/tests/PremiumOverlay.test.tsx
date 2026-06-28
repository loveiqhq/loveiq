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

  it("renders live price, strike, save and discount badge from the quote", () => {
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote({ currentPriceCents: 1499, msrpCents: 4999 })}
        offerDeadline={Date.now() + 180_000}
      />
    );

    expect(screen.getByText("€14.99")).toBeInTheDocument();
    expect(screen.getByText("€49.99")).toBeInTheDocument();
    expect(screen.getByText(/You save €35\.00/)).toBeInTheDocument();
    // 70% off ((4999-1499)/4999 ≈ 70%), shown in the urgency pill.
    expect(screen.getByText(/70% OFF · Expires soon/i)).toBeInTheDocument();
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
    // Countdown still runs (pure urgency), and the CTA is always present.
    expect(screen.getByRole("timer")).toBeInTheDocument();
    expect(screen.getByText(/Expires soon/i)).toBeInTheDocument();
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

  it("drops the “Expires soon” suffix once the countdown has elapsed", () => {
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote({ currentPriceCents: 1499, msrpCents: 4999 })}
        offerDeadline={Date.now() - 10_000}
      />
    );

    // Badge stays (the discount is still valid) but the urgency suffix is gone.
    expect(screen.getByText("70% OFF")).toBeInTheDocument();
    expect(screen.queryByText(/Expires soon/i)).not.toBeInTheDocument();
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

  it("shows the Essentials badge only for the essentials tier", () => {
    const { rerender } = render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Snapshot"
        tier="essentials"
        quote={makeQuote()}
      />
    );
    const group = screen.getByText("Included in").parentElement as HTMLElement;
    expect(within(group).getByText("Essentials")).toBeInTheDocument();
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
