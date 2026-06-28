// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

// Spy on the analytics helpers so we can assert the funnel events fire.
vi.mock("@features/analytics/client", () => ({
  trackBeginCheckout: vi.fn(),
  trackExperimentCardFlipped: vi.fn(),
  trackPriceShown: vi.fn(),
  trackScrollPaywallDismissed: vi.fn(),
  trackScrollPaywallShown: vi.fn(),
  trackTestimonialInteraction: vi.fn(),
}));

import ScrollPricingModal from "@features/report/ui/ScrollPricingModal";
import { reportThemes } from "@features/report/ui/reportTheme";
import {
  trackBeginCheckout,
  trackExperimentCardFlipped,
  trackScrollPaywallShown,
} from "@features/analytics/client";

const theme = reportThemes["Spark Seeker"]!;

// Minimal quote with a discount (msrp > current) so the discount/save pills render.
const discountQuote = {
  currentPriceCents: 999,
  msrpCents: 5900,
  currency: "EUR",
  basePriceBucket: "A",
  pricingClusterId: "x",
  discountStep: 0,
  experimentGroup: "A",
  initialPriceCents: 999,
} as unknown as NonNullable<ComponentProps<typeof ScrollPricingModal>["quote"]>;

function renderModal(props?: Partial<ComponentProps<typeof ScrollPricingModal>>) {
  const onClose = vi.fn();
  const onCheckout = vi.fn();
  const utils = render(
    <ScrollPricingModal
      open
      onClose={onClose}
      onCheckout={onCheckout}
      archetype="Spark Seeker"
      userName="Alex"
      theme={theme}
      matchScore={86}
      quote={null}
      {...props}
    />
  );
  return { onClose, onCheckout, ...utils };
}

