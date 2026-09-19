// @vitest-environment jsdom
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
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
    chargedPriceCents: 1499,
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

  it("carries only the copy Figma's card carries", () => {
    // 8993:19140 holds exactly: the "Premium content" heading, the offer block, the
    // two reassurance rows and the button. The line that used to sit under the
    // heading ("This section is part of the full Spark Seeker report. Unlock it to
    // keep reading.") was ours, not the design's, and is gone — along with the
    // archetype name, which appeared nowhere else on the card.
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote()}
      />
    );

    expect(screen.getByText("Premium content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock your report/i })).toBeInTheDocument();
    expect(screen.queryByText("Spark Seeker")).not.toBeInTheDocument();
    expect(screen.queryByText(/part of the full/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/keep reading/i)).not.toBeInTheDocument();
  });

  it("renders the inline price and merges the save into the green discount pill", () => {
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote({ currentPriceCents: 1499, chargedPriceCents: 1499, msrpCents: 4999 })}
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

  it("hides the price block when no quote is available but still shows the CTA", () => {
    render(
      <PremiumOverlay
        archetype="Quiet Withdrawer"
        sectionTitle="About Fantasies"
        tier="full_report"
        quote={null}
      />
    );

    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
    expect(screen.queryByText(/% OFF/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Otherwise")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock your report/i })).toBeInTheDocument();
  });

  it("shows no countdown — the urgency timer is gone", () => {
    // The card used to print "Time left to secure this price" over a 3-minute
    // countdown, and expiry added 2 EUR to every plan. Both were removed on
    // 2026-08-31, so nothing on this card may imply a deadline.
    render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote({ currentPriceCents: 1499, chargedPriceCents: 1499, msrpCents: 4999 })}
      />
    );

    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText(/time left/i)).not.toBeInTheDocument();
    // The price and the discount pill are unaffected.
    expect(screen.getByText("€14.99")).toBeInTheDocument();
    expect(screen.getByText(/70% OFF · SAVE €35\.00/i)).toBeInTheDocument();
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

  it("carries no tier badge row at all", () => {
    // The card used to label every locked section "Included in — Full Report".
    // It was dropped (2026-08-17) because the row restated what the button below
    // it already says, and on a phone it pushed the price out of the card. The
    // legacy `tier` prop stays on the type; nothing renders from it.
    const { rerender } = render(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Snapshot"
        tier="essentials"
        quote={makeQuote()}
      />
    );
    expect(screen.queryByText("Included in")).not.toBeInTheDocument();
    expect(screen.queryByText("Essentials")).not.toBeInTheDocument();

    rerender(
      <PremiumOverlay
        archetype="Spark Seeker"
        sectionTitle="Arousal, Desire & Pleasure"
        tier="full_report"
        quote={makeQuote()}
      />
    );
    expect(screen.queryByText("Included in")).not.toBeInTheDocument();
  });
});

/**
 * The paywall card read as one clickable unit and only its button was wired, so
 * every tap that missed the button was a pricing view we never got. Measured on
 * production: `div.report-premium-overlay` tapped dead in 25 sessions, its card
 * in 15, its offer row in 15, its feature titles and subtitles in 8 each.
 *
 * Same defect as the Insight Map rows and the featured card — on the one
 * surface that decides revenue.
 */
describe("the whole paywall overlay activates", () => {
  function renderOverlay() {
    const onUnlock = vi.fn();
    const { container } = render(
      <PremiumOverlay
        archetype="Spiritual Lover"
        sectionTitle="Typical Beliefs"
        tier="full_report"
        onUnlock={onUnlock}
        quote={makeQuote()}
      />
    );
    return { onUnlock, container };
  }

  it("opens the paywall when the OVERLAY backdrop is tapped", async () => {
    const { onUnlock, container } = renderOverlay();
    await userEvent.click(container.querySelector(".report-premium-overlay") as HTMLElement);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("opens it when the CARD body is tapped", async () => {
    const { onUnlock, container } = renderOverlay();
    await userEvent.click(container.querySelector(".report-premium-overlay__card") as HTMLElement);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("opens it from a feature row — 8 sessions died on exactly this", async () => {
    const { onUnlock, container } = renderOverlay();
    const feature =
      container.querySelector(".report-premium-overlay__feature-title") ??
      container.querySelector(".report-premium-overlay__features") ??
      container.querySelector(".report-premium-overlay__head");
    expect(feature).not.toBeNull();
    await userEvent.click(feature as HTMLElement);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("fires EXACTLY ONCE when the CTA itself is tapped — no double modal", async () => {
    const { onUnlock, container } = renderOverlay();
    await userEvent.click(container.querySelector(".report-premium-overlay__cta") as HTMLElement);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("still activates by KEYBOARD on the CTA", async () => {
    // Removing the button's own onClick must cost keyboard users nothing:
    // Enter fires a click that bubbles to the overlay.
    const { onUnlock, container } = renderOverlay();
    const cta = container.querySelector(".report-premium-overlay__cta") as HTMLElement;
    cta.focus();
    expect(document.activeElement).toBe(cta);
    await userEvent.keyboard("{Enter}");
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("ignores a tap that carried a text selection", async () => {
    const { onUnlock, container } = renderOverlay();
    const spy = vi
      .spyOn(window, "getSelection")
      .mockReturnValue({ toString: () => "14-day money-back" } as unknown as Selection);
    try {
      await userEvent.click(
        container.querySelector(".report-premium-overlay__card") as HTMLElement
      );
      expect(onUnlock).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps the CTA a real button for screen readers", () => {
    const { container } = renderOverlay();
    const cta = container.querySelector(".report-premium-overlay__cta") as HTMLElement;
    expect(cta.tagName).toBe("BUTTON");
    // The wrapper must not become a competing interactive element.
    const overlay = container.querySelector(".report-premium-overlay") as HTMLElement;
    expect(overlay.getAttribute("role")).toBeNull();
    expect(overlay.getAttribute("tabindex")).toBeNull();
  });
});
