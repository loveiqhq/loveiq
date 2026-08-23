// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

// Spy on the analytics helpers so we can assert the funnel events fire.
vi.mock("@features/analytics/client", () => ({
  trackBeginCheckout: vi.fn(),
  trackPriceShown: vi.fn(),
  trackScrollPaywallDismissed: vi.fn(),
  trackScrollPaywallShown: vi.fn(),
  trackTestimonialInteraction: vi.fn(),
}));

import ScrollPricingModal from "@features/report/ui/ScrollPricingModal";
import { trackBeginCheckout, trackScrollPaywallShown } from "@features/analytics/client";

// Minimal quote with a discount (msrp > current) so the discount/save pills render.
const discountQuote = {
  currentPriceCents: 999,
  urgencyDeadlineAt: null,
  surchargeCents: 0,
  chargedPriceCents: 999,
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
      userName="Alex"
      quote={null}
      {...props}
    />
  );
  return { onClose, onCheckout, ...utils };
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
});

describe("ScrollPricingModal — pricing view", () => {
  it("opens directly on the pricing view (no dark archetype reveal)", () => {
    renderModal();
    expect(screen.getByText(/your results are in/i)).toBeInTheDocument();
    expect(screen.getByText("Full personal report")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to payment/i })).toBeInTheDocument();
    // The dark archetype reveal is gone.
    expect(screen.queryByText("Your Core Archetype")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /unlock your full report/i })
    ).not.toBeInTheDocument();
  });

  it("checks out from the pricing view, firing begin_checkout", () => {
    const { onCheckout } = renderModal({ quote: discountQuote });
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
    expect(trackBeginCheckout).toHaveBeenCalledTimes(1);
  });

  it("still reaches checkout when not dismissible (forced arm)", () => {
    const { onCheckout } = renderModal({ dismissible: false, quote: discountQuote });
    fireEvent.click(screen.getByRole("button", { name: /continue to payment/i }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });

  it("shows the live discount + save labels from the quote (not Figma placeholders)", () => {
    renderModal({ quote: discountQuote });
    // 5900 → 999 ⇒ ~83% off, save €49.01.
    expect(screen.getByText(/% off · expires soon/i)).toBeInTheDocument();
    expect(screen.getByText(/You save/i)).toBeInTheDocument();
  });
});

describe("ScrollPricingModal — analytics", () => {
  it("fires a single scroll_paywall_shown impression when opened", () => {
    const { rerender } = render(
      <ScrollPricingModal
        open={false}
        onClose={vi.fn()}
        onCheckout={vi.fn()}
        userName="Alex"
        quote={null}
      />
    );
    expect(trackScrollPaywallShown).not.toHaveBeenCalled();

    rerender(
      <ScrollPricingModal
        open
        onClose={vi.fn()}
        onCheckout={vi.fn()}
        userName="Alex"
        quote={null}
      />
    );
    expect(trackScrollPaywallShown).toHaveBeenCalledTimes(1);
    expect(trackScrollPaywallShown).toHaveBeenCalledWith({ surface: "report_scroll_paywall" });
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

  it("counts from the absolute deadline over time (never resets to the full window)", () => {
    vi.useFakeTimers();
    const base = 1_000_000_000_000;
    vi.setSystemTime(base);
    renderModal({ offerDeadline: base + 180_000 });
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Offer expires in 03:00");
    // 30s later the same absolute deadline still governs — it never resets to full.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByRole("timer")).toHaveAttribute("aria-label", "Offer expires in 02:30");
  });
});