/** Advance to the pricing view from the archetype reveal. */
function goToPricing() {
  fireEvent.click(screen.getByRole("button", { name: /unlock your full report/i }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("ScrollPricingModal — dismissibility", () => {
  it("renders the close button and dismisses on click by default", () => {
    const { onClose } = renderModal();
    const closeBtn = screen.getByText("Close to view report");
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dismisses via Escape and backdrop when dismissible", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    const backdrop = document.querySelector(".report-pricing-modal__backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hides the close button when not dismissible", () => {
    renderModal({ dismissible: false });
    expect(screen.queryByText("Close to view report")).not.toBeInTheDocument();
  });

  it("ignores Escape and backdrop when not dismissible", () => {
    const { onClose } = renderModal({ dismissible: false });
    fireEvent.keyDown(document, { key: "Escape" });
    const backdrop = document.querySelector(".report-pricing-modal__backdrop");
    fireEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still lets the user reach checkout when not dismissible (archetype → pricing → pay)", () => {
    const { onCheckout } = renderModal({ dismissible: false, quote: discountQuote });
    goToPricing();
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it("opens straight on the pricing view when no archetype/theme is provided", () => {
    renderModal({ theme: undefined });
    expect(screen.getByRole("button", { name: /continue to payment/i })).toBeInTheDocument();
    expect(screen.queryByText("Your Core Archetype")).not.toBeInTheDocument();
  });
});

describe("ScrollPricingModal — two-view hero", () => {
  it("starts on the archetype reveal when a theme exists", () => {
    renderModal();
    expect(screen.getByText("Your Core Archetype")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock your full report/i })).toBeInTheDocument();
    // Pricing view not yet shown.
    expect(screen.queryByRole("button", { name: /continue to payment/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Full personal report")).not.toBeInTheDocument();
  });

  it("advances to the pricing view on the unlock CTA (no checkout yet)", () => {
    const { onCheckout } = renderModal({ quote: discountQuote });
    goToPricing();
    expect(onCheckout).not.toHaveBeenCalled();
    expect(screen.getByText("Full personal report")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to payment/i })).toBeInTheDocument();
    // Archetype reveal is gone.
    expect(screen.queryByText("Your Core Archetype")).not.toBeInTheDocument();
  });

  it("checks out from the pricing view, firing begin_checkout", () => {
    const { onCheckout } = renderModal({ quote: discountQuote });
    goToPricing();
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
    expect(trackBeginCheckout).toHaveBeenCalledTimes(1);
  });

  it("branches the heading per view", () => {
    renderModal();
    expect(screen.getByText(/you score highest with the following/i)).toBeInTheDocument();
    goToPricing();
    expect(screen.getByText(/your results are in/i)).toBeInTheDocument();
  });

  it("shows the live discount + save labels from the quote (not Figma placeholders)", () => {
    renderModal({ quote: discountQuote });
    goToPricing();
    // 5900 → 999 ⇒ ~83% off, save €49.01.
    expect(screen.getByText(/% off · expires soon/i)).toBeInTheDocument();
    expect(screen.getByText(/You save/i)).toBeInTheDocument();
  });
});

describe("ScrollPricingModal — experiment analytics", () => {
  it("fires a single scroll_paywall_shown impression when opened (both arms)", () => {
    const { rerender } = render(
      <ScrollPricingModal
        open={false}
        onClose={vi.fn()}
        onCheckout={vi.fn()}
        archetype="Spark Seeker"
        userName="Alex"
        theme={theme}
        matchScore={86}
        quote={null}
      />
    );
    expect(trackScrollPaywallShown).not.toHaveBeenCalled();

    rerender(
      <ScrollPricingModal
        open
        onClose={vi.fn()}
        onCheckout={vi.fn()}
        archetype="Spark Seeker"
        userName="Alex"
        theme={theme}
        matchScore={86}
        quote={null}
      />
    );
    expect(trackScrollPaywallShown).toHaveBeenCalledTimes(1);
    expect(trackScrollPaywallShown).toHaveBeenCalledWith({ surface: "report_scroll_paywall" });
  });

  it("records experiment_card_flipped on advance to pricing (treatment only)", () => {
    renderModal({ flipDeck: true });
    goToPricing();
    expect(trackExperimentCardFlipped).toHaveBeenCalledTimes(1);
    expect(trackExperimentCardFlipped).toHaveBeenCalledWith({ to: "pricing" });
  });

  it("never records a flip event for control", () => {
    renderModal({ flipDeck: false });
    goToPricing();
    expect(trackExperimentCardFlipped).not.toHaveBeenCalled();
  });
});

describe("ScrollPricingModal — countdown", () => {
  it("renders the deadline as MM:SS in the sticky-bar pill", () => {
    vi.useFakeTimers();
    const base = 1_000_000_000_000;
    vi.setSystemTime(base);
    renderModal({ offerDeadline: base + 180_000 });
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Offer expires in 03:00");
  });

  it("ticks down each second", () => {
    vi.useFakeTimers();
    const base = 1_000_000_000_000;
    vi.setSystemTime(base);
    renderModal({ offerDeadline: base + 180_000 });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Offer expires in 02:59");
  });

  it("clamps to 00:00 when the deadline has already passed", () => {
    vi.useFakeTimers();
    const base = 1_000_000_000_000;
    vi.setSystemTime(base);
    renderModal({ offerDeadline: base - 5_000 });
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Offer expires in 00:00");
  });

  it("keeps counting from the absolute deadline across a reopen (no reset to 3:00)", () => {
    vi.useFakeTimers();
    const base = 1_000_000_000_000;
    vi.setSystemTime(base);
    const deadline = base + 180_000;
    const { rerender } = render(
      <ScrollPricingModal
        open
        onClose={vi.fn()}
        onCheckout={vi.fn()}
        archetype="Spark Seeker"
        userName="Alex"
        theme={theme}
        matchScore={86}
        quote={null}
        offerDeadline={deadline}
      />
    );
    // Close, let 30s pass, reopen — the same deadline still governs.
    rerender(
      <ScrollPricingModal
        open={false}
        onClose={vi.fn()}
        onCheckout={vi.fn()}
        archetype="Spark Seeker"
        userName="Alex"
        theme={theme}
        matchScore={86}
        quote={null}
        offerDeadline={deadline}
      />
    );
    act(() => {
      vi.setSystemTime(base + 30_000);
    });
    rerender(
      <ScrollPricingModal
        open
        onClose={vi.fn()}
        onCheckout={vi.fn()}
        archetype="Spark Seeker"
        userName="Alex"
        theme={theme}
        matchScore={86}
        quote={null}
        offerDeadline={deadline}
      />
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Offer expires in 02:30");
  });
});
