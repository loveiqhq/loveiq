// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

vi.mock("next/image", () => ({
  default: ({
    alt = "",
    fill: _fill,
    ...props
  }: Record<string, unknown> & { alt?: string; fill?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test-only mock for next/image
    <img {...props} alt={alt} />
  ),
}));

// The Trustpilot widget pulls in env config + consent/bootstrap logic; stub it so
// these tests stay focused on dismiss behaviour.
vi.mock("@shared/ui/trustpilot/TrustpilotReviews", () => ({
  default: () => <div data-testid="trustpilot" />,
}));

// Spy on the analytics helpers so we can assert the experiment events fire.
vi.mock("@features/analytics/client", () => ({
  trackBeginCheckout: vi.fn(),
  trackExperimentCardFlipped: vi.fn(),
  trackPriceShown: vi.fn(),
  trackScrollPaywallDismissed: vi.fn(),
  trackScrollPaywallShown: vi.fn(),
}));

import ScrollPricingModal from "@features/report/ui/ScrollPricingModal";
import { reportThemes } from "@features/report/ui/reportTheme";
import { trackExperimentCardFlipped, trackScrollPaywallShown } from "@features/analytics/client";

const theme = reportThemes["Spark Seeker"]!;

// Minimal quote with a discount (msrp > current) so the discount badge renders.
const discountQuote = {
  currentPriceCents: 999,
  msrpCents: 5900,
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still lets the user proceed via the unlock CTA when not dismissible", () => {
    const { onCheckout } = renderModal({ dismissible: false });
    // The modal repeats the unlock CTA (top / mid / end) — any of them proceeds.
    const ctas = screen.getAllByRole("button", { name: /unlock full report/i });
    expect(ctas.length).toBeGreaterThan(0);
    fireEvent.click(ctas[0]!);
    expect(onCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("ScrollPricingModal — flip deck (treatment)", () => {
  it("keeps the side-by-side grid (no flip) by default", () => {
    renderModal();
    expect(document.querySelector(".rpm-hero-grid")).not.toBeNull();
    expect(document.querySelector(".rpm-flip")).toBeNull();
  });

  it("collapses to a single flip card when flipDeck is set", () => {
    renderModal({ flipDeck: true });
    expect(document.querySelector(".rpm-flip")).not.toBeNull();
    expect(document.querySelector(".rpm-hero-grid")).toBeNull();
    const inner = document.querySelector(".rpm-flip__inner");
    expect(inner).not.toBeNull();
    expect(inner!.className).not.toContain("is-flipped");
  });

  it("flips when the front face is activated, swapping aria-hidden", () => {
    renderModal({ flipDeck: true });
    const front = document.querySelector(".rpm-flip__face--front")!;
    const back = document.querySelector(".rpm-flip__face--back")!;
    // Front visible, back hidden initially.
    expect(front.getAttribute("aria-hidden")).toBeNull();
    expect(back.getAttribute("aria-hidden")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /reveal your offer/i }));

    expect(document.querySelector(".rpm-flip__inner")!.className).toContain("is-flipped");
    expect(front.getAttribute("aria-hidden")).toBe("true");
    expect(back.getAttribute("aria-hidden")).toBeNull();
    // The flip-back control is now on the visible back face.
    expect(screen.getByRole("button", { name: /view your archetype/i })).toBeInTheDocument();
  });

  it("removes the front 'tap to flip' hint once flipped (no Safari backface bleed)", () => {
    renderModal({ flipDeck: true });
    // Hint is present while front-facing…
    expect(screen.getByText("Tap to see your offer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /reveal your offer/i }));
    // …and gone from the DOM once flipped, so it can't render mirrored behind
    // the pricing face on iOS Safari.
    expect(screen.queryByText("Tap to see your offer")).not.toBeInTheDocument();
  });

  it("flips back to the archetype when the back card surface is tapped", () => {
    renderModal({ flipDeck: true });
    fireEvent.click(screen.getByRole("button", { name: /reveal your offer/i }));
    expect(document.querySelector(".rpm-flip__inner")!.className).toContain("is-flipped");
    // Tap the back face surface (not a button) → flips back to the front.
    fireEvent.click(document.querySelector(".rpm-flip__face--back")!);
    expect(document.querySelector(".rpm-flip__inner")!.className).not.toContain("is-flipped");
  });

  it("does not flip back when the unlock CTA on the back is clicked", () => {
    const { onCheckout } = renderModal({ flipDeck: true });
    fireEvent.click(screen.getByRole("button", { name: /reveal your offer/i }));
    // Flip card CTA reads "Unlock your full report" (vs control "Unlock full report").
    fireEvent.click(screen.getByRole("button", { name: /unlock your full report/i }));
    expect(onCheckout).toHaveBeenCalledTimes(1);
    // The CTA click must not bubble into a flip-back — stays on the offer.
    expect(document.querySelector(".rpm-flip__inner")!.className).toContain("is-flipped");
  });

  it("uses the modal-mock pricing content in flip mode", () => {
    renderModal({ flipDeck: true, quote: discountQuote });
    expect(screen.getByText("Full Personal Report")).toBeInTheDocument();
    expect(screen.queryByText("FULL")).not.toBeInTheDocument();
    expect(screen.queryByText("Most popular")).not.toBeInTheDocument();
    expect(screen.queryByText(/no discussions/i)).not.toBeInTheDocument();
    expect(screen.getByText("Unlock your full report")).toBeInTheDocument();
  });

  it("keeps the original pricing content for control", () => {
    renderModal({ flipDeck: false, quote: discountQuote });
    expect(screen.getByText("Most popular")).toBeInTheDocument();
    expect(screen.getByText("FULL")).toBeInTheDocument();
    expect(screen.getByText(/no discussions/i)).toBeInTheDocument();
  });

  it("renders the discount badge white-on-solid-green in flip mode (green-on-dark for control)", () => {
    const { unmount } = renderModal({ flipDeck: true, quote: discountQuote });
    const flipBadge = document.querySelector(".rpm-pricing-badge--discount") as HTMLElement | null;
    expect(flipBadge).not.toBeNull();
    expect(flipBadge!.style.background).toMatch(/rgba\(0,\s*201,\s*80,\s*0?\.63\)/);
    const flipColor = flipBadge!.style.color;
    unmount();

    renderModal({ flipDeck: false, quote: discountQuote });
    const ctrlBadge = document.querySelector(".rpm-pricing-badge--discount") as HTMLElement | null;
    expect(ctrlBadge).not.toBeNull();
    expect(ctrlBadge!.style.background).not.toMatch(/rgba\(0,\s*201,\s*80,\s*0?\.63\)/);
    expect(ctrlBadge!.style.color).not.toBe(flipColor);
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

  it("fires shown for control (non-flip) too", () => {
    renderModal({ flipDeck: false });
    expect(trackScrollPaywallShown).toHaveBeenCalledTimes(1);
  });

  it("records experiment_card_flipped on flip out and back (flip deck only)", () => {
    renderModal({ flipDeck: true });
    fireEvent.click(screen.getByRole("button", { name: /reveal your offer/i }));
    expect(trackExperimentCardFlipped).toHaveBeenNthCalledWith(1, { to: "pricing" });
    fireEvent.click(document.querySelector(".rpm-flip__face--back")!);
    expect(trackExperimentCardFlipped).toHaveBeenNthCalledWith(2, { to: "archetype" });
  });

  it("never records a flip event in control (no flip card)", () => {
    renderModal({ flipDeck: false });
    expect(trackExperimentCardFlipped).not.toHaveBeenCalled();
  });
});
