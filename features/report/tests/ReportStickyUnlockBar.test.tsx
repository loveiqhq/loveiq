// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/analytics/client", () => ({
  trackStickyUnlockClicked: vi.fn(),
}));

import ReportStickyUnlockBar from "@features/report/ui/ReportStickyUnlockBar";

/**
 * The bar publishes the height it occupies as `--report-unlock-bar-h`, the way
 * ConsentBannerOffset publishes `--liq-consent-h`, so the report's own floating UI
 * can clear it. Its height is not a constant: safe-area padding on a phone, and a
 * stacked card with vw-clamped type between 641 and 1024px.
 */

let heights: { mobile: number; desktop: number };
let resize: (() => void) | null;

beforeEach(() => {
  heights = { mobile: 71, desktop: 0 };
  resize = null;
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.classList.contains("report-sticky-unlock--mobile")) return heights.mobile;
    if (this.classList.contains("report-sticky-unlock--desktop")) return heights.desktop;
    return 0;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: () => void) {
        resize = cb;
      }
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--report-unlock-bar-h");
});

const published = () =>
  document.documentElement.style.getPropertyValue("--report-unlock-bar-h") || null;

describe("ReportStickyUnlockBar", () => {
  it("publishes the height of whichever bar is showing", () => {
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    expect(published()).toBe("71px");
  });

  it("follows the bar as it resizes, e.g. the desktop card taking over", () => {
    render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    heights = { mobile: 0, desktop: 160 };
    resize!();
    expect(published()).toBe("160px");
  });

  it("clears the variable when the bar goes, so nothing keeps clearing a ghost", () => {
    const { unmount } = render(<ReportStickyUnlockBar quote={null} onCheckout={() => {}} />);
    unmount();
    expect(published()).toBeNull();
  });
});
