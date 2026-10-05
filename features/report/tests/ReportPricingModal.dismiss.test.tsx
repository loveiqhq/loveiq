// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dismissed = vi.hoisted(() => vi.fn());
vi.mock("@features/analytics/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/analytics/client")>()),
  trackPaywallDismissed: dismissed,
  trackPriceShown: vi.fn(),
  trackTestimonialInteraction: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn(), register: vi.fn() } }));

import ReportPricingModal from "@features/report/ui/ReportPricingModal";

/** The modal as a page holds it: open until something closes it. */
function Page() {
  const [open, setOpen] = useState(true);
  return (
    <ReportPricingModal
      archetype="Spark Seeker"
      open={open}
      onClose={() => setOpen(false)}
      onUnlock={() => {}}
      quotes={null}
    />
  );
}

beforeEach(() => {
  dismissed.mockClear();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    }
  );
});

afterEach(cleanup);

const reason = () => dismissed.mock.calls.map(([p]) => (p as { source: string }).source);

describe("closing the paywall", () => {
  it("closes on a tap outside the dialog, and says so", () => {
    const { container } = render(<Page />);
    fireEvent.click(container.querySelector(".report-pricing-modal__viewport")!);
    expect(reason()).toEqual(["backdrop"]);
  });

  it("stays open on a tap inside the dialog, which bubbles up through the same element", () => {
    const { container } = render(<Page />);
    fireEvent.click(container.querySelector(".report-pricing-modal__dialog")!);
    expect(reason()).toEqual([]);
  });

  it("names the close button and Escape as themselves", () => {
    const first = render(<Page />);
    fireEvent.click(first.getByRole("button", { name: "Close pricing modal" }));
    expect(reason()).toEqual(["close_button"]);
    first.unmount();
    dismissed.mockClear();
    render(<Page />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(reason()).toEqual(["escape"]);
  });
});
